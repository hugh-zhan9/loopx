import { execFile } from 'node:child_process';
import { readdir, stat, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { runCodexReviewJson } from './codex-exec-runtime.mjs';

const execFileAsync = promisify(execFile);
const DEFAULT_REVIEW_MODEL = 'gpt-5.4';
const MAX_DIFF_PROMPT_CHARS = 18000;

async function gitOutput(cwd, args) {
  const { stdout } = await execFileAsync('git', args, {
    cwd,
    maxBuffer: 1024 * 1024 * 8,
  });
  return stdout.trim();
}

async function gitOutputAllowExit(cwd, args) {
  try {
    return await gitOutput(cwd, args);
  } catch (error) {
    return `${error?.stdout || ''}${error?.stderr || ''}`.trim();
  }
}

async function isGitWorktree(cwd) {
  try {
    return (await gitOutput(cwd, ['rev-parse', '--is-inside-work-tree'])) === 'true';
  } catch {
    return false;
  }
}

export function parseChangedFiles(statusText) {
  return statusText
    .split('\n')
    .map((line) => {
      const match = /^(?:[ MADRCU?!]{1,2}\s+|[MADRCU?!]{1,2}\s+)(.+)$/.exec(line);
      return match ? match[1].trim() : line.trim();
    })
    .map((file) => (file.includes(' -> ') ? file.split(' -> ').at(-1).trim() : file))
    .filter((file) => file && !file.startsWith('.loopx/') && !file.startsWith('.codex-helper/') && !file.startsWith('.LoopX/'));
}

export function parseUntrackedFiles(statusText) {
  return statusText
    .split('\n')
    .filter((line) => line.startsWith('?? '))
    .map((line) => line.slice(3).trim())
    .filter((file) => file && !file.startsWith('.loopx/') && !file.startsWith('.codex-helper/') && !file.startsWith('.LoopX/'));
}

async function expandUntrackedPath(cwd, file) {
  const fullPath = join(cwd, file);
  const info = await stat(fullPath);
  if (!info.isDirectory()) {
    return [file];
  }
  const entries = await readdir(fullPath, { withFileTypes: true });
  const nested = await Promise.all(entries
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((entry) => expandUntrackedPath(cwd, join(file, entry.name))));
  return nested.flat();
}

export async function buildReviewDiffEvidence(cwd, statusText) {
  const trackedDiff = await gitOutput(cwd, ['diff', 'HEAD', '--']);
  const untrackedFiles = parseUntrackedFiles(statusText);
  const untrackedDiffs = [];
  for (const file of untrackedFiles) {
    for (const expandedFile of await expandUntrackedPath(cwd, file)) {
      untrackedDiffs.push(await gitOutputAllowExit(cwd, ['diff', '--no-index', '--', '/dev/null', expandedFile]));
    }
  }
  return [trackedDiff, ...untrackedDiffs].filter(Boolean).join('\n\n');
}

function normalizeFinding(item) {
  if (typeof item === 'string') {
    return {
      severity: 'medium',
      file: null,
      line: null,
      message: item,
    };
  }
  return {
    severity: item?.severity || 'medium',
    file: item?.file || null,
    line: item?.line || null,
    message: item?.message || item?.summary || '未提供具体说明。',
  };
}

function normalizeArchitectureReview(raw = {}) {
  const normalizedVerdict = normalizeToken(raw?.verdict || 'pass');
  const verdict = normalizedVerdict === 'block'
    ? 'block'
    : normalizedVerdict === 'warn'
      ? 'warn'
      : 'pass';
  const normalizedRollbackTarget = normalizeToken(raw?.rollbackTarget);
  const rollbackTarget = ['build', 'plan', 'clarify'].includes(normalizedRollbackTarget) ? normalizedRollbackTarget : null;
  return {
    status: raw?.status || 'complete',
    verdict,
    summary: raw?.summary || (verdict === 'pass' ? '架构 smell 扫描通过。' : '架构 smell 扫描发现风险。'),
    rollbackTarget,
    findings: Array.isArray(raw?.findings) ? raw.findings.map(normalizeFinding) : [],
  };
}

function normalizeToken(value) {
  return String(value || '').trim().toLowerCase().replace(/[\s_]+/g, '-');
}

function normalizeCodeReview(raw, changedFiles) {
  const normalizedVerdict = normalizeToken(raw?.verdict);
  const verdict = normalizedVerdict === 'request-changes' ? 'request-changes' : 'approve';
  const findings = Array.isArray(raw?.findings) ? raw.findings.map(normalizeFinding) : [];
  const normalizedRollbackTarget = normalizeToken(raw?.rollbackTarget);
  const rollbackTarget = ['build', 'plan', 'clarify'].includes(normalizedRollbackTarget) ? normalizedRollbackTarget : null;
  return {
    status: raw?.status || 'complete',
    verdict,
    summary: raw?.summary || (verdict === 'approve' ? '代码差异审查未发现阻断问题。' : '代码差异审查发现需要修改的问题。'),
    rollbackTarget,
    changedFiles,
    findings,
  };
}

export function reviewContextPromptLines(context) {
  return [
    `reviewContextManifestStatus: ${context.contextManifestStatus || 'fallback'}`,
    `reviewContextManifestPath: ${context.contextManifestPath || ''}`,
    `reviewContextManifestRows: ${JSON.stringify((context.contextManifestRows || []).map((row) => ({
      kind: row.kind,
      path: row.path,
      reason: row.reason,
      priority: row.priority,
    })))}`,
  ];
}

export function createDefaultReviewAdapter() {
  return createRealReviewAdapter();
}

function truncateForPrompt(text, maxChars = MAX_DIFF_PROMPT_CHARS) {
  const value = String(text || '');
  if (value.length <= maxChars) {
    return value;
  }
  return `${value.slice(0, maxChars)}\n[truncated ${value.length - maxChars} chars]`;
}

export function buildCodeReviewPrompt(context, changedFiles, diffCheck = '') {
  const gitStatusShort = truncateForPrompt(context.gitStatusShort || '');
  const gitDiffStat = truncateForPrompt(context.gitDiffStat || '');
  const gitDiff = truncateForPrompt(context.gitDiff || '');
  const gitDiffEvidencePath = context.gitDiffEvidencePath || '';
  return [
    `你是 loopx workflow "${context.slug}" 的独立 code reviewer。`,
    '请审查当前 git 工作区相对 HEAD 的代码差异，包括 staged、unstaged 和 untracked 文件。',
    gitDiffEvidencePath
      ? '必须以本 prompt 中的当前 git status/diff 预览和完整 git diff evidence 文件为事实来源；不要把既有 review-report.md 或 review-support/code-review.json 当作当前事实来源。'
      : '必须以本 prompt 中的当前 git status/diff 为事实来源；不要把既有 review-report.md 或 review-support/code-review.json 当作当前事实来源。',
    '重点查找真实 bug、回归风险、遗漏测试、接口契约破坏、安全/数据一致性问题。不要因为风格偏好提出阻断意见。',
    '不要修改文件，不要运行 build，不要补代码；只做 code review。',
    '请返回纯 JSON，不要 markdown，结构必须是：',
    '{',
    '  "status": "complete" | "skipped",',
    '  "verdict": "approve" | "request-changes",',
    '  "summary": "中文摘要",',
    '  "rollbackTarget": "build" | "plan" | "clarify" | null,',
    '  "findings": [{"severity": "high" | "medium" | "low", "file": "相对路径", "line": number | null, "message": "中文问题说明"}]',
    '}',
    '',
    '若发现 high 或 medium 级别的真实问题，verdict 必须是 "request-changes"。没有阻断问题时 verdict 为 "approve"。',
    '当问题属于实现 bug、测试缺口或小范围契约修复时，rollbackTarget 用 "build"。',
    '当问题说明计划本身错误、范围不清或架构方向需要调整时，rollbackTarget 用 "plan"。',
    '当问题暴露需求仍不清楚时，rollbackTarget 用 "clarify"。',
    '当 verdict 为 "approve" 时，rollbackTarget 必须为 null。',
    '',
    `executionRecordPath: ${context.executionRecordPath}`,
    `planArtifactPath: ${context.planArtifactPath || ''}`,
    `testSpecArtifactPath: ${context.testSpecArtifactPath || ''}`,
    ...reviewContextPromptLines(context),
    ...(gitDiffEvidencePath ? [
      `完整 git diff evidence 文件: ${gitDiffEvidencePath}`,
      '当前 prompt 中的 git diff 是紧凑预览；必须读取该文件后再给出 code review 结论。',
    ] : []),
    `changedFiles: ${JSON.stringify(changedFiles)}`,
    '',
    `当前 git status --short:\n${gitStatusShort || '(empty)'}`,
    '',
    `当前 git diff --stat:\n${gitDiffStat || '(empty)'}`,
    '',
    `当前 git diff -- HEAD:\n${gitDiff || '(empty)'}`,
    '',
    diffCheck ? `git diff --check output:\n${diffCheck}` : 'git diff --check output: clean',
  ].join('\n');
}

export function buildArchitectureReviewPrompt(context, changedFiles) {
  const gitStatusShort = truncateForPrompt(context.gitStatusShort || '');
  const gitDiffStat = truncateForPrompt(context.gitDiffStat || '');
  const gitDiff = truncateForPrompt(context.gitDiff || '');
  const gitDiffEvidencePath = context.gitDiffEvidencePath || '';
  return [
    `你是 loopx workflow "${context.slug}" 的 architecture smell reviewer。`,
    '这是 `$review` 内部的轻量架构检查 lane，不是新阶段，不要修改文件，不要运行 build。',
    '你的目标是发现会影响长期可维护性、测试 seam、领域边界或 plan 架构假设落地的真实问题。',
    '只在问题足够严重、需要回退 plan/build/clarify 时返回 verdict "block"；普通建议用 "warn"；没有实质问题用 "pass"。',
    '',
    '重点检查：',
    '- 浅模块：接口复杂度接近或超过实现复杂度。',
    '- 缺少稳定测试 seam：关键行为无法通过公共接口验证。',
    '- 领域概念泄漏：同一领域规则散落在无关模块或跨层穿透。',
    '- 重复规则：同一业务规则被多处复制实现。',
    '- plan 架构假设与实际实现不一致。',
    '',
    '请返回纯 JSON，不要 markdown，结构必须是：',
    '{',
    '  "status": "complete" | "skipped",',
    '  "verdict": "pass" | "warn" | "block",',
    '  "summary": "中文摘要",',
    '  "rollbackTarget": "build" | "plan" | "clarify" | null,',
    '  "findings": [{"severity": "high" | "medium" | "low", "file": "相对路径", "line": number | null, "message": "中文问题说明"}]',
    '}',
    '',
    'verdict 为 "block" 时 rollbackTarget 必须非 null。',
    '实现边界或测试 seam 可局部修复时 rollbackTarget 用 "build"。',
    '计划模块 seam、架构方向或 slice 拆解错误时 rollbackTarget 用 "plan"。',
    '领域语言或需求边界仍不清楚时 rollbackTarget 用 "clarify"。',
    '',
    `executionRecordPath: ${context.executionRecordPath}`,
    `planArtifactPath: ${context.planArtifactPath || ''}`,
    `testSpecArtifactPath: ${context.testSpecArtifactPath || ''}`,
    `changeArtifactPaths: ${JSON.stringify(context.changeArtifactPaths || {})}`,
    ...reviewContextPromptLines(context),
    ...(gitDiffEvidencePath ? [
      `完整 git diff evidence 文件: ${gitDiffEvidencePath}`,
      '当前 prompt 中的 git diff 是紧凑预览；必须读取该文件后再判断是否存在架构 smell。',
    ] : []),
    `changedFiles: ${JSON.stringify(changedFiles)}`,
    '',
    `当前 git status --short:\n${gitStatusShort || '(empty)'}`,
    '',
    `当前 git diff --stat:\n${gitDiffStat || '(empty)'}`,
    '',
    `当前 git diff -- HEAD:\n${gitDiff || '(empty)'}`,
  ].join('\n');
}

export function createRealReviewAdapter({ model, codexReviewJson = runCodexReviewJson } = {}) {
  return {
    async codeReview(context) {
      if (!(await isGitWorktree(context.cwd))) {
        return {
          status: 'skipped',
          verdict: 'approve',
          summary: '当前目录不是 git 工作区，已跳过代码差异审查。',
          changedFiles: [],
          findings: [],
        };
      }

      const statusText = await gitOutput(context.cwd, ['status', '--short']);
      const changedFiles = parseChangedFiles(statusText);
      if (changedFiles.length === 0) {
        return {
          status: 'complete',
          verdict: 'approve',
          summary: '未检测到需要审查的代码差异。',
          changedFiles: [],
          findings: [],
        };
      }

      let diffCheck = '';
      try {
        await gitOutput(context.cwd, ['diff', '--check', 'HEAD', '--']);
      } catch (error) {
        diffCheck = error?.stdout || error?.stderr || error?.message || String(error);
      }
      const gitDiffStat = await gitOutput(context.cwd, ['diff', '--stat', 'HEAD', '--']);
      const gitDiff = await buildReviewDiffEvidence(context.cwd, statusText);

      await mkdir(join(context.root, 'review-support'), { recursive: true });
      const outputPath = join(context.root, 'review-support', 'code-review.raw.json');
      const gitDiffEvidencePath = join(context.root, 'review-support', 'code-review-diff.patch');
      await writeFile(gitDiffEvidencePath, gitDiff || '');
      const prompt = buildCodeReviewPrompt({
        ...context,
        gitStatusShort: statusText,
        gitDiffStat,
        gitDiff,
        gitDiffEvidencePath,
      }, changedFiles, diffCheck);

      const raw = await codexReviewJson({
        cwd: context.cwd,
        prompt,
        outputPath,
        model,
        reviewMode: true,
        uncommitted: true,
      });
      return normalizeCodeReview(raw, changedFiles);
    },
    async architectureReview(context) {
      if (!(await isGitWorktree(context.cwd))) {
        return normalizeArchitectureReview({
          status: 'skipped',
          verdict: 'pass',
          summary: '当前目录不是 git 工作区，已跳过架构 smell 扫描。',
          findings: [],
        });
      }
      const statusText = await gitOutput(context.cwd, ['status', '--short']);
      const changedFiles = parseChangedFiles(statusText);
      if (changedFiles.length === 0) {
        return normalizeArchitectureReview({
          status: 'complete',
          verdict: 'pass',
          summary: '未检测到代码差异，架构 smell 扫描通过。',
          findings: [],
        });
      }
      const gitDiffStat = await gitOutput(context.cwd, ['diff', '--stat', 'HEAD', '--']);
      const gitDiff = await buildReviewDiffEvidence(context.cwd, statusText);
      await mkdir(join(context.root, 'review-support'), { recursive: true });
      const outputPath = join(context.root, 'review-support', 'architecture-smell.raw.json');
      const gitDiffEvidencePath = join(context.root, 'review-support', 'code-review-diff.patch');
      const prompt = buildArchitectureReviewPrompt({
        ...context,
        gitStatusShort: statusText,
        gitDiffStat,
        gitDiff,
        gitDiffEvidencePath,
      }, changedFiles);
      const raw = await codexReviewJson({
        cwd: context.cwd,
        prompt,
        outputPath,
        model,
        reviewMode: true,
        uncommitted: true,
      });
      return normalizeArchitectureReview(raw);
    },
  };
}

export function createScriptedReviewAdapter(script = {}) {
  return {
    async codeReview() {
      return normalizeCodeReview(script.codeReview || {
        status: 'complete',
        verdict: 'approve',
        summary: '脚本化 code review 通过。',
        findings: [],
      }, script.changedFiles || []);
    },
    async architectureReview() {
      return normalizeArchitectureReview(script.architectureReview || {
        status: 'complete',
        verdict: 'pass',
        summary: '架构 smell 扫描通过。',
        findings: [],
      });
    },
  };
}
