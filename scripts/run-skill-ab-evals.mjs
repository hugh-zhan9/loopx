#!/usr/bin/env node

import { execFile, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import {
  loadSkillAbTasks,
  runSkillAbEvaluation,
  SKILL_AB_ARMS,
  SKILL_AB_CATEGORIES,
  verifyTaskDiscrimination,
  writeSkillAbReport,
} from '../src/skill-ab-eval.mjs';

const execFileAsync = promisify(execFile);
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const tasksRoot = join(repoRoot, 'evals', 'skill-ab', 'tasks');
const fixturesRoot = join(repoRoot, 'evals', 'skill-ab', 'fixtures');

function option(name, fallback = null) {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : process.argv[index + 1];
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function usage() {
  return [
    'Usage:',
    '  node scripts/run-skill-ab-evals.mjs --dry-run [--skill <all|debug|spec|plan2exec|clarify|exec>] [--out <dir>]',
    '  node scripts/run-skill-ab-evals.mjs --live --adapter <codex|claude> --model <id> --old-ref <git-ref> --new-ref <git-ref> [options]',
    '',
    'Options:',
    '  --adapter <codex|claude>     Live CLI host adapter (default: codex)',
    '  --model <id>                 Exact model ID used across all arms and stages',
    '  --old-ref <git-ref>          Immutable pre-refactor ref for arm loopx-old',
    '  --new-ref <git-ref>          Immutable refactored ref for arm loopx-new (default: HEAD)',
    '  --arms <list>                Comma-separated arms (default: bare,slim-agents,loopx-old,loopx-new)',
    '  --skill <category|all>       Filter by category: debug, spec, plan2exec, clarify, exec, or all (default: all)',
    '  --task <id[,id...]>          Run specific task IDs',
    '  --replicates <n>             Replicates per arm (default: 1 in dry-run, 5 in live)',
    '  --effort <level>             Reasoning effort for codex (default: high)',
    '  --timeout-ms <ms>            Per-stage timeout (default: 600000)',
    '  --out <dir>                  Report directory (default: .loopx/evals/skill-ab/<timestamp>)',
    '  --verify-discrimination      Check that every task fails pristine and passes reference',
  ].join('\n');
}

function spawnCli(command, args, { cwd, env, stdinText = null, timeoutMs = 600_000 }) {
  return new Promise((resolveRun) => {
    const child = spawn(command, args, {
      cwd,
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const stdout = [];
    const stderr = [];
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
    }, timeoutMs);

    child.stdout.on('data', (chunk) => stdout.push(chunk));
    child.stderr.on('data', (chunk) => stderr.push(chunk));
    child.on('error', (error) => {
      clearTimeout(timer);
      resolveRun({ code: null, timedOut, stdout: '', stderr: error.message });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolveRun({
        code,
        timedOut,
        stdout: Buffer.concat(stdout).toString('utf8'),
        stderr: Buffer.concat(stderr).toString('utf8'),
      });
    });
    if (stdinText !== null) {
      child.stdin.end(stdinText);
    } else {
      child.stdin.end();
    }
  });
}

async function exportWorkingTree(destination) {
  await mkdir(destination, { recursive: true });
  const skip = new Set(['.git', '.loopx', '.worktrees', 'node_modules', 'ref']);
  for (const name of ['package.json', 'src', 'skills', 'templates', 'scripts', 'plugins', 'docs', 'assets', 'AGENTS.md', 'README.md', 'README.zh-CN.md']) {
    if (skip.has(name)) continue;
    const srcPath = join(repoRoot, name);
    if (existsSync(srcPath)) {
      await cp(srcPath, join(destination, name), { recursive: true });
    }
  }
}

async function exportGitRef(ref, destination) {
  if (ref === 'working-tree') {
    await exportWorkingTree(destination);
    return;
  }
  await mkdir(destination, { recursive: true });
  const { stdout } = await execFileAsync('git', ['archive', '--format=tar', ref], {
    cwd: repoRoot,
    encoding: 'buffer',
    maxBuffer: 64 * 1024 * 1024,
  });
  await new Promise((resolveExtract, rejectExtract) => {
    const tar = spawn('tar', ['-xf', '-', '-C', destination], { stdio: ['pipe', 'ignore', 'pipe'] });
    const err = [];
    tar.stderr.on('data', (chunk) => err.push(chunk));
    tar.on('close', (code) => {
      if (code === 0) resolveExtract();
      else rejectExtract(new Error(`tar extract failed (${code}): ${Buffer.concat(err).toString('utf8')}`));
    });
    tar.stdin.end(stdout);
  });
}

async function prepareArmHome({ arm, adapter, scratchDir, refExports }) {
  const isolatedHome = join(scratchDir, `home-${arm}`);
  await mkdir(isolatedHome, { recursive: true });

  // Copy only host auth/config files needed by the CLI, never user skills or AGENTS.md.
  if (adapter === 'codex') {
    const userCodex = join(homedir(), '.codex');
    const dstCodex = join(isolatedHome, '.codex');
    await mkdir(dstCodex, { recursive: true });
    for (const file of ['auth.json', 'config.toml']) {
      if (existsSync(join(userCodex, file))) {
        await cp(join(userCodex, file), join(dstCodex, file));
      }
    }
  } else if (adapter === 'claude') {
    const userClaude = join(homedir(), '.claude');
    const dstClaude = join(isolatedHome, '.claude');
    await mkdir(dstClaude, { recursive: true });
    for (const file of ['.credentials.json', 'settings.json']) {
      if (existsSync(join(userClaude, file))) {
        await cp(join(userClaude, file), join(dstClaude, file));
      }
    }
  }

  if (arm === 'loopx-old' || arm === 'loopx-new') {
    const productRoot = refExports[arm];
    const targetFlag = adapter === 'claude' ? 'claude' : 'codex';
    await execFileAsync(
      process.execPath,
      [join(productRoot, 'src', 'cli.mjs'), 'install-skills', '--target', targetFlag, '--yes'],
      {
        cwd: productRoot,
        env: {
          ...process.env,
          HOME: isolatedHome,
          LOOPX_HOME: isolatedHome,
          LOOPX_PROJECT_ROOT: productRoot,
        },
      },
    );
  }

  return isolatedHome;
}

function parseTokensFromJsonl(stdout) {
  let total = 0;
  for (const line of stdout.split('\n')) {
    if (!line.trim()) continue;
    try {
      const obj = JSON.parse(line);
      const usage = obj.usage ?? obj.result?.usage ?? obj.message?.usage;
      if (usage) {
        total += (usage.input_tokens ?? 0) + (usage.output_tokens ?? 0) + (usage.cached_input_tokens ?? 0);
      }
    } catch {
      // Ignore non-JSON lines.
    }
  }
  return total > 0 ? total : null;
}

function createLiveRunner({ adapter, model, effort, timeoutMs, refExports, slimAgreementText, outDir }) {
  let seq = 0;

  async function invokeHost({ prompt, repoDir, homeDir, label }) {
    seq += 1;
    const rawDir = join(outDir, 'raw', `${String(seq).padStart(3, '0')}-${label}`);
    await mkdir(rawDir, { recursive: true });
    const messagePath = join(rawDir, 'message.txt');
    const env = {
      ...process.env,
      HOME: homeDir,
      CODEX_HOME: join(homeDir, '.codex'),
    };

    if (adapter === 'claude') {
      const args = ['-p', prompt, '--model', model, '--output-format', 'stream-json', '--verbose', '--dangerously-skip-permissions'];
      const res = await spawnCli('claude', args, { cwd: repoDir, env, timeoutMs });
      await Promise.all([
        writeFile(join(rawDir, 'stdout.jsonl'), res.stdout),
        writeFile(join(rawDir, 'stderr.txt'), res.stderr),
      ]);
      if (res.timedOut || res.code !== 0) {
        return { blocked: true, error: res.timedOut ? 'timeout' : `claude_exit_${res.code}`, total_tokens: parseTokensFromJsonl(res.stdout) };
      }
      return { blocked: false, responseText: res.stdout, total_tokens: parseTokensFromJsonl(res.stdout) };
    }

    const args = [
      'exec', '-', '--json',
      '-s', 'workspace-write',
      '-C', repoDir,
      '-m', model,
      '-c', `model_reasoning_effort=${JSON.stringify(effort)}`,
      '-o', messagePath,
    ];
    const res = await spawnCli('codex', args, { cwd: repoDir, env, stdinText: prompt, timeoutMs });
    await Promise.all([
      writeFile(join(rawDir, 'codex.jsonl'), res.stdout),
      writeFile(join(rawDir, 'stderr.txt'), res.stderr),
    ]);
    const finalText = await readFile(messagePath, 'utf8').catch(() => '');
    const tokens = parseTokensFromJsonl(res.stdout);
    if (res.timedOut || res.code !== 0) {
      return { blocked: true, error: res.timedOut ? 'timeout' : `codex_exit_${res.code}`, total_tokens: tokens };
    }
    return { blocked: false, responseText: finalText || res.stdout, total_tokens: tokens };
  }

  return {
    async prepareOverlay({ arm, repoDir }) {
      if (arm !== 'slim-agents') return [];
      const written = ['AGENTS.md'];
      await writeFile(join(repoDir, 'AGENTS.md'), slimAgreementText);
      if (adapter === 'claude') {
        await writeFile(join(repoDir, 'CLAUDE.md'), slimAgreementText);
        written.push('CLAUDE.md');
      }
      return written;
    },

    async runStage1({ task, arm, replicate, repoDir, scratchDir }) {
      const homeDir = await prepareArmHome({ arm, adapter, scratchDir, refExports });
      const skillPrefix = (arm === 'loopx-old' || arm === 'loopx-new')
        ? (adapter === 'claude' ? `/${task.category} ` : `$${task.category} `)
        : '';
      return invokeHost({
        prompt: `${skillPrefix}${task.prompt}`,
        repoDir,
        homeDir,
        label: `${task.id}-${arm}-r${replicate}-s1`,
      });
    },

    async runStage2({ task, arm, replicate, repoDir, scratchDir }) {
      // Blind standard implementer: clean bare home, no AGENTS.md/CLAUDE.md from stage 1.
      await rm(join(repoDir, 'AGENTS.md'), { force: true });
      await rm(join(repoDir, 'CLAUDE.md'), { force: true });
      const bareHome = await prepareArmHome({ arm: 'bare', adapter, scratchDir: join(scratchDir, 'stage2'), refExports });
      return invokeHost({
        prompt: task.stage2_prompt,
        repoDir,
        homeDir: bareHome,
        label: `${task.id}-${arm}-r${replicate}-s2`,
      });
    },
  };
}

function createDryRunRunner() {
  return {
    async runStage1({ task, arm, repoDir }) {
      const { applyReference } = await import(resolve(task.referenceApplyPath));
      if (task.mode === 'direct') {
        if (arm === 'bare') {
          // Deterministic fake baseline: fail on bare so dry-run exercises non-trivial deltas.
          return { blocked: false, responseText: 'guessed without reproducing', total_tokens: 12000 };
        }
        const out = await applyReference(repoDir);
        const tokenMap = { 'slim-agents': 18000, 'loopx-old': 48000, 'loopx-new': 21000 };
        return { blocked: false, responseText: out?.responseText ?? 'fixed', total_tokens: tokenMap[arm] ?? 20000 };
      }

      // Two-stage dry-run: Stage 1 writes a marker doc; Stage 2 uses it.
      const artifactPath = join(repoDir, task.stage1_artifact_path);
      await mkdir(dirname(artifactPath), { recursive: true });
      await writeFile(artifactPath, `# Dry-run artifact (${arm})\n`);
      const tokenMap = { bare: 9000, 'slim-agents': 11000, 'loopx-old': 34000, 'loopx-new': 14000 };
      return { blocked: false, artifactPath: task.stage1_artifact_path, total_tokens: tokenMap[arm] ?? 12000 };
    },

    async runStage2({ task, arm, repoDir }) {
      if (arm === 'bare') {
        return { blocked: false, responseText: 'incomplete bare impl', total_tokens: 15000 };
      }
      const { applyReference } = await import(resolve(task.referenceApplyPath));
      const out = await applyReference(repoDir);
      const tokenMap = { 'slim-agents': 19000, 'loopx-old': 28000, 'loopx-new': 17000 };
      return { blocked: false, responseText: out?.responseText ?? 'implemented', total_tokens: tokenMap[arm] ?? 18000 };
    },
  };
}

async function main() {
  if (hasFlag('--help') || hasFlag('-h')) {
    console.log(usage());
    return;
  }

  const dryRun = hasFlag('--dry-run');
  const live = hasFlag('--live');
  const verifyDisc = hasFlag('--verify-discrimination');

  if (!dryRun && !live && !verifyDisc) {
    console.error(usage());
    process.exitCode = 1;
    return;
  }

  let tasks = await loadSkillAbTasks(tasksRoot);
  const skillFilter = option('--skill', 'all');
  if (skillFilter !== 'all') {
    if (!SKILL_AB_CATEGORIES.includes(skillFilter)) {
      throw new Error(`Invalid --skill value: ${skillFilter}`);
    }
    tasks = tasks.filter((task) => task.category === skillFilter);
  }
  const taskFilter = option('--task');
  if (taskFilter) {
    const wanted = new Set(taskFilter.split(',').map((s) => s.trim()).filter(Boolean));
    tasks = tasks.filter((task) => wanted.has(task.id));
  }

  if (verifyDisc || dryRun) {
    for (const task of tasks) {
      const check = await verifyTaskDiscrimination(fixturesRoot, task);
      if (!check.discriminates) {
        throw new Error(
          `Discrimination failed for ${task.id}: pristinePassed=${check.pristinePassed}, solvedPassed=${check.solvedPassed}`,
        );
      }
    }
    if (verifyDisc && !dryRun && !live) {
      console.log(`ok: verified discrimination for ${tasks.length} skill A/B tasks`);
      return;
    }
  }

  const arms = option('--arms', SKILL_AB_ARMS.join(','))
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const replicates = Number.parseInt(option('--replicates', dryRun ? '1' : '5'), 10);
  const concurrency = Number.parseInt(option('--concurrency', '1'), 10);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outDir = resolve(option('--out', join(repoRoot, '.loopx', 'evals', 'skill-ab', timestamp)));

  let runner;
  let exportScratch = null;
  try {
    if (dryRun) {
      runner = createDryRunRunner();
    } else {
      const adapter = option('--adapter', 'codex');
      const model = option('--model');
      const oldRef = option('--old-ref');
      const newRef = option('--new-ref', 'working-tree');
      const effort = option('--effort', 'high');
      const timeoutMs = Number.parseInt(option('--timeout-ms', '600000'), 10);
      if (!model) throw new Error('--model is required for --live');
      if (arms.includes('loopx-old') && !oldRef) throw new Error('--old-ref is required when arm loopx-old is enabled');

      exportScratch = await mkdtemp(join(tmpdir(), 'loopx-skill-ab-refs-'));
      const refExports = {};
      if (arms.includes('loopx-old')) {
        refExports['loopx-old'] = join(exportScratch, 'old');
        await exportGitRef(oldRef, refExports['loopx-old']);
      }
      if (arms.includes('loopx-new')) {
        refExports['loopx-new'] = join(exportScratch, 'new');
        await exportGitRef(newRef, refExports['loopx-new']);
      }
      const slimAgreementText = await readFile(join(repoRoot, 'templates', 'working-agreement.md'), 'utf8');
      runner = createLiveRunner({ adapter, model, effort, timeoutMs, refExports, slimAgreementText, outDir });
    }

    const report = await runSkillAbEvaluation({
      tasks,
      fixturesRoot,
      arms,
      replicates,
      concurrency,
      prepareOverlay: runner.prepareOverlay ?? null,
      runStage1: runner.runStage1,
      runStage2: runner.runStage2,
      onProgress: dryRun ? null : ({ completedCount, totalPlanned, record }) => {
        const status = record.blocked ? `BLOCKED(${record.error})` : (record.passed ? 'PASS' : 'FAIL');
        console.log(`[${completedCount}/${totalPlanned}] ${record.task_id} | ${record.arm} | ${status} | tokens=${record.total_tokens ?? 'n/a'} | ${record.duration_ms}ms`);
      },
    });
    const written = await writeSkillAbReport(outDir, report);
    console.log(`ok: skill A/B ${dryRun ? 'dry-run' : 'live'} complete (${report.scored_runs}/${report.total_runs} scored)`);
    console.log(`report: ${written.mdPath}`);
    console.log(`json:   ${written.jsonPath}`);
  } finally {
    if (exportScratch) {
      await rm(exportScratch, { recursive: true, force: true });
    }
  }
}

await main();
