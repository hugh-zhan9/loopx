# loopx Spec And Memory Context Loading Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use loopx:subagent-exec (recommended) or loopx:exec to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Source:** Current product decision from this conversation: loopx agents should read long-lived repo specs and curated memory before clarify/spec/plan work, should optionally offer user-level agent guidance on install (`AGENTS.md` for Codex and `CLAUDE.md` for Claude), and should include specs/memory in runtime context manifests as a fallback.

**Goal:** Make loopx specs and curated memory reliably visible to agents without requiring `loopx init`, without forcing a `docs/loopx/specs/index.md`, and without silently editing a user's global agent guidance files.

**Architecture:** Add the context rule to the canonical workflow skills first, because skills are the main entry point when users do not initialize a loopx runtime. Add a small runtime discovery helper that finds `docs/loopx/specs/` and `.loopx/memory/` when present, then wire it into plan source context and build/review context manifests. Add explicit opt-in managed blocks for Codex `AGENTS.md` and Claude `CLAUDE.md` during install so users can make the behavior global, while non-interactive installs only report the recommendation.

**Tech Stack:** Node.js ESM, `node:test`, `node:fs/promises`, existing loopx skill governance, install discovery, context manifest, workflow runtime tests.

---

### Task 1: Add Specs And Memory Reading Rules To Core Planning Skills

**Files:**
- Modify: `skills/clarify/SKILL.md`
- Modify: `skills/spec/SKILL.md`
- Modify: `skills/plan/SKILL.md`
- Modify: `plugins/loopx/skills/clarify/SKILL.md`
- Modify: `plugins/loopx/skills/spec/SKILL.md`
- Modify: `plugins/loopx/skills/plan/SKILL.md`
- Test: `test/skill-governance.test.mjs`

- [ ] **Step 1: Write the failing skill governance test**

Add these assertions inside the existing `keeps workflow skill handoff commands unambiguous` test in `test/skill-governance.test.mjs`, after each skill file is read:

```js
    for (const [skillName, text] of [
      ['clarify', clarify],
      ['spec', spec],
      ['plan', plan],
    ]) {
      assert.match(text, /Repo Specs And Memory Context/, `${skillName} missing repo context rule`);
      assert.match(text, /docs\/loopx\/specs\//, `${skillName} missing loopx specs guidance`);
      assert.match(text, /\.loopx\/memory\/MEMORY\.md/, `${skillName} missing memory summary guidance`);
      assert.match(text, /Memory is advisory/, `${skillName} missing memory priority guidance`);
      assert.doesNotMatch(text, /must read every file under `docs\/loopx\/specs\/`/i);
    }
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run:

```bash
node --test test/skill-governance.test.mjs -t "keeps workflow skill handoff commands unambiguous"
```

Expected: FAIL with an assertion like `clarify missing repo context rule`.

- [ ] **Step 3: Add the shared context rule to the three root skills**

Insert this section into `skills/clarify/SKILL.md` after `## Core Loop`, into `skills/spec/SKILL.md` after `## Inputs`, and into `skills/plan/SKILL.md` after the source list and before the "Do not re-decide..." paragraph:

```md
## Repo Specs And Memory Context

Before using this skill in a repository, inspect loopx long-lived context when it exists:

- If `docs/loopx/specs/` exists, inspect the directory names and filenames. If `docs/loopx/specs/index.md` exists, use it as a map, but do not require it. Read only specs relevant to the requested domain, affected files, workflow behavior, or named source document.
- If `.loopx/memory/MEMORY.md` exists, read it as curated project memory before deciding what is already known.
- If `.loopx/memory/index.jsonl` exists, use it only as a retrieval index for relevant active memory cards; do not treat it as an append-only log.
- Treat current user instructions and the named source document as highest priority, `docs/loopx/specs/` as binding long-lived repo rules, and `.loopx/memory/` as advisory context. Memory is advisory and must not override current task instructions, approved source docs, or repo specs.

Do not read every file under `docs/loopx/specs/` by default. Prefer relevant specs selected by filename, title, frontmatter such as `applies_to`, or the files/domains involved in the task.
```

For `clarify`, make one local wording adjustment in the first bullet so it says "before asking questions" instead of "before deciding" only if that reads better in context; keep the exact phrases asserted by the test.

- [ ] **Step 4: Synchronize plugin skill mirrors**

Copy the edited root skill files to their plugin mirrors:

```bash
cp skills/clarify/SKILL.md plugins/loopx/skills/clarify/SKILL.md
cp skills/spec/SKILL.md plugins/loopx/skills/spec/SKILL.md
cp skills/plan/SKILL.md plugins/loopx/skills/plan/SKILL.md
```

Expected: no output.

- [ ] **Step 5: Run the focused test to verify it passes**

Run:

```bash
node --test test/skill-governance.test.mjs -t "keeps workflow skill handoff commands unambiguous"
```

Expected: PASS, including existing plugin mirror equality assertions.

- [ ] **Step 6: Commit**

```bash
git add skills/clarify/SKILL.md skills/spec/SKILL.md skills/plan/SKILL.md plugins/loopx/skills/clarify/SKILL.md plugins/loopx/skills/spec/SKILL.md plugins/loopx/skills/plan/SKILL.md test/skill-governance.test.mjs
git commit -m "docs: teach core skills to read loopx specs and memory"
```

### Task 2: Add Runtime Discovery For loopx Specs And Memory

**Files:**
- Create: `src/loopx-context-artifacts.mjs`
- Modify: `src/project-discovery.mjs`
- Test: `test/trellis-hardening.test.mjs`
- Test: `test/workflow.test.mjs`

- [ ] **Step 1: Write the failing context discovery test**

Add this import to `test/trellis-hardening.test.mjs`:

```js
import { discoverLoopxContextArtifacts } from '../src/loopx-context-artifacts.mjs';
```

Add this test near the existing context manifest tests:

```js
  it('discovers loopx repo specs and curated memory without requiring an index file', async () => {
    const wd = await mkdtemp(join(tmpdir(), 'loopx-context-artifacts-'));
    await mkdir(join(wd, 'docs', 'loopx', 'specs'), { recursive: true });
    await mkdir(join(wd, '.loopx', 'memory', 'entries'), { recursive: true });
    await writeFile(join(wd, 'docs', 'loopx', 'specs', 'workflow-runtime.md'), [
      '---',
      'applies_to:',
      '  - src/workflow.mjs',
      '---',
      '# Workflow Runtime Spec',
      '',
      '- Build and review must consume manifests.',
    ].join('\n'));
    await writeFile(join(wd, 'docs', 'loopx', 'specs', 'skills.md'), '# Skills Spec\n');
    await writeFile(join(wd, '.loopx', 'memory', 'MEMORY.md'), '# Memory\n\n- Prefer manifest evidence.\n');
    await writeFile(join(wd, '.loopx', 'memory', 'index.jsonl'), `${JSON.stringify({
      id: 'runtime-manifest',
      path: 'entries/runtime-manifest.md',
      tags: ['workflow'],
    })}\n`);

    const context = await discoverLoopxContextArtifacts(wd, { changedFiles: ['src/workflow.mjs'] });

    assert.equal(context.specsRoot, 'docs/loopx/specs');
    assert.deepEqual(context.specFiles.map((item) => item.path), ['docs/loopx/specs/workflow-runtime.md']);
    assert.equal(context.memorySummary?.path, '.loopx/memory/MEMORY.md');
    assert.equal(context.memoryIndex?.path, '.loopx/memory/index.jsonl');
  });
```

- [ ] **Step 2: Write the failing project discovery test update**

In `test/workflow.test.mjs`, in `initializes a loopx workspace and requires approval before planning`, create the loopx specs directory before `initWorkspace`:

```js
    await mkdir(join(wd, 'docs', 'loopx', 'specs'), { recursive: true });
    await writeFile(join(wd, 'docs', 'loopx', 'specs', 'workflow.md'), '# Workflow spec\n');
```

Change the expected `existing_spec_sources` assertion to include the loopx specs directory:

```js
    assert.deepEqual(
      config.project_conventions.existing_spec_sources.map((item) => item.path),
      ['docs/changes', 'docs/loopx/specs'],
    );
```

- [ ] **Step 3: Run focused tests to verify they fail**

Run:

```bash
node --test test/trellis-hardening.test.mjs -t "discovers loopx repo specs"
node --test test/workflow.test.mjs -t "initializes a loopx workspace"
```

Expected:
- first command FAILS because `src/loopx-context-artifacts.mjs` does not exist
- second command FAILS because `docs/loopx/specs` is not discovered

- [ ] **Step 4: Implement `src/loopx-context-artifacts.mjs`**

Create `src/loopx-context-artifacts.mjs` with these exports and behavior:

```js
import { existsSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import { basename, join, relative, resolve } from 'node:path';

const MAX_SPEC_CONTEXT_FILES = 12;

function displayPath(cwd, path) {
  const rel = relative(cwd, path);
  return rel && !rel.startsWith('..') ? rel : path;
}

function normalizeChangedFiles(files = []) {
  return Array.isArray(files)
    ? files.map((file) => String(file || '').trim()).filter(Boolean)
    : [];
}

async function listMarkdownFiles(root) {
  if (!existsSync(root)) {
    return [];
  }
  const found = [];
  async function walk(dir) {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(path);
        continue;
      }
      if (entry.isFile() && /\.md$/i.test(entry.name)) {
        found.push(path);
      }
    }
  }
  await walk(root);
  return found;
}

function pathParts(value) {
  return String(value || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((part) => part.length >= 3);
}

function frontmatterAppliesTo(text) {
  if (!String(text || '').startsWith('---\n')) {
    return [];
  }
  const end = text.indexOf('\n---\n', 4);
  if (end === -1) {
    return [];
  }
  const lines = text.slice(4, end).split('\n');
  const values = [];
  let inAppliesTo = false;
  for (const line of lines) {
    if (/^applies_to:\s*$/.test(line)) {
      inAppliesTo = true;
      continue;
    }
    if (inAppliesTo && /^\s+-\s+/.test(line)) {
      values.push(line.replace(/^\s+-\s+/, '').trim().replace(/^['"]|['"]$/g, ''));
      continue;
    }
    if (inAppliesTo && /^\S/.test(line)) {
      inAppliesTo = false;
    }
  }
  return values.filter(Boolean);
}

function appliesToChangedFile(pattern, changedFile) {
  const normalizedPattern = String(pattern || '').replace(/\*\*?\/?/g, '').replace(/\/+$/, '');
  const normalizedFile = String(changedFile || '');
  return normalizedPattern && normalizedFile.includes(normalizedPattern);
}

async function specRecord(cwd, path, changedFiles) {
  const text = await readFile(path, 'utf8');
  const appliesTo = frontmatterAppliesTo(text);
  const stemParts = pathParts(basename(path, '.md'));
  const changedParts = new Set(changedFiles.flatMap(pathParts));
  const filenameMatch = stemParts.some((part) => changedParts.has(part));
  const appliesToMatch = appliesTo.some((pattern) => changedFiles.some((file) => appliesToChangedFile(pattern, file)));
  const isIndex = /(^|\/)index\.md$/i.test(path);
  const isInbox = /(^|\/)inbox\.md$/i.test(path);
  return {
    path: displayPath(cwd, path),
    appliesTo,
    relevant: isIndex || isInbox || filenameMatch || appliesToMatch || changedFiles.length === 0,
  };
}

export async function discoverLoopxContextArtifacts(cwd, options = {}) {
  const root = resolve(cwd);
  const changedFiles = normalizeChangedFiles(options.changedFiles);
  const specsRootPath = join(root, 'docs', 'loopx', 'specs');
  const specPaths = await listMarkdownFiles(specsRootPath);
  const records = await Promise.all(specPaths.map((path) => specRecord(root, path, changedFiles)));
  const relevantSpecs = records
    .filter((record) => record.relevant)
    .sort((left, right) => left.path.localeCompare(right.path))
    .slice(0, MAX_SPEC_CONTEXT_FILES);
  const memorySummaryPath = join(root, '.loopx', 'memory', 'MEMORY.md');
  const memoryIndexPath = join(root, '.loopx', 'memory', 'index.jsonl');
  return {
    specsRoot: existsSync(specsRootPath) ? displayPath(root, specsRootPath) : null,
    specFiles: relevantSpecs,
    memorySummary: existsSync(memorySummaryPath) ? { path: displayPath(root, memorySummaryPath) } : null,
    memoryIndex: existsSync(memoryIndexPath) ? { path: displayPath(root, memoryIndexPath) } : null,
  };
}
```

This implementation intentionally makes `index.md` useful but optional.

- [ ] **Step 5: Update project discovery**

In `src/project-discovery.mjs`, add `docs/loopx/specs` to `discoverSpecSources` after `docs/specs` and before `docs/adr`:

```js
    candidate(join(cwd, 'docs', 'loopx', 'specs'), 'docs/loopx/specs'),
```

Do not add `docs/loopx/design` as a spec source. Design docs are task-specific sources only when named by the current task or plan.

- [ ] **Step 6: Run focused tests to verify they pass**

Run:

```bash
node --test test/trellis-hardening.test.mjs -t "discovers loopx repo specs"
node --test test/workflow.test.mjs -t "initializes a loopx workspace"
```

Expected: both commands PASS.

- [ ] **Step 7: Commit**

```bash
git add src/loopx-context-artifacts.mjs src/project-discovery.mjs test/trellis-hardening.test.mjs test/workflow.test.mjs
git commit -m "feat: discover loopx specs and curated memory"
```

### Task 3: Inject Specs And Memory Into Plan, Build, And Review Context

**Files:**
- Modify: `src/workflow.mjs`
- Modify: `src/context-manifest.mjs`
- Test: `test/trellis-hardening.test.mjs`

- [ ] **Step 1: Write the failing plan context test**

Add this test near the existing context manifest tests in `test/trellis-hardening.test.mjs`:

```js
  it('adds loopx specs and memory to plan source context', async () => {
    const wd = await mkdtemp(join(tmpdir(), 'loopx-plan-repo-context-'));
    const clarified = await clarifyStage(wd, 'plan-repo-context');
    await writeResolvedSpec(clarified.root, 'plan-repo-context');
    await mkdir(join(wd, 'docs', 'loopx', 'specs'), { recursive: true });
    await mkdir(join(wd, '.loopx', 'memory'), { recursive: true });
    await writeFile(join(wd, 'docs', 'loopx', 'specs', 'workflow-runtime.md'), [
      '---',
      'applies_to:',
      '  - src/workflow.mjs',
      '---',
      '# Workflow Runtime Spec',
      '',
      '- Plans must preserve explicit approvals.',
    ].join('\n'));
    await writeFile(join(wd, '.loopx', 'memory', 'MEMORY.md'), '# Memory\n\n- Prioritize manifest evidence.\n');
    await approveStage(wd, 'plan-repo-context', { from: 'clarify', to: 'plan' });

    const planned = await planStage(wd, 'plan-repo-context', { adapter: createScriptedPlanAdapter() });

    assert.equal(planned.state.plan_source_document_paths.includes(join(wd, 'docs', 'loopx', 'specs', 'workflow-runtime.md')), true);
    assert.equal(planned.state.plan_source_document_paths.includes(join(wd, '.loopx', 'memory', 'MEMORY.md')), true);
    const traceability = await readFile(join(planned.root, 'requirement-traceability.md'), 'utf8');
    assert.match(traceability, /Plans must preserve explicit approvals/);
    assert.match(traceability, /Prioritize manifest evidence/);
  });
```

- [ ] **Step 2: Write the failing manifest rows test update**

In the existing test `generates context manifests, consumes them, and writes Chinese workspace journal`, create repo specs and memory before `planStage`:

```js
    await mkdir(join(wd, 'docs', 'loopx', 'specs'), { recursive: true });
    await mkdir(join(wd, '.loopx', 'memory'), { recursive: true });
    await writeFile(join(wd, 'docs', 'loopx', 'specs', 'workflow-runtime.md'), [
      '---',
      'applies_to:',
      '  - src/workflow.mjs',
      '---',
      '# Workflow Runtime Spec',
      '',
      '- Build and review must use context manifests.',
    ].join('\n'));
    await writeFile(join(wd, '.loopx', 'memory', 'MEMORY.md'), '# Memory\n\n- Review should preserve terminology.\n');
    await writeFile(join(wd, '.loopx', 'memory', 'index.jsonl'), '{"id":"terminology","path":"entries/terminology.md"}\n');
```

Add build manifest assertions after `buildRows` is read:

```js
    assert.equal(buildRows.some((row) => row.kind === 'repo-spec' && row.path === 'docs/loopx/specs/workflow-runtime.md'), true);
    assert.equal(buildRows.some((row) => row.kind === 'memory-summary' && row.path === '.loopx/memory/MEMORY.md'), true);
    assert.equal(buildRows.some((row) => row.kind === 'memory-index' && row.path === '.loopx/memory/index.jsonl'), true);
```

Add review manifest assertions after `reviewRows` is read:

```js
    assert.equal(reviewRows.some((row) => row.kind === 'repo-spec' && row.path === 'docs/loopx/specs/workflow-runtime.md'), true);
    assert.equal(reviewRows.some((row) => row.kind === 'memory-summary' && row.path === '.loopx/memory/MEMORY.md'), true);
```

- [ ] **Step 3: Run focused tests to verify they fail**

Run:

```bash
node --test test/trellis-hardening.test.mjs -t "adds loopx specs and memory to plan source context"
node --test test/trellis-hardening.test.mjs -t "generates context manifests"
```

Expected: FAIL because plan source context and context manifests do not include loopx specs or memory yet.

- [ ] **Step 4: Append repo context to plan source text**

In `src/workflow.mjs`, import the discovery helper:

```js
import { discoverLoopxContextArtifacts } from './loopx-context-artifacts.mjs';
```

Add a helper near `readPlanSourceText`:

```js
async function readLoopxRepoContextText(cwd, sourceSpecPath) {
  const artifacts = await discoverLoopxContextArtifacts(cwd, {
    changedFiles: [relative(cwd, sourceSpecPath)],
  });
  const paths = [
    ...artifacts.specFiles.map((item) => item.path),
    artifacts.memorySummary?.path,
  ].filter(Boolean);
  if (paths.length === 0) {
    return { text: '', paths: [] };
  }
  const sections = [];
  const loaded = [];
  for (const display of paths) {
    const absolute = resolve(cwd, display);
    if (!existsSync(absolute)) {
      continue;
    }
    const raw = await readFile(absolute, 'utf8');
    loaded.push(absolute);
    sections.push([
      `# loopx context: ${display}`,
      '',
      compactPlanningText(raw),
    ].join('\n'));
  }
  return {
    text: [
      '# loopx Repo Specs And Memory Context',
      '',
      'Current task instructions and named source documents have priority. Repo specs are binding long-lived rules. Memory is advisory.',
      '',
      ...sections,
    ].join('\n\n'),
    paths: loaded,
  };
}
```

Then update `readPlanSourceText` so the returned `sourceText` includes this context and `sourceDocumentPaths` includes the loaded absolute paths:

```js
  const repoContext = await readLoopxRepoContextText(cwd, sourceSpecPath);
  if (repoContext.text) {
    parts.push(repoContext.text);
    loaded.push(...repoContext.paths);
  }
```

Place this block after loading frontmatter/source-context documents so task-specific docs stay closest to the original source and repo context remains clearly labeled.

- [ ] **Step 5: Add repo context rows to build and review manifests**

In `src/context-manifest.mjs`, import:

```js
import { discoverLoopxContextArtifacts } from './loopx-context-artifacts.mjs';
```

Add this helper near `stableRows`:

```js
async function loopxRepoContextRows(cwd, stage, priorityStart) {
  const artifacts = await discoverLoopxContextArtifacts(cwd);
  const rows = [];
  let priority = priorityStart;
  if (artifacts.specsRoot) {
    rows.push(row(cwd, {
      stage,
      kind: 'repo-specs',
      path: artifacts.specsRoot,
      reason: 'long_lived_loopx_specs_directory',
      priority: priority++,
      required: false,
    }));
  }
  for (const spec of artifacts.specFiles) {
    rows.push(row(cwd, {
      stage,
      kind: 'repo-spec',
      path: spec.path,
      reason: 'long_lived_loopx_spec',
      priority: priority++,
      required: false,
    }));
  }
  if (artifacts.memorySummary) {
    rows.push(row(cwd, {
      stage,
      kind: 'memory-summary',
      path: artifacts.memorySummary.path,
      reason: 'curated_loopx_project_memory',
      priority: priority++,
      required: false,
    }));
  }
  if (artifacts.memoryIndex) {
    rows.push(row(cwd, {
      stage,
      kind: 'memory-index',
      path: artifacts.memoryIndex.path,
      reason: 'curated_loopx_memory_retrieval_index',
      priority: priority++,
      required: false,
    }));
  }
  return rows;
}
```

In `generateBuildContextManifest`, append:

```js
    ...await loopxRepoContextRows(cwd, 'build', 37),
```

after the existing `workspace-config` row.

In `generateReviewContextManifest`, append:

```js
    ...await loopxRepoContextRows(cwd, 'review', 33),
```

after the existing `workspace-config` row and before the required `state` row. Keep all repo spec and memory rows `required: false` so missing optional context cannot block build/review.

- [ ] **Step 6: Run focused tests to verify they pass**

Run:

```bash
node --test test/trellis-hardening.test.mjs -t "adds loopx specs and memory to plan source context"
node --test test/trellis-hardening.test.mjs -t "generates context manifests"
```

Expected: both commands PASS.

- [ ] **Step 7: Commit**

```bash
git add src/workflow.mjs src/context-manifest.mjs test/trellis-hardening.test.mjs
git commit -m "feat: include loopx specs and memory in agent context"
```

### Task 4: Add Optional User Agent Guidance During Install

**Files:**
- Modify: `src/install-discovery.mjs`
- Modify: `src/cli.mjs`
- Test: `test/workflow.test.mjs`

- [ ] **Step 1: Write the failing install API test**

Add this test after `install-skills isolates codex and claude targets and honors custom directories` in `test/workflow.test.mjs`:

```js
  it('installs optional user agent guidance without overwriting user content', async () => {
    const home = await mkdtemp(join(tmpdir(), 'loopx-agent-guidance-'));
    const env = loopxEnv(home);
    await mkdir(join(home, '.codex'), { recursive: true });
    await mkdir(join(home, '.claude'), { recursive: true });
    await writeFile(join(home, '.codex', 'AGENTS.md'), '# Existing guidance\n\n- Keep this line.\n');
    await writeFile(join(home, '.claude', 'CLAUDE.md'), '# Existing Claude guidance\n\n- Keep this Claude line.\n');

    const withoutGuidance = await installBundledSkills({
      ...env,
      LOOPX_INSTALL_TARGET: 'codex',
    });
    assert.equal(existsSync(join(home, '.codex', 'AGENTS.md')), true);
    assert.doesNotMatch(await readFile(join(home, '.codex', 'AGENTS.md'), 'utf8'), /loopx Specs And Memory/);
    assert.equal(withoutGuidance.agentGuidance.codex.status, 'recommended');

    const withGuidance = await installBundledSkills({
      ...env,
      LOOPX_INSTALL_TARGET: 'codex',
    }, {
      target: 'codex',
      agentGuidance: true,
    });
    const agentsText = await readFile(join(home, '.codex', 'AGENTS.md'), 'utf8');
    assert.match(agentsText, /# Existing guidance/);
    assert.match(agentsText, /<!-- loopx:managed:block specs-and-memory-context -->/);
    assert.match(agentsText, /docs\/loopx\/specs\//);
    assert.match(agentsText, /\.loopx\/memory\/MEMORY\.md/);
    assert.equal(withGuidance.agentGuidance.codex.status, 'installed');

    const second = await installBundledSkills({
      ...env,
      LOOPX_INSTALL_TARGET: 'codex',
    }, {
      target: 'codex',
      agentGuidance: true,
    });
    assert.equal(second.agentGuidance.codex.status, 'already-current');
    assert.equal(await readFile(join(home, '.codex', 'AGENTS.md'), 'utf8'), agentsText);

    const claudeGuidance = await installBundledSkills({
      ...env,
      LOOPX_INSTALL_TARGET: 'claude',
    }, {
      target: 'claude',
      agentGuidance: true,
    });
    const claudeText = await readFile(join(home, '.claude', 'CLAUDE.md'), 'utf8');
    assert.match(claudeText, /# Existing Claude guidance/);
    assert.match(claudeText, /<!-- loopx:managed:block specs-and-memory-context -->/);
    assert.match(claudeText, /docs\/loopx\/specs\//);
    assert.match(claudeText, /\.loopx\/memory\/MEMORY\.md/);
    assert.equal(claudeGuidance.agentGuidance.claude.status, 'installed');
  });
```

- [ ] **Step 2: Write the failing CLI flag test**

Add this assertion to the same test or a new nearby test:

```js
    const cliHome = await mkdtemp(join(tmpdir(), 'loopx-agent-guidance-cli-'));
    const { stdout } = await execFileAsync(process.execPath, [
      cliPath,
      'install-skills',
      '--target',
      'all',
      '--yes',
      '--add-agent-guidance',
    ], {
      cwd: repoRoot,
      env: loopxEnv(cliHome),
    });
    const payload = JSON.parse(stdout);
    assert.equal(payload.results.codex.agentGuidance.codex.status, 'created');
    assert.equal(payload.results.claude.agentGuidance.claude.status, 'created');
    assert.match(await readFile(join(cliHome, '.codex', 'AGENTS.md'), 'utf8'), /loopx Specs And Memory/);
    assert.match(await readFile(join(cliHome, '.claude', 'CLAUDE.md'), 'utf8'), /loopx Specs And Memory/);
```

- [ ] **Step 3: Run focused tests to verify they fail**

Run:

```bash
node --test test/workflow.test.mjs -t "installs optional user agent guidance"
```

Expected: FAIL because `agentGuidance`, Claude `CLAUDE.md` guidance, and `--add-agent-guidance` do not exist.

- [ ] **Step 4: Implement managed block helpers in `src/install-discovery.mjs`**

Update the import from `node:fs/promises` to include no new APIs beyond those already used. Add these helpers near the path helpers:

```js
const AGENT_GUIDANCE_BLOCK_ID = 'specs-and-memory-context';

export function getCodexAgentsPath(env = process.env) {
  const home = resolve(env.LOOPX_HOME || env.HOME || process.cwd());
  return resolve(env.LOOPX_CODEX_AGENTS_PATH || join(home, '.codex', 'AGENTS.md'));
}

export function getClaudeAgentsPath(env = process.env, options = {}) {
  if (options.project === true) {
    return join(resolve(env.LOOPX_INSTALL_CWD || process.cwd()), 'CLAUDE.md');
  }
  const home = resolve(env.LOOPX_HOME || env.HOME || process.cwd());
  return resolve(env.LOOPX_CLAUDE_AGENTS_PATH || join(home, '.claude', 'CLAUDE.md'));
}

function agentGuidanceBlock() {
  return [
    '<!-- loopx:managed:block specs-and-memory-context -->',
    '## loopx Specs And Memory',
    '',
    'When working in a repository that uses loopx:',
    '',
    '- If `docs/loopx/specs/` exists, inspect relevant specs before clarify, spec, plan, implementation, or review. Use `docs/loopx/specs/index.md` as a map when present, but do not require it.',
    '- If `.loopx/memory/MEMORY.md` exists, read it as curated project memory.',
    '- If `.loopx/memory/index.jsonl` exists, use it only to find relevant active memory cards.',
    '- Treat current user instructions and named source documents as highest priority, repo specs as binding long-lived rules, and memory as advisory context.',
    '<!-- /loopx:managed:block specs-and-memory-context -->',
  ].join('\n');
}

function replaceManagedBlock(text, blockText) {
  const pattern = /<!--\s*loopx:managed:block\s+specs-and-memory-context\s*-->[\s\S]*?<!--\s*\/loopx:managed:block\s+specs-and-memory-context\s*-->/;
  if (pattern.test(text)) {
    return text.replace(pattern, blockText);
  }
  return `${text.replace(/\s+$/, '')}${text.trim() ? '\n\n' : ''}${blockText}\n`;
}

async function installAgentGuidanceFile(path, { enabled = false } = {}) {
  const block = agentGuidanceBlock();
  const existing = existsSync(path) ? await readFile(path, 'utf8') : '';
  if (!enabled) {
    return {
      status: /loopx:managed:block\s+specs-and-memory-context/.test(existing) ? 'already-current' : 'recommended',
      path,
    };
  }
  const next = replaceManagedBlock(existing, block);
  if (next === existing) {
    return { status: 'already-current', path };
  }
  await ensureDir(dirname(path));
  await writeFile(path, `${next.replace(/\s+$/, '')}\n`);
  return {
    status: existing ? 'installed' : 'created',
    path,
  };
}

async function installAgentGuidance(env = process.env, options = {}) {
  const target = options.target || env.LOOPX_INSTALL_TARGET || 'codex';
  const enabled = Boolean(options.agentGuidance || options.codexAgentsGuidance);
  return {
    codex: target === 'codex'
      ? await installAgentGuidanceFile(getCodexAgentsPath(env), { enabled })
      : { status: 'not-applicable', path: getCodexAgentsPath(env) },
    claude: target === 'claude'
      ? await installAgentGuidanceFile(getClaudeAgentsPath(env, options), { enabled })
      : { status: 'not-applicable', path: getClaudeAgentsPath(env, options) },
  };
}
```

At the end of `installBundledSkills`, before the final `return`, compute:

```js
  const agentGuidance = await installAgentGuidance(env, options);
```

Include `agentGuidance` in the returned object.

Keep `options.codexAgentsGuidance` as a backwards-compatible alias in the helper even though the new public flag is `--add-agent-guidance`.

- [ ] **Step 5: Wire CLI prompt and flag**

In `src/cli.mjs`, update usage:

```js
'  loopx install-skills [--target <codex|claude|all>] [--project] [--mode <copy|symlink>] [--dir <path>] [--add-agent-guidance] [--yes]',
```

In `promptInstallOptions`, ask one more question after install mode:

```js
    const guidanceAnswer = (await rl.question('Add loopx agent guidance to Codex AGENTS.md / Claude CLAUDE.md? [y/N]: ')).trim().toLowerCase();
```

Return:

```js
      agentGuidance: guidanceAnswer === 'y' || guidanceAnswer === 'yes',
```

In `installOptionsFromArgs`, add:

```js
    agentGuidance: Boolean(options.get('--add-agent-guidance') || options.get('--add-codex-agents-guidance')),
```

Do not make `--yes` imply global `AGENTS.md` or `CLAUDE.md` edits. The opt-in flag or interactive yes answer is required.

- [ ] **Step 6: Run focused tests to verify they pass**

Run:

```bash
node --test test/workflow.test.mjs -t "installs optional user agent guidance"
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/install-discovery.mjs src/cli.mjs test/workflow.test.mjs
git commit -m "feat: add optional loopx agent guidance"
```

### Task 5: Update Public Docs And Governance Checks

**Files:**
- Modify: `README.md`
- Modify: `README.zh-CN.md`
- Modify: `test/skill-governance.test.mjs`

- [ ] **Step 1: Write failing public docs assertions**

In `test/skill-governance.test.mjs`, in `keeps public docs structurally valid and bilingual release docs aligned`, add these required strings to the docs assertion lists:

```js
      '--add-agent-guidance',
      'Repo Specs And Memory',
```

Also add:

```js
      'docs/loopx/specs/ is binding long-lived repo context',
      '.loopx/memory/MEMORY.md is advisory curated memory',
```

For the Chinese README, assert the literal English strings above where possible; the current test checks both READMEs with the same strings, so use these exact English phrases in both docs to keep the test simple.

- [ ] **Step 2: Run the focused governance test to verify it fails**

Run:

```bash
node --test test/skill-governance.test.mjs -t "keeps public docs structurally valid"
```

Expected: FAIL because the README files do not mention the new install flag or context rule.

- [ ] **Step 3: Update README context documentation**

In `README.md`, after the `Local agent memory lives under .loopx/memory/` paragraph, add:

```md
## Repo Specs And Memory

`docs/loopx/specs/` is binding long-lived repo context. Agents using loopx skills should inspect relevant specs before clarify, spec, plan, implementation, or review. `docs/loopx/specs/index.md` is useful as a map when present, but it is not required.

`.loopx/memory/MEMORY.md` is advisory curated memory. Memory can help future agents avoid rework and preserve decisions, but it must not override current user instructions, named source documents, or repo specs.
```

Add the new install command example:

```bash
loopx install-skills --target all --add-agent-guidance
```

And update the CLI usage line to include `--add-agent-guidance`.

Add a short sentence to Installation explaining that the flag writes an opt-in managed block to Codex `~/.codex/AGENTS.md` and Claude `~/.claude/CLAUDE.md` for user-level installs. For Claude project installs, document that the target guidance file is the repository `CLAUDE.md`.

- [ ] **Step 4: Update Chinese README with matching literals**

In `README.zh-CN.md`, add a Chinese explanation under the memory paragraph while preserving the exact asserted English literals:

```md
## Repo Specs And Memory

`docs/loopx/specs/` is binding long-lived repo context。使用 loopx skills 的 agent 在 clarify、spec、plan、implementation 或 review 前，应读取与当前领域、文件或 workflow 行为相关的 spec。`docs/loopx/specs/index.md` 可以作为索引，但不是必需协议。

`.loopx/memory/MEMORY.md` is advisory curated memory。Memory 用来帮助未来 agent 避免重复踩坑和保留决策，但不能覆盖当前用户指令、明确指定的 source document 或 repo specs。
```

Add the same command example and CLI usage flag as in `README.md`.

- [ ] **Step 5: Run focused governance test to verify it passes**

Run:

```bash
node --test test/skill-governance.test.mjs -t "keeps public docs structurally valid"
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add README.md README.zh-CN.md test/skill-governance.test.mjs
git commit -m "docs: document loopx specs and memory context"
```

### Task 6: Full Verification

**Files:**
- No source edits expected unless verification exposes a defect.

- [ ] **Step 1: Run the full test suite**

Run:

```bash
npm test
```

Expected: PASS for all `node --test test/*.test.mjs` suites.

- [ ] **Step 2: Run skill verifier**

Run:

```bash
node scripts/verify-skills.mjs
```

Expected: PASS with no plugin mirror drift or frontmatter failures.

- [ ] **Step 3: Inspect git diff for generated state**

Run:

```bash
git status --short
```

Expected: only intentional source, docs, skill, and test files are changed. No `.loopx/`, ad hoc local runtime state, or generated install output should be staged.

- [ ] **Step 4: Commit final verification fixes if any**

If verification required any fixes, commit them:

```bash
git add <fixed-files>
git commit -m "fix: stabilize loopx context loading"
```

Expected: no commit is needed if Tasks 1-5 already pass cleanly.

## Self-Review

- Spec coverage: The plan covers skill-level behavior for clarify/spec/plan, runtime discovery, plan/build/review context injection, optional Codex `AGENTS.md` and Claude `CLAUDE.md` guidance, and public docs.
- Placeholder scan: No `TBD`, `TODO`, or unspecified implementation step remains. Each code-changing task has exact files, test commands, and expected output.
- Type consistency: New runtime API is consistently named `discoverLoopxContextArtifacts`; manifest kinds are `repo-specs`, `repo-spec`, `memory-summary`, and `memory-index`; install result field is `agentGuidance`.
- Design drift: The plan keeps `docs/loopx/specs/index.md` optional, does not silently edit global `AGENTS.md` or `CLAUDE.md`, and treats memory as advisory rather than binding.
