import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cp, mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { promisify } from 'node:util';

import { bootstrapRateDelta, hiddenVerificationEnv } from './benchmark-eval.mjs';

const execFileAsync = promisify(execFile);

export const SKILL_AB_ARMS = Object.freeze([
  'bare',
  'slim-agents',
  'loopx-old',
  'loopx-new',
]);

export const SKILL_AB_CATEGORIES = Object.freeze(['debug', 'spec', 'plan2exec', 'clarify', 'exec']);
export const SKILL_AB_HIDDEN_DIR = '.skill-ab-hidden';

export const SKILL_AB_PAIRS = Object.freeze([
  { id: 'loopx-new vs slim-agents', baseline: 'slim-agents', candidate: 'loopx-new' },
  { id: 'loopx-new vs loopx-old', baseline: 'loopx-old', candidate: 'loopx-new' },
  { id: 'loopx-new vs bare', baseline: 'bare', candidate: 'loopx-new' },
  { id: 'loopx-old vs slim-agents', baseline: 'slim-agents', candidate: 'loopx-old' },
  { id: 'slim-agents vs bare', baseline: 'bare', candidate: 'slim-agents' },
]);

const VALID_GUARDRAILS = new Set([
  'no_db_lock',
  'no_debug_logs',
  'no_float_money',
  'no_retry_sleep_hack',
  'dirty_tree_untouched',
  'code_files_untouched',
  'no_git_commits',
  'diagnosis_mentions_root_cause',
]);

async function listFiles(root, prefix = '') {
  const entries = await readdir(join(root, prefix), { withFileTypes: true });
  const results = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.name === '.git' || entry.name === SKILL_AB_HIDDEN_DIR || entry.name === 'node_modules') {
      continue;
    }
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      results.push(...await listFiles(root, rel));
    } else if (entry.isFile()) {
      results.push(rel);
    }
  }
  return results;
}

export async function snapshotDirectoryHashes(root) {
  const files = await listFiles(root);
  const hashes = {};
  for (const rel of files) {
    const data = await readFile(join(root, rel));
    hashes[rel] = createHash('sha256').update(data).digest('hex');
  }
  return hashes;
}

export async function loadSkillAbTasks(tasksRoot) {
  const entries = (await readdir(tasksRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .sort((a, b) => a.name.localeCompare(b.name));

  const tasks = [];
  for (const entry of entries) {
    const taskDir = join(tasksRoot, entry.name);
    const taskPath = join(taskDir, 'task.json');
    const raw = JSON.parse(await readFile(taskPath, 'utf8'));
    if (raw.schema !== 'loopx.skill-ab-task.v1') {
      throw new Error(`invalid_skill_ab_schema:${entry.name}`);
    }
    if (!SKILL_AB_CATEGORIES.includes(raw.category)) {
      throw new Error(`invalid_skill_ab_category:${entry.name}:${raw.category}`);
    }
    if (raw.mode !== 'direct' && raw.mode !== 'two-stage') {
      throw new Error(`invalid_skill_ab_mode:${entry.name}:${raw.mode}`);
    }
    for (const rule of raw.guardrails ?? []) {
      if (!VALID_GUARDRAILS.has(rule)) {
        throw new Error(`unknown_guardrail:${entry.name}:${rule}`);
      }
    }
    const hiddenDir = join(taskDir, 'hidden');
    const hiddenStat = await stat(hiddenDir).catch(() => null);
    if (!hiddenStat?.isDirectory()) {
      throw new Error(`missing_hidden_dir:${entry.name}`);
    }
    const refScript = join(taskDir, 'reference', 'apply.mjs');
    const refStat = await stat(refScript).catch(() => null);
    tasks.push({
      ...raw,
      taskDir,
      hiddenDir,
      referenceApplyPath: refStat?.isFile() ? refScript : null,
    });
  }
  return tasks;
}

export async function runHiddenSuite(repoDir, task, { timeoutMs = 30_000 } = {}) {
  const targetDir = join(repoDir, SKILL_AB_HIDDEN_DIR);
  await rm(targetDir, { recursive: true, force: true });
  await cp(task.hiddenDir, targetDir, { recursive: true });
  try {
    const [cmd, ...args] = task.hidden_verification.command;
    try {
      const { stdout, stderr } = await execFileAsync(cmd, args, {
        cwd: repoDir,
        env: hiddenVerificationEnv(process.env),
        timeout: timeoutMs,
        maxBuffer: 4 * 1024 * 1024,
      });
      return { passed: true, exitCode: 0, stdout, stderr };
    } catch (error) {
      return {
        passed: false,
        exitCode: typeof error.code === 'number' ? error.code : 1,
        stdout: error.stdout ?? '',
        stderr: error.stderr ?? error.message ?? '',
      };
    }
  } finally {
    await rm(targetDir, { recursive: true, force: true });
  }
}

export async function evaluateGuardrails(repoDir, task, { baselineHashes, responseText = '' }) {
  const rules = task.guardrails ?? [];
  const findings = [];
  const currentHashes = await snapshotDirectoryHashes(repoDir);
  const changedFiles = new Set([
    ...Object.keys(currentHashes).filter((file) => currentHashes[file] !== baselineHashes[file]),
    ...Object.keys(baselineHashes).filter((file) => !(file in currentHashes)),
  ]);

  const codeFiles = [...changedFiles].filter((file) => /\.(mjs|js|ts|go|sql)$/i.test(file) && file in currentHashes);
  const codeContents = new Map();
  for (const file of codeFiles) {
    codeContents.set(file, await readFile(join(repoDir, file), 'utf8'));
  }

  for (const rule of rules) {
    if (rule === 'dirty_tree_untouched') {
      if (changedFiles.size > 0) {
        findings.push({
          rule,
          detail: `expected untouched workspace, modified: ${[...changedFiles].sort().join(', ')}`,
        });
      }
      continue;
    }

    if (rule === 'code_files_untouched') {
      const touchedCode = [...changedFiles].filter((file) => /^(?:src|test)\//.test(file) || /\.(?:mjs|js|ts|go|py)$/i.test(file));
      if (touchedCode.length > 0) {
        findings.push({
          rule,
          detail: `expected no code edits during clarify/planning, modified: ${touchedCode.sort().join(', ')}`,
        });
      }
      continue;
    }

    if (rule === 'no_git_commits') {
      try {
        const { stdout } = await execFileAsync('git', ['rev-list', '--count', 'HEAD'], { cwd: repoDir });
        const count = Number.parseInt(stdout.trim(), 10);
        if (Number.isFinite(count) && count > 1) {
          findings.push({
            rule,
            detail: `unauthorized git commit(s) created (HEAD commit count=${count}, expected 1)`,
          });
        }
      } catch {
        // Non-git temp dir (e.g. discrimination check); skip.
      }
      continue;
    }

    if (rule === 'diagnosis_mentions_root_cause') {
      const required = task.diagnosis_required_patterns ?? [];
      for (const pattern of required) {
        const regex = new RegExp(pattern, 'i');
        if (!regex.test(responseText)) {
          findings.push({
            rule,
            detail: `diagnosis output missing required root-cause pattern: ${pattern}`,
          });
        }
      }
      continue;
    }

    if (rule === 'no_db_lock') {
      const lockPattern = /\b(?:FOR\s+UPDATE|FOR\s+SHARE|LOCK\s+TABLES?|pg_advisory_lock|GET_LOCK)\b/i;
      for (const [file, text] of codeContents) {
        const stripped = text
          .replace(/\/\*[\s\S]*?\*\//g, '')
          .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
        if (lockPattern.test(stripped)) {
          findings.push({ rule, detail: `${file} introduces prohibited database lock` });
        }
      }
      continue;
    }

    if (rule === 'no_debug_logs') {
      for (const [file, text] of codeContents) {
        if (/\[DEBUG-[A-Za-z0-9_-]+\]/.test(text)) {
          findings.push({ rule, detail: `${file} contains leftover [DEBUG-...] instrumentation` });
        }
      }
      continue;
    }

    if (rule === 'no_float_money') {
      const floatMoneyPattern = /\b(?:price|amount|total|balance|discount|refund|shares|qty|quantity)\b[^\n]{0,40}\b(?:float32|float64|parseFloat)\b/i;
      for (const [file, text] of codeContents) {
        if (floatMoneyPattern.test(text)) {
          findings.push({ rule, detail: `${file} uses floating-point arithmetic for exact financial/quantity value` });
        }
      }
      continue;
    }

    if (rule === 'no_retry_sleep_hack') {
      const hackPattern = /\bsetTimeout\s*\([^)]*,\s*(?:[1-9]\d{1,4})\s*\)/;
      for (const [file, text] of codeContents) {
        if (hackPattern.test(text)) {
          findings.push({ rule, detail: `${file} introduces an unrequested sleep/delay workaround` });
        }
      }
      continue;
    }
  }

  return {
    passed: findings.length === 0,
    findings,
    changedFiles: [...changedFiles].sort(),
  };
}

export async function verifyTaskDiscrimination(fixturesRoot, task) {
  const scratch = await mkdtemp(join(tmpdir(), `loopx-ab-disc-${task.id}-`));
  try {
    const pristineDir = join(scratch, 'pristine');
    await cp(join(fixturesRoot, task.fixture), pristineDir, { recursive: true });
    const pristineHashes = await snapshotDirectoryHashes(pristineDir);

    const pristineHidden = await runHiddenSuite(pristineDir, task);
    const pristineGuardrails = await evaluateGuardrails(pristineDir, task, {
      baselineHashes: pristineHashes,
      responseText: '',
    });
    const pristinePassed = pristineHidden.passed && pristineGuardrails.passed;

    if (!task.referenceApplyPath) {
      throw new Error(`missing_reference_apply:${task.id}`);
    }

    const solvedDir = join(scratch, 'solved');
    await cp(join(fixturesRoot, task.fixture), solvedDir, { recursive: true });
    const solvedBaselineHashes = await snapshotDirectoryHashes(solvedDir);
    const { applyReference } = await import(resolve(task.referenceApplyPath));
    const refOutcome = await applyReference(solvedDir);
    const solvedHidden = await runHiddenSuite(solvedDir, task);
    const solvedGuardrails = await evaluateGuardrails(solvedDir, task, {
      baselineHashes: solvedBaselineHashes,
      responseText: refOutcome?.responseText ?? '',
    });
    const solvedPassed = solvedHidden.passed && solvedGuardrails.passed;

    return {
      taskId: task.id,
      category: task.category,
      pristinePassed,
      solvedPassed,
      discriminates: !pristinePassed && solvedPassed,
      pristineHidden,
      pristineGuardrails,
      solvedHidden,
      solvedGuardrails,
    };
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}

function median(values) {
  const nums = values.filter((v) => typeof v === 'number' && Number.isFinite(v)).sort((a, b) => a - b);
  if (nums.length === 0) return null;
  const mid = Math.floor(nums.length / 2);
  return nums.length % 2 === 0 ? (nums[mid - 1] + nums[mid]) / 2 : nums[mid];
}

export function classifySkillVerdict({ newVsSlimDelta, newVsSlimCi, newVsOldDelta, newMedianTokens, slimMedianTokens, oldMedianTokens }) {
  if (newVsSlimDelta === null || newVsSlimCi === null) {
    return 'INCONCLUSIVE';
  }
  const tokenOverheadVsSlim = (slimMedianTokens && newMedianTokens)
    ? (newMedianTokens - slimMedianTokens) / slimMedianTokens
    : null;
  const tokenSavingsVsOld = (oldMedianTokens && newMedianTokens)
    ? (oldMedianTokens - newMedianTokens) / oldMedianTokens
    : null;

  if (newVsSlimDelta >= 0.10) {
    return 'KEEP';
  }
  if (newVsSlimDelta >= 0 && ((newVsOldDelta !== null && newVsOldDelta > 0) || (tokenSavingsVsOld !== null && tokenSavingsVsOld >= 0.20))) {
    return 'KEEP';
  }
  if (newVsSlimDelta < 0.10 && tokenOverheadVsSlim !== null && tokenOverheadVsSlim > 0.30) {
    return 'CUT_OR_FOLD';
  }
  return 'INCONCLUSIVE';
}

export function aggregateSkillAbRuns(runs, { seed = 1, iterations = 10_000 } = {}) {
  const scored = runs.filter((run) => !run.blocked);
  const categories = [...new Set(scored.map((run) => run.category))].sort();
  const byCategory = {};

  for (const category of categories) {
    const catRuns = scored.filter((run) => run.category === category);
    const armStats = {};
    for (const arm of SKILL_AB_ARMS) {
      const armRuns = catRuns.filter((run) => run.arm === arm);
      if (armRuns.length === 0) continue;
      const passed = armRuns.filter((run) => run.passed).length;
      armStats[arm] = {
        n: armRuns.length,
        passed,
        pass_rate: passed / armRuns.length,
        median_tokens: median(armRuns.map((run) => run.total_tokens)),
        median_duration_ms: median(armRuns.map((run) => run.duration_ms)),
      };
    }

    const pairs = {};
    for (const pair of SKILL_AB_PAIRS) {
      const baseRuns = catRuns.filter((run) => run.arm === pair.baseline);
      const candRuns = catRuns.filter((run) => run.arm === pair.candidate);
      if (baseRuns.length === 0 || candRuns.length === 0) continue;
      const baseOutcomes = baseRuns.map((run) => (run.passed ? 1 : 0));
      const candOutcomes = candRuns.map((run) => (run.passed ? 1 : 0));
      const boot = bootstrapRateDelta(baseOutcomes, candOutcomes, { seed, iterations });
      pairs[pair.id] = {
        delta: boot.delta,
        ci_low: boot.ci_low,
        ci_high: boot.ci_high,
      };
    }

    const newVsSlim = pairs['loopx-new vs slim-agents'];
    const newVsOld = pairs['loopx-new vs loopx-old'];
    byCategory[category] = {
      arms: armStats,
      pairs,
      verdict: classifySkillVerdict({
        newVsSlimDelta: newVsSlim?.delta ?? null,
        newVsSlimCi: newVsSlim ? [newVsSlim.ci_low, newVsSlim.ci_high] : null,
        newVsOldDelta: newVsOld?.delta ?? null,
        newMedianTokens: armStats['loopx-new']?.median_tokens ?? null,
        slimMedianTokens: armStats['slim-agents']?.median_tokens ?? null,
        oldMedianTokens: armStats['loopx-old']?.median_tokens ?? null,
      }),
    };
  }

  return {
    schema: 'loopx.skill-ab-report.v1',
    total_runs: runs.length,
    scored_runs: scored.length,
    blocked_runs: runs.length - scored.length,
    categories: byCategory,
  };
}

export function renderSkillAbMarkdown(report) {
  const lines = [
    '# Skill A/B Benchmark Report',
    '',
    `- Scored runs: ${report.scored_runs} / ${report.total_runs} (blocked: ${report.blocked_runs})`,
    '',
  ];

  for (const [category, summary] of Object.entries(report.categories)) {
    lines.push(`## Category: \`${category}\` — Verdict: **${summary.verdict}**`, '');
    lines.push('| Arm | n | Pass Rate | Median Tokens | Median Duration (ms) |');
    lines.push('|---|---:|---:|---:|---:|');
    for (const [arm, stats] of Object.entries(summary.arms)) {
      const pct = `${(stats.pass_rate * 100).toFixed(1)}% (${stats.passed}/${stats.n})`;
      lines.push(`| ${arm} | ${stats.n} | ${pct} | ${stats.median_tokens ?? 'n/a'} | ${stats.median_duration_ms ?? 'n/a'} |`);
    }
    lines.push('');
    if (Object.keys(summary.pairs).length > 0) {
      lines.push('| Pair | Pass-Rate Delta | 95% Bootstrap CI |');
      lines.push('|---|---:|---|');
      for (const [pairId, stats] of Object.entries(summary.pairs)) {
        const deltaPp = `${stats.delta >= 0 ? '+' : ''}${(stats.delta * 100).toFixed(1)}pp`;
        const ci = `[${(stats.ci_low * 100).toFixed(1)}pp, ${(stats.ci_high * 100).toFixed(1)}pp]`;
        lines.push(`| ${pairId} | ${deltaPp} | ${ci} |`);
      }
      lines.push('');
    }
  }

  return `${lines.join('\n')}\n`;
}

async function initFixtureGitRepo(repoDir) {
  const gitEnv = {
    ...process.env,
    GIT_AUTHOR_NAME: 'loopx-eval',
    GIT_AUTHOR_EMAIL: 'eval@loopx.local',
    GIT_COMMITTER_NAME: 'loopx-eval',
    GIT_COMMITTER_EMAIL: 'eval@loopx.local',
  };
  await execFileAsync('git', ['init', '-q'], { cwd: repoDir, env: gitEnv });
  await execFileAsync('git', ['add', '-A'], { cwd: repoDir, env: gitEnv });
  await execFileAsync('git', ['commit', '-q', '-m', 'baseline'], { cwd: repoDir, env: gitEnv });
}

export async function runSkillAbEvaluation({
  tasks,
  fixturesRoot,
  arms = [...SKILL_AB_ARMS],
  replicates = 1,
  concurrency = 1,
  prepareOverlay = null,
  runStage1,
  runStage2,
  seed = 1,
  iterations = 10_000,
  onProgress = null,
}) {
  const jobs = [];
  for (let replicate = 1; replicate <= replicates; replicate += 1) {
    const armOrder = replicate % 2 === 1 ? [...arms] : [...arms].reverse();
    for (const task of tasks) {
      for (const arm of armOrder) {
        jobs.push({ replicate, task, arm });
      }
    }
  }

  const totalPlanned = jobs.length;
  const runs = new Array(totalPlanned);
  let nextIndex = 0;
  let completedCount = 0;

  async function executeJob(jobIndex) {
    const { replicate, task, arm } = jobs[jobIndex];
    const scratch = await mkdtemp(join(tmpdir(), `loopx-ab-${task.id}-${arm}-r${replicate}-`));
    const repoDir = join(scratch, 'repo');
    await cp(join(fixturesRoot, task.fixture), repoDir, { recursive: true });
    await initFixtureGitRepo(repoDir);
    let record;
    try {
      const startedAt = Date.now();
      const overlayFiles = await prepareOverlay?.({ task, arm, replicate, repoDir, scratchDir: scratch }) ?? [];
      const baselineHashes = await snapshotDirectoryHashes(repoDir);
      const stage1 = await runStage1({ task, arm, replicate, repoDir, scratchDir: scratch });
      if (stage1.blocked) {
        record = {
          task_id: task.id,
          category: task.category,
          mode: task.mode,
          arm,
          replicate,
          blocked: true,
          passed: false,
          total_tokens: stage1.total_tokens ?? null,
          duration_ms: Date.now() - startedAt,
          error: stage1.error ?? 'stage1_blocked',
        };
      } else {
        let stage2 = null;
        if (task.mode === 'two-stage') {
          stage2 = await runStage2({
            task,
            arm,
            replicate,
            repoDir,
            scratchDir: scratch,
            artifactPath: stage1.artifactPath ?? task.stage1_artifact_path,
          });
        }
        if (stage2?.blocked) {
          record = {
            task_id: task.id,
            category: task.category,
            mode: task.mode,
            arm,
            replicate,
            blocked: true,
            passed: false,
            total_tokens: (stage1.total_tokens ?? 0) + (stage2.total_tokens ?? 0),
            duration_ms: Date.now() - startedAt,
            error: stage2.error ?? 'stage2_blocked',
          };
        } else {
          for (const overlayFile of overlayFiles) {
            await rm(join(repoDir, overlayFile), { force: true });
            delete baselineHashes[overlayFile];
          }
          const hidden = await runHiddenSuite(repoDir, task);
          const guardrails = await evaluateGuardrails(repoDir, task, {
            baselineHashes,
            responseText: [stage1.responseText ?? '', stage2?.responseText ?? ''].join('\n'),
          });
          const totalTokens = (stage1.total_tokens ?? 0) + (stage2?.total_tokens ?? 0);
          record = {
            task_id: task.id,
            category: task.category,
            mode: task.mode,
            arm,
            replicate,
            blocked: false,
            passed: hidden.passed && guardrails.passed,
            hidden_passed: hidden.passed,
            guardrails_passed: guardrails.passed,
            guardrail_findings: guardrails.findings,
            changed_files: guardrails.changedFiles,
            total_tokens: totalTokens > 0 ? totalTokens : null,
            duration_ms: Date.now() - startedAt,
          };
        }
      }
    } finally {
      await rm(scratch, { recursive: true, force: true });
    }
    runs[jobIndex] = record;
    completedCount += 1;
    onProgress?.({ completedCount, totalPlanned, record });
  }

  const workerCount = Math.max(1, Math.min(Number(concurrency) || 1, totalPlanned || 1));
  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (true) {
      const idx = nextIndex;
      nextIndex += 1;
      if (idx >= totalPlanned) return;
      await executeJob(idx);
    }
  }));

  const summary = aggregateSkillAbRuns(runs, { seed, iterations });
  return { ...summary, runs };
}

export async function writeSkillAbReport(outDir, report) {
  await mkdir(outDir, { recursive: true });
  const jsonPath = join(outDir, 'report.json');
  const mdPath = join(outDir, 'report.md');
  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(mdPath, renderSkillAbMarkdown(report));
  return {
    jsonPath: relative(process.cwd(), jsonPath),
    mdPath: relative(process.cwd(), mdPath),
  };
}
