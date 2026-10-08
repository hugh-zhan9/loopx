import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, realpath, rename, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PARALLEL_SCHEMA_IDS = Object.freeze({
  plan: 'loopx.parallel-plan.v1',
  task: 'loopx.parallel-task.v1',
  package: 'loopx.parallel-package.v1',
  manifest: 'loopx.parallel-exec-manifest.v1',
});

const PLAN_FIELDS = ['schema', 'max_parallel'];
const TASK_FIELDS = ['schema', 'task_anchor', 'depends_on', 'write_scope', 'parallel_safe'];
const PACKAGE_FIELDS = ['schema', 'max_parallel', 'plans'];
const PACKAGE_PLAN_FIELDS = ['path', 'depends_on', 'can_run_in_parallel'];
const MANIFEST_FIELDS = ['schema', 'scope', 'input', 'max_parallel', 'plans'];
const MANIFEST_INPUT_FIELDS = ['path', 'sha256'];
const MANIFEST_PLAN_FIELDS = ['path', 'sha256', 'depends_on', 'can_run_in_parallel', 'tasks'];
const GLOB_PATTERN = /[*?\[\]{}]/;
const DIRECT_CHILD_PATTERN = /^\d{2}-[a-z0-9][a-z0-9-]*\.md$/;

class ParallelContractError extends Error {
  constructor(code, message, details = null) {
    super(message);
    this.name = 'ParallelContractError';
    this.code = code;
    this.details = details;
  }
}

function fail(code, message, details = null) {
  throw new ParallelContractError(code, message, details);
}

function assertPlainObject(value, code, label) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    fail(code, `${label} must be an object`);
  }
}

function assertExactFields(value, fields, label) {
  assertPlainObject(value, 'parallel_schema_invalid', label);
  const allowed = new Set(fields);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      fail('parallel_unknown_field', `${label} contains unknown field: ${key}`, { field: key });
    }
  }
  for (const key of fields) {
    if (!Object.hasOwn(value, key)) {
      fail('parallel_field_missing', `${label} is missing field: ${key}`, { field: key });
    }
  }
}

function assertSchema(value, expected, label) {
  if (value !== expected) {
    fail('parallel_schema_unsupported', `${label} schema must be ${expected}`, { observed: value, expected });
  }
}

function assertPositiveInteger(value, label) {
  if (!Number.isInteger(value) || value < 1) {
    fail('parallel_max_parallel_invalid', `${label} must be a positive integer`);
  }
}

function parseFence(text, name, label) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`^\\x60\\x60\\x60${escaped}\\n([\\s\\S]*?)\\n\\x60\\x60\\x60[ \\t]*$`, 'gm');
  const matches = [...text.matchAll(pattern)];
  if (matches.length === 0) {
    fail('parallel_fence_missing', `${label} is missing ${name}`);
  }
  if (matches.length > 1) {
    fail('parallel_fence_duplicate', `${label} contains duplicate ${name}`);
  }
  try {
    return JSON.parse(matches[0][1]);
  } catch (error) {
    fail('parallel_json_invalid', `${label} contains invalid JSON: ${error.message}`);
  }
}

function hashText(text) {
  return createHash('sha256').update(text).digest('hex');
}

function isInside(root, target) {
  const value = relative(root, target);
  return value === '' || (!value.startsWith(`..${sep}`) && value !== '..' && !isAbsolute(value));
}

function normalizedRepoPath(value, label) {
  if (typeof value !== 'string' || value.length === 0 || isAbsolute(value) || value.includes('\\')) {
    fail('parallel_write_scope_invalid', `${label} must be a normalized repository-relative path`, { path: value });
  }
  const segments = value.split('/');
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..') || GLOB_PATTERN.test(value)) {
    fail('parallel_write_scope_invalid', `${label} contains traversal, empty segments, or glob syntax`, { path: value });
  }
  return segments.join('/');
}

async function assertNoRealpathEscape(repoRoot, repoPath, code = 'parallel_write_scope_invalid') {
  let candidate = resolve(repoRoot, repoPath);
  while (!existsSync(candidate)) {
    const parent = dirname(candidate);
    if (parent === candidate) {
      fail(code, `cannot resolve path ancestor: ${repoPath}`);
    }
    candidate = parent;
  }
  const resolved = await realpath(candidate);
  if (!isInside(repoRoot, resolved)) {
    fail(code, `path escapes repository through realpath: ${repoPath}`, { path: repoPath });
  }
}

async function normalizeInputPath(inputPath, repoRoot) {
  if (typeof inputPath !== 'string' || inputPath.length === 0) {
    fail('parallel_input_invalid', 'input path is required');
  }
  let absolute = resolve(repoRoot, inputPath);
  if (!existsSync(absolute)) {
    fail('parallel_input_missing', `input path does not exist: ${inputPath}`);
  }
  if ((await stat(absolute)).isDirectory()) {
    absolute = resolve(absolute, '00-overview.md');
    if (!existsSync(absolute)) {
      fail('parallel_input_missing', `package directory is missing 00-overview.md: ${inputPath}`);
    }
  }
  absolute = await realpath(absolute);
  if (!isInside(repoRoot, absolute)) {
    fail('parallel_input_outside_repo', `input path is outside repository: ${inputPath}`);
  }
  return {
    absolute,
    relative: relative(repoRoot, absolute).split(sep).join('/'),
  };
}

function validateUniqueStrings(values, code, label) {
  if (!Array.isArray(values) || values.some((value) => typeof value !== 'string')) {
    fail(code, `${label} must be an array of strings`);
  }
  if (new Set(values).size !== values.length) {
    fail(code, `${label} must not contain duplicates`);
  }
}

function validateDag(nodes, { id, dependencies }) {
  const ids = new Set(nodes.map(id));
  if (ids.size !== nodes.length) {
    fail('parallel_dependency_duplicate_node', 'DAG node identifiers must be unique');
  }
  for (const node of nodes) {
    const nodeId = id(node);
    const deps = dependencies(node);
    validateUniqueStrings(deps, 'parallel_dependency_invalid', `${nodeId} dependencies`);
    for (const dependency of deps) {
      if (dependency === nodeId) {
        fail('parallel_dependency_self', `${nodeId} depends on itself`);
      }
      if (!ids.has(dependency)) {
        fail('parallel_dependency_missing', `${nodeId} depends on missing node ${dependency}`);
      }
    }
  }

  const visited = new Set();
  const active = new Set();
  function visit(nodeId) {
    if (active.has(nodeId)) {
      fail('parallel_dependency_cycle', `dependency cycle includes ${nodeId}`);
    }
    if (visited.has(nodeId)) {
      return;
    }
    active.add(nodeId);
    const node = nodes.find((candidate) => id(candidate) === nodeId);
    for (const dependency of dependencies(node)) {
      visit(dependency);
    }
    active.delete(nodeId);
    visited.add(nodeId);
  }
  for (const node of nodes) {
    visit(id(node));
  }
}

function reaches(nodesById, start, target, dependencies) {
  const stack = [...dependencies(nodesById.get(start))];
  const seen = new Set();
  while (stack.length > 0) {
    const current = stack.pop();
    if (current === target) {
      return true;
    }
    if (seen.has(current)) {
      continue;
    }
    seen.add(current);
    stack.push(...dependencies(nodesById.get(current)));
  }
  return false;
}

function assertNoConcurrentOverlap(nodes, { id, dependencies, paths, parallel }) {
  const nodesById = new Map(nodes.map((node) => [id(node), node]));
  for (let leftIndex = 0; leftIndex < nodes.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < nodes.length; rightIndex += 1) {
      const left = nodes[leftIndex];
      const right = nodes[rightIndex];
      if (!parallel(left) || !parallel(right)) {
        continue;
      }
      const leftId = id(left);
      const rightId = id(right);
      if (reaches(nodesById, leftId, rightId, dependencies) || reaches(nodesById, rightId, leftId, dependencies)) {
        continue;
      }
      const rightPaths = new Set(paths(right));
      const overlap = paths(left).filter((path) => rightPaths.has(path));
      if (overlap.length > 0) {
        fail('parallel_write_scope_overlap', `${leftId} and ${rightId} have unordered write overlap`, {
          nodes: [leftId, rightId],
          paths: overlap,
        });
      }
    }
  }
}

function stripLineRange(value) {
  return value.replace(/:\d+(?:-\d+)?$/, '');
}

function parseFiles(taskText, taskAnchor) {
  const marker = '**Files:**\n';
  const start = taskText.indexOf(marker);
  if (start === -1) {
    fail('parallel_files_missing', `${taskAnchor} is missing Files`);
  }
  const bodyStart = start + marker.length;
  const nextSection = taskText.indexOf('\n\n**', bodyStart);
  const nextTask = taskText.indexOf('\n### ', bodyStart);
  const candidates = [nextSection, nextTask].filter((value) => value !== -1);
  const end = candidates.length > 0 ? Math.min(...candidates) : taskText.length;
  const body = taskText.slice(bodyStart, end);
  const entries = [];
  for (const line of body.split('\n')) {
    const entry = line.match(/^- (Create|Modify|Test): `([^`]+)`$/);
    if (entry) {
      entries.push({ action: entry[1], path: stripLineRange(entry[2]) });
    }
  }
  if (entries.length === 0) {
    fail('parallel_files_missing', `${taskAnchor} Files contains no recognized entries`);
  }
  return entries;
}

async function validateWriteScope(values, repoRoot, label) {
  validateUniqueStrings(values, 'parallel_write_scope_invalid', label);
  if (values.length === 0) {
    fail('parallel_write_scope_invalid', `${label} must not be empty`);
  }
  const result = [];
  for (const value of values) {
    const normalized = normalizedRepoPath(value, label);
    await assertNoRealpathEscape(repoRoot, normalized);
    result.push(normalized);
  }
  return result;
}

async function parsePlan({ absolutePath, repoPath, repoRoot }) {
  const text = await readFile(absolutePath, 'utf8');
  const planMetadata = parseFence(text, 'loopx-parallel-plan', repoPath);
  assertExactFields(planMetadata, PLAN_FIELDS, `${repoPath} plan metadata`);
  assertSchema(planMetadata.schema, PARALLEL_SCHEMA_IDS.plan, `${repoPath} plan`);
  assertPositiveInteger(planMetadata.max_parallel, `${repoPath} max_parallel`);

  const headings = [...text.matchAll(/^### (T-\d{3}) \/ Task \d+:.*$/gm)];
  if (headings.length === 0) {
    fail('parallel_task_missing', `${repoPath} contains no anchored tasks`);
  }
  const tasks = [];
  for (let index = 0; index < headings.length; index += 1) {
    const heading = headings[index];
    const anchor = heading[1];
    const end = headings[index + 1]?.index ?? text.length;
    const taskText = text.slice(heading.index, end);
    const metadata = parseFence(taskText, 'loopx-parallel-task', `${repoPath}#${anchor}`);
    assertExactFields(metadata, TASK_FIELDS, `${repoPath}#${anchor} task metadata`);
    assertSchema(metadata.schema, PARALLEL_SCHEMA_IDS.task, `${repoPath}#${anchor}`);
    if (metadata.task_anchor !== anchor) {
      fail('parallel_task_anchor_mismatch', `${repoPath} heading ${anchor} does not match ${metadata.task_anchor}`);
    }
    if (!/^T-\d{3}$/.test(metadata.task_anchor)) {
      fail('parallel_task_anchor_invalid', `${repoPath} contains invalid task anchor ${metadata.task_anchor}`);
    }
    if (typeof metadata.parallel_safe !== 'boolean') {
      fail('parallel_parallel_safe_invalid', `${repoPath}#${anchor} parallel_safe must be boolean`);
    }
    validateUniqueStrings(metadata.depends_on, 'parallel_dependency_invalid', `${repoPath}#${anchor} dependencies`);
    const writeScope = await validateWriteScope(metadata.write_scope, repoRoot, `${repoPath}#${anchor} write_scope`);
    const fileEntries = parseFiles(taskText, anchor);
    const writableFiles = fileEntries
      .filter(({ action }) => action === 'Create' || action === 'Modify')
      .map(({ path }) => normalizedRepoPath(path, `${repoPath}#${anchor} Files`));
    const readOnlyFiles = new Set(fileEntries
      .filter(({ action }) => action === 'Test')
      .map(({ path }) => normalizedRepoPath(path, `${repoPath}#${anchor} Files`)));
    const scopeSet = new Set(writeScope);
    const filesMatch = writableFiles.length === scopeSet.size
      && writableFiles.every((path) => scopeSet.has(path))
      && writeScope.every((path) => !readOnlyFiles.has(path));
    if (!filesMatch) {
      fail('parallel_write_scope_files_mismatch', `${repoPath}#${anchor} write_scope does not match Create/Modify Files`, {
        write_scope: writeScope,
        writable_files: writableFiles,
        test_files: [...readOnlyFiles],
      });
    }
    tasks.push({
      schema: PARALLEL_SCHEMA_IDS.task,
      task_anchor: metadata.task_anchor,
      depends_on: [...metadata.depends_on],
      write_scope: writeScope,
      parallel_safe: metadata.parallel_safe,
    });
  }

  validateDag(tasks, { id: (task) => task.task_anchor, dependencies: (task) => task.depends_on });
  assertNoConcurrentOverlap(tasks, {
    id: (task) => task.task_anchor,
    dependencies: (task) => task.depends_on,
    paths: (task) => task.write_scope,
    parallel: (task) => task.parallel_safe,
  });

  return {
    maxParallel: planMetadata.max_parallel,
    sha256: hashText(text),
    tasks,
  };
}

function validatePackageMetadata(value) {
  assertExactFields(value, PACKAGE_FIELDS, 'package metadata');
  assertSchema(value.schema, PARALLEL_SCHEMA_IDS.package, 'package');
  assertPositiveInteger(value.max_parallel, 'package max_parallel');
  if (!Array.isArray(value.plans) || value.plans.length === 0) {
    fail('parallel_package_plans_invalid', 'package plans must be a non-empty array');
  }
  for (const [index, plan] of value.plans.entries()) {
    assertExactFields(plan, PACKAGE_PLAN_FIELDS, `package plans[${index}]`);
    if (typeof plan.path !== 'string') {
      fail('parallel_package_path_invalid', `package plans[${index}].path must be a string`);
    }
    validateUniqueStrings(plan.depends_on, 'parallel_dependency_invalid', `package plans[${index}] dependencies`);
    if (typeof plan.can_run_in_parallel !== 'boolean') {
      fail('parallel_package_parallel_invalid', `package plans[${index}].can_run_in_parallel must be boolean`);
    }
  }
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) {
      deepFreeze(child);
    }
  }
  return value;
}

function validateHash(value, label) {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) {
    fail('parallel_manifest_invalid', `${label} must be a lowercase sha256`);
  }
}

export function validateParallelManifest(manifest) {
  assertExactFields(manifest, MANIFEST_FIELDS, 'manifest');
  assertSchema(manifest.schema, PARALLEL_SCHEMA_IDS.manifest, 'manifest');
  if (manifest.scope !== 'single-plan' && manifest.scope !== 'package') {
    fail('parallel_manifest_invalid', 'manifest scope must be single-plan or package');
  }
  assertExactFields(manifest.input, MANIFEST_INPUT_FIELDS, 'manifest input');
  normalizedRepoPath(manifest.input.path, 'manifest input path');
  validateHash(manifest.input.sha256, 'manifest input sha256');
  assertPositiveInteger(manifest.max_parallel, 'manifest max_parallel');
  if (!Array.isArray(manifest.plans) || manifest.plans.length === 0) {
    fail('parallel_manifest_invalid', 'manifest plans must be non-empty');
  }
  for (const [planIndex, plan] of manifest.plans.entries()) {
    assertExactFields(plan, MANIFEST_PLAN_FIELDS, `manifest plans[${planIndex}]`);
    normalizedRepoPath(plan.path, `manifest plans[${planIndex}].path`);
    validateHash(plan.sha256, `manifest plans[${planIndex}].sha256`);
    validateUniqueStrings(plan.depends_on, 'parallel_dependency_invalid', `${plan.path} dependencies`);
    if (typeof plan.can_run_in_parallel !== 'boolean' || !Array.isArray(plan.tasks)) {
      fail('parallel_manifest_invalid', `${plan.path} has invalid capability or tasks`);
    }
    for (const [taskIndex, task] of plan.tasks.entries()) {
      assertExactFields(task, TASK_FIELDS, `${plan.path} tasks[${taskIndex}]`);
      assertSchema(task.schema, PARALLEL_SCHEMA_IDS.task, `${plan.path} tasks[${taskIndex}]`);
      if (!/^T-\d{3}$/.test(task.task_anchor)) {
        fail('parallel_task_anchor_invalid', `${plan.path} contains invalid task anchor ${task.task_anchor}`);
      }
      validateUniqueStrings(task.depends_on, 'parallel_dependency_invalid', `${plan.path}#${task.task_anchor} dependencies`);
      validateUniqueStrings(task.write_scope, 'parallel_write_scope_invalid', `${plan.path}#${task.task_anchor} write_scope`);
      if (task.write_scope.length === 0 || typeof task.parallel_safe !== 'boolean') {
        fail('parallel_manifest_invalid', `${plan.path}#${task.task_anchor} has invalid write_scope or parallel_safe`);
      }
      for (const writePath of task.write_scope) {
        normalizedRepoPath(writePath, `${plan.path}#${task.task_anchor} write_scope`);
      }
    }
    validateDag(plan.tasks, { id: (task) => task.task_anchor, dependencies: (task) => task.depends_on });
    assertNoConcurrentOverlap(plan.tasks, {
      id: (task) => task.task_anchor,
      dependencies: (task) => task.depends_on,
      paths: (task) => task.write_scope,
      parallel: (task) => task.parallel_safe,
    });
  }
  validateDag(manifest.plans, { id: (plan) => plan.path, dependencies: (plan) => plan.depends_on });
  assertNoConcurrentOverlap(manifest.plans, {
    id: (plan) => plan.path,
    dependencies: (plan) => plan.depends_on,
    paths: (plan) => [...new Set(plan.tasks.flatMap((task) => task.write_scope))],
    parallel: (plan) => plan.can_run_in_parallel,
  });
  if (manifest.scope === 'single-plan' && manifest.plans.length !== 1) {
    fail('parallel_manifest_invalid', 'single-plan manifest must contain exactly one plan');
  }
  return manifest;
}

export async function inspectParallelInput({ inputPath, repoRoot, maxParallelOverride = null }) {
  const canonicalRoot = await realpath(resolve(repoRoot));
  if (maxParallelOverride !== null) {
    assertPositiveInteger(maxParallelOverride, 'maxParallelOverride');
  }
  const input = await normalizeInputPath(inputPath, canonicalRoot);
  if (basename(input.relative) !== '00-overview.md' && DIRECT_CHILD_PATTERN.test(basename(input.relative))) {
    fail('parallel_direct_child_unsupported', `direct child input is unsupported: ${input.relative}`, {
      handoff: `$subagent-exec ${input.relative}`,
    });
  }

  const inputText = await readFile(input.absolute, 'utf8');
  let manifest;
  if (basename(input.relative) === '00-overview.md') {
    const packageMetadata = parseFence(inputText, 'loopx-parallel-package', input.relative);
    validatePackageMetadata(packageMetadata);
    const packageDir = dirname(input.relative);
    const declaredPaths = packageMetadata.plans.map((plan) => normalizedRepoPath(plan.path, 'package plan path'));
    if (new Set(declaredPaths).size !== declaredPaths.length) {
      fail('parallel_package_path_duplicate', 'package plan paths must be unique');
    }
    const actualPaths = (await readdir(resolve(canonicalRoot, packageDir)))
      .filter((name) => name !== '00-overview.md' && DIRECT_CHILD_PATTERN.test(name))
      .sort()
      .map((name) => `${packageDir}/${name}`);
    if (JSON.stringify([...declaredPaths].sort()) !== JSON.stringify(actualPaths)) {
      fail('parallel_package_path_mismatch', 'package paths must exactly match numbered child files', {
        declared: declaredPaths,
        actual: actualPaths,
      });
    }

    const plans = [];
    for (let index = 0; index < packageMetadata.plans.length; index += 1) {
      const declared = packageMetadata.plans[index];
      const repoPath = declaredPaths[index];
      if (dirname(repoPath) !== packageDir || !DIRECT_CHILD_PATTERN.test(basename(repoPath))) {
        fail('parallel_package_path_invalid', `package child must be a numbered file in ${packageDir}: ${repoPath}`);
      }
      await assertNoRealpathEscape(canonicalRoot, repoPath, 'parallel_package_path_invalid');
      const absolutePath = resolve(canonicalRoot, repoPath);
      if (!existsSync(absolutePath)) {
        fail('parallel_package_path_missing', `package child does not exist: ${repoPath}`);
      }
      const parsed = await parsePlan({ absolutePath, repoPath, repoRoot: canonicalRoot });
      plans.push({
        path: repoPath,
        sha256: parsed.sha256,
        depends_on: [...declared.depends_on],
        can_run_in_parallel: declared.can_run_in_parallel,
        tasks: parsed.tasks,
      });
    }
    validateDag(plans, { id: (plan) => plan.path, dependencies: (plan) => plan.depends_on });
    assertNoConcurrentOverlap(plans, {
      id: (plan) => plan.path,
      dependencies: (plan) => plan.depends_on,
      paths: (plan) => [...new Set(plan.tasks.flatMap((task) => task.write_scope))],
      parallel: (plan) => plan.can_run_in_parallel,
    });
    manifest = {
      schema: PARALLEL_SCHEMA_IDS.manifest,
      scope: 'package',
      input: { path: input.relative, sha256: hashText(inputText) },
      max_parallel: maxParallelOverride ?? packageMetadata.max_parallel,
      plans,
    };
  } else {
    const parsed = await parsePlan({ absolutePath: input.absolute, repoPath: input.relative, repoRoot: canonicalRoot });
    manifest = {
      schema: PARALLEL_SCHEMA_IDS.manifest,
      scope: 'single-plan',
      input: { path: input.relative, sha256: parsed.sha256 },
      max_parallel: maxParallelOverride ?? parsed.maxParallel,
      plans: [{
        path: input.relative,
        sha256: parsed.sha256,
        depends_on: [],
        can_run_in_parallel: true,
        tasks: parsed.tasks,
      }],
    };
  }
  validateParallelManifest(manifest);
  return deepFreeze(manifest);
}

function parseCliArgs(argv) {
  if (argv[0] !== 'manifest' || argv[1] !== 'inspect') {
    fail('parallel_usage_invalid', 'usage: manifest inspect --input PATH [--max-parallel N] --output FILE');
  }
  const values = new Map();
  for (let index = 2; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!['--input', '--max-parallel', '--output'].includes(flag) || value === undefined || values.has(flag)) {
      fail('parallel_usage_invalid', `invalid or duplicate argument: ${flag}`);
    }
    values.set(flag, value);
  }
  if (!values.has('--input') || !values.has('--output')) {
    fail('parallel_usage_invalid', '--input and --output are required');
  }
  const maxParallelOverride = values.has('--max-parallel') ? Number(values.get('--max-parallel')) : null;
  if (values.has('--max-parallel')) {
    assertPositiveInteger(maxParallelOverride, '--max-parallel');
  }
  return {
    inputPath: values.get('--input'),
    outputPath: resolve(values.get('--output')),
    maxParallelOverride,
  };
}

async function writeJsonAtomic(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.tmp-${process.pid}`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  await rename(temporaryPath, path);
}

async function main() {
  try {
    const args = parseCliArgs(process.argv.slice(2));
    const manifest = await inspectParallelInput({
      inputPath: args.inputPath,
      repoRoot: process.cwd(),
      maxParallelOverride: args.maxParallelOverride,
    });
    await writeJsonAtomic(args.outputPath, manifest);
    const tasks = manifest.plans.reduce((sum, plan) => sum + plan.tasks.length, 0);
    process.stdout.write(`${JSON.stringify({
      ok: true,
      schema: manifest.schema,
      scope: manifest.scope,
      output: args.outputPath,
      plans: manifest.plans.length,
      tasks,
      max_parallel: manifest.max_parallel,
    })}\n`);
  } catch (error) {
    const code = error?.code || 'parallel_internal_error';
    process.stderr.write(`${code}: ${error.message}\n`);
    process.exitCode = 2;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  await main();
}
