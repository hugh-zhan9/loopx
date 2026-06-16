import { execFile } from 'node:child_process';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

async function gitConfig(cwd, key) {
  try {
    const { stdout } = await execFileAsync('git', ['config', key], { cwd });
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

export async function resolveDeveloperIdentity(cwd, env = process.env) {
  return env.LOOPX_DEVELOPER
    || await gitConfig(cwd, 'user.email')
    || await gitConfig(cwd, 'user.name')
    || env.USER
    || 'unknown-developer';
}

export function sanitizeDeveloperIdentity(identity) {
  return String(identity || 'unknown-developer')
    .trim()
    .replace(/[^a-zA-Z0-9._@-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'unknown-developer';
}

export async function appendWorkspaceJournal({ cwd, workspaceRoot, slug, stage = 'review', verdict, reviewMessageZh, verificationEvidence = [], decisions = [], risks = [], followUps = [], env = process.env }) {
  const developer = sanitizeDeveloperIdentity(await resolveDeveloperIdentity(cwd, env));
  const root = join(workspaceRoot, 'workspace', developer);
  await mkdir(root, { recursive: true });
  const entries = await readdir(root, { withFileTypes: true });
  const existingNumbers = entries
    .filter((entry) => entry.isFile())
    .map((entry) => /^journal-(\d+)\.md$/.exec(entry.name))
    .filter(Boolean)
    .map((match) => Number(match[1]))
    .filter((value) => Number.isInteger(value) && value > 0);
  const journalNumber = existingNumbers.length > 0 ? Math.max(...existingNumbers) + 1 : 1;
  const journalPath = join(root, `journal-${journalNumber}.md`);
  const indexPath = join(root, 'index.md');
  const entry = [
    '# loopx Workspace Journal',
    '',
    `## ${slug} - ${new Date().toISOString()}`,
    '',
    `- 阶段：${stage}`,
    `- 结论：${verdict}`,
    `- 摘要：${reviewMessageZh || '无'}`,
    '- 关键决策：',
    ...(decisions.length > 0 ? decisions : ['保持当前用户指令和 repo specs 为主要依据。']).map((item) => `  - ${item}`),
    '- 验证命令：',
    ...(verificationEvidence.length > 0 ? verificationEvidence : ['见本次任务的最终验证记录。']).map((item) => `  - ${item}`),
    '- 残余风险：',
    ...(risks.length > 0 ? risks : ['暂无新增残余风险。']).map((item) => `  - ${item}`),
    '- 后续项：',
    ...(followUps.length > 0 ? followUps : ['按 review 审批结果推进。']).map((item) => `  - ${item}`),
    '',
  ].join('\n');
  await writeFile(journalPath, entry);
  const nextIndex = [...existingNumbers, journalNumber].sort((left, right) => left - right);
  await writeFile(indexPath, `# loopx Workspace Journal Index\n\n${nextIndex.map((number) => `- [journal-${number}.md](journal-${number}.md)`).join('\n')}\n`);
  return { developer, journalPath, indexPath };
}
