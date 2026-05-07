import { execFile } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { runCodexExecJson } from './codex-exec-runtime.mjs';

const execFileAsync = promisify(execFile);
const DEFAULT_REVIEW_MODEL = 'gpt-5.4';

async function gitOutput(cwd, args) {
  const { stdout } = await execFileAsync('git', args, {
    cwd,
    maxBuffer: 1024 * 1024 * 8,
  });
  return stdout.trim();
}

async function isGitWorktree(cwd) {
  try {
    return (await gitOutput(cwd, ['rev-parse', '--is-inside-work-tree'])) === 'true';
  } catch {
    return false;
  }
}

function parseChangedFiles(statusText) {
  return statusText
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^.../, '').trim())
    .filter((file) => file && !file.startsWith('.loopx/') && !file.startsWith('.codex-helper/') && !file.startsWith('.LoopX/'));
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

function normalizeCodeReview(raw, changedFiles) {
  const verdict = raw?.verdict === 'request-changes' ? 'request-changes' : 'approve';
  const findings = Array.isArray(raw?.findings) ? raw.findings.map(normalizeFinding) : [];
  return {
    status: raw?.status || 'complete',
    verdict,
    summary: raw?.summary || (verdict === 'approve' ? '代码差异审查未发现阻断问题。' : '代码差异审查发现需要修改的问题。'),
    changedFiles,
    findings,
  };
}

export function createDefaultReviewAdapter() {
  return createRealReviewAdapter();
}

export function createRealReviewAdapter({ model } = {}) {
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

      await mkdir(join(context.root, 'review-support'), { recursive: true });
      const outputPath = join(context.root, 'review-support', 'code-review.json');
      const prompt = [
        `你是 loopx workflow "${context.slug}" 的独立 code reviewer。`,
        '请审查当前 git 工作区相对 HEAD 的代码差异，包括 staged、unstaged 和 untracked 文件。',
        '重点查找真实 bug、回归风险、遗漏测试、接口契约破坏、安全/数据一致性问题。不要因为风格偏好提出阻断意见。',
        '不要修改文件，不要运行 build，不要补代码；只做 code review。',
        '请返回纯 JSON，不要 markdown，结构必须是：',
        '{',
        '  "status": "complete" | "skipped",',
        '  "verdict": "approve" | "request-changes",',
        '  "summary": "中文摘要",',
        '  "findings": [{"severity": "high" | "medium" | "low", "file": "相对路径", "line": number | null, "message": "中文问题说明"}]',
        '}',
        '',
        '若发现 high 或 medium 级别的真实问题，verdict 必须是 "request-changes"。没有阻断问题时 verdict 为 "approve"。',
        '',
        `executionRecordPath: ${context.executionRecordPath}`,
        `planArtifactPath: ${context.planArtifactPath || ''}`,
        `testSpecArtifactPath: ${context.testSpecArtifactPath || ''}`,
        `changedFiles: ${JSON.stringify(changedFiles)}`,
        diffCheck ? `git diff --check output:\n${diffCheck}` : 'git diff --check output: clean',
      ].join('\n');

      const raw = await runCodexExecJson({
        cwd: context.cwd,
        prompt,
        outputPath,
        model,
      });
      return normalizeCodeReview(raw, changedFiles);
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
  };
}
