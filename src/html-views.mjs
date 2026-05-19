import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join, relative } from 'node:path';

import { nextSkillCommand } from './next-skill.mjs';
import { statusSummary } from './workflow.mjs';

const WORKFLOW_ARTIFACTS = [
  { name: 'spec.md', label: '需求工作副本', page: 'intake.html' },
  { name: 'plan.md', label: '计划', page: 'plan.html' },
  { name: 'architecture.md', label: '架构', page: 'plan.html' },
  { name: 'development-plan.md', label: '开发计划', page: 'plan.html' },
  { name: 'test-plan.md', label: '测试计划', page: 'plan.html' },
  { name: 'execution-record.md', label: '执行记录', page: 'build.html' },
  { name: 'review-report.md', label: '评审报告', page: 'review.html' },
];

const PAGE_GROUPS = [
  { file: 'intake.html', title: '需求澄清', artifacts: ['spec.md'] },
  { file: 'plan.html', title: '计划与架构', artifacts: ['plan.md', 'architecture.md', 'development-plan.md', 'test-plan.md'] },
  { file: 'build.html', title: '执行与验证', artifacts: ['execution-record.md'] },
  { file: 'review.html', title: '评审结论', artifacts: ['review-report.md'] },
];

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function htmlDoc({ title, body }) {
  return [
    '<!doctype html>',
    '<html lang="zh-CN">',
    '<head>',
    '  <meta charset="utf-8">',
    '  <meta name="viewport" content="width=device-width, initial-scale=1">',
    `  <title>${escapeHtml(title)}</title>`,
    '  <style>',
    '    :root { color-scheme: light; --text: #17202a; --muted: #5f6f7f; --line: #d8e0e8; --bg: #f6f8fa; --panel: #ffffff; --accent: #1769aa; }',
    '    * { box-sizing: border-box; }',
    '    body { margin: 0; font: 15px/1.65 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: var(--text); background: var(--bg); }',
    '    main { max-width: 1080px; margin: 0 auto; padding: 28px 20px 48px; }',
    '    header { margin-bottom: 20px; }',
    '    h1 { margin: 0 0 8px; font-size: 28px; line-height: 1.25; }',
    '    h2 { margin: 24px 0 10px; font-size: 18px; }',
    '    h3 { margin: 18px 0 8px; font-size: 16px; }',
    '    a { color: var(--accent); text-decoration: none; }',
    '    a:hover { text-decoration: underline; }',
    '    .muted { color: var(--muted); }',
    '    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; }',
    '    .panel { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 14px 16px; }',
    '    .badge { display: inline-block; border: 1px solid var(--line); border-radius: 999px; padding: 2px 9px; margin: 2px 4px 2px 0; color: var(--muted); background: #fff; font-size: 12px; }',
    '    table { width: 100%; border-collapse: collapse; background: var(--panel); border: 1px solid var(--line); }',
    '    th, td { padding: 8px 10px; border-bottom: 1px solid var(--line); text-align: left; vertical-align: top; }',
    '    th { color: var(--muted); font-weight: 600; }',
    '    pre { overflow: auto; padding: 12px; background: #0f1720; color: #edf4fb; border-radius: 8px; }',
    '    code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }',
    '    .markdown { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 16px; }',
    '  </style>',
    '</head>',
    '<body>',
    '<main>',
    body,
    '</main>',
    '</body>',
    '</html>',
  ].join('\n');
}

function listItems(items) {
  const values = Array.isArray(items) ? items.filter(Boolean) : [];
  if (values.length === 0) {
    return '<span class="muted">无</span>';
  }
  return values.map((item) => `<span class="badge">${escapeHtml(item)}</span>`).join(' ');
}

function markdownToHtml(markdown) {
  const lines = String(markdown || '').split('\n');
  const html = [];
  let inCode = false;
  let listOpen = false;

  const closeList = () => {
    if (listOpen) {
      html.push('</ul>');
      listOpen = false;
    }
  };

  for (const line of lines) {
    if (line.startsWith('```')) {
      if (inCode) {
        html.push('</code></pre>');
        inCode = false;
      } else {
        closeList();
        html.push('<pre><code>');
        inCode = true;
      }
      continue;
    }
    if (inCode) {
      html.push(escapeHtml(line));
      continue;
    }
    if (/^#{1,4}\s+/.test(line)) {
      closeList();
      const level = Math.min(4, line.match(/^#+/)?.[0].length || 2);
      html.push(`<h${level}>${escapeHtml(line.replace(/^#{1,4}\s+/, ''))}</h${level}>`);
      continue;
    }
    if (line.startsWith('- ')) {
      if (!listOpen) {
        html.push('<ul>');
        listOpen = true;
      }
      html.push(`<li>${escapeHtml(line.slice(2))}</li>`);
      continue;
    }
    if (!line.trim()) {
      closeList();
      continue;
    }
    closeList();
    html.push(`<p>${escapeHtml(line)}</p>`);
  }
  closeList();
  if (inCode) {
    html.push('</code></pre>');
  }
  return html.join('\n');
}

function artifactLink(viewRoot, artifactPath, label) {
  const href = relative(viewRoot, artifactPath).replaceAll('\\', '/');
  return `<a href="${escapeHtml(href)}">${escapeHtml(label)}</a>`;
}

function statusPanels(status) {
  const state = status.state || {};
  const readiness = state.readiness || {};
  const authorization = state.authorization || {};
  const nextSkill = nextSkillCommand(state);
  return [
    '<section class="grid">',
    `<div class="panel"><strong>阶段</strong><br>${escapeHtml(state.current_stage || '(none)')}</div>`,
    `<div class="panel"><strong>状态</strong><br>${escapeHtml(state.stage_status || '(unknown)')}</div>`,
    `<div class="panel"><strong>下一步</strong><br><code>${escapeHtml(nextSkill || status.next_action || 'none')}</code></div>`,
    `<div class="panel"><strong>归档</strong><br>${escapeHtml(state.archive_status || 'pending')}</div>`,
    '</section>',
    '<section class="panel">',
    '<h2>readiness / authorization</h2>',
    '<table><thead><tr><th>关卡</th><th>ready</th><th>authorized</th><th>blockers</th></tr></thead><tbody>',
    ...['plan', 'build', 'review', 'done', 'archive'].map((key) => [
      '<tr>',
      `<td>${escapeHtml(key)}</td>`,
      `<td>${escapeHtml(readiness[key]?.ready ?? false)}</td>`,
      `<td>${escapeHtml(authorization[key]?.authorized ?? false)}</td>`,
      `<td>${listItems(readiness[key]?.blockers || [])}</td>`,
      '</tr>',
    ].join('')),
    '</tbody></table>',
    '</section>',
  ].join('\n');
}

async function renderWorkflowPages(status) {
  const root = status.root;
  const viewRoot = join(root, 'view');
  await mkdir(viewRoot, { recursive: true });

  const artifactRows = WORKFLOW_ARTIFACTS.map((artifact) => {
    const artifactPath = join(root, artifact.name);
    return {
      ...artifact,
      path: artifactPath,
      exists: existsSync(artifactPath),
    };
  });

  for (const group of PAGE_GROUPS) {
    const sections = [];
    for (const artifactName of group.artifacts) {
      const artifact = artifactRows.find((item) => item.name === artifactName);
      if (!artifact?.exists) {
        continue;
      }
      const text = await readFile(artifact.path, 'utf8');
      sections.push([
        `<section class="markdown">`,
        `<p class="muted">${artifactLink(viewRoot, artifact.path, artifact.name)}</p>`,
        markdownToHtml(text),
        '</section>',
      ].join('\n'));
    }
    await writeFile(join(viewRoot, group.file), htmlDoc({
      title: `${group.title} - ${status.slug}`,
      body: [
        '<header>',
        `<h1>${escapeHtml(group.title)}</h1>`,
        `<p class="muted">工作流：${escapeHtml(status.slug)}</p>`,
        '<p><a href="index.html">返回工作流首页</a></p>',
        '</header>',
        sections.length > 0 ? sections.join('\n') : '<section class="panel muted">暂无对应产物。</section>',
      ].join('\n'),
    }));
  }

  const indexBody = [
    '<header>',
    `<h1>工作流 ${escapeHtml(status.slug)}</h1>`,
    `<p class="muted">HTML 是派生阅读视图；Markdown 和 JSON 仍是运行时事实源。</p>`,
    '</header>',
    statusPanels(status),
    '<section class="panel">',
    '<h2>关键产物</h2>',
    '<table><thead><tr><th>产物</th><th>状态</th><th>阅读视图</th><th>原始文件</th></tr></thead><tbody>',
    ...artifactRows.map((artifact) => [
      '<tr>',
      `<td>${escapeHtml(artifact.label)}</td>`,
      `<td>${artifact.exists ? '存在' : '缺失'}</td>`,
      `<td>${artifact.exists ? `<a href="${escapeHtml(artifact.page)}">${escapeHtml(basename(artifact.page))}</a>` : '<span class="muted">无</span>'}</td>`,
      `<td>${artifact.exists ? artifactLink(viewRoot, artifact.path, artifact.name) : '<span class="muted">无</span>'}</td>`,
      '</tr>',
    ].join('')),
    '</tbody></table>',
    '</section>',
  ].join('\n');

  const workflowViewPath = join(viewRoot, 'index.html');
  await writeFile(workflowViewPath, htmlDoc({
    title: `loopx 工作流 ${status.slug}`,
    body: indexBody,
  }));

  return workflowViewPath;
}

async function renderWorkspaceIndex(workspaceStatus, renderedSlugs = []) {
  const viewsRoot = join(workspaceStatus.workspaceRoot, 'views');
  await mkdir(viewsRoot, { recursive: true });
  const rendered = new Set(renderedSlugs);
  const rows = (workspaceStatus.workflows || []).map((workflow) => {
    const href = `../workflows/${workflow.slug}/view/index.html`;
    const link = rendered.has(workflow.slug)
      ? `<a href="${escapeHtml(href)}">${escapeHtml(workflow.slug)}</a>`
      : escapeHtml(workflow.slug);
    return [
      '<tr>',
      `<td>${link}</td>`,
      `<td>${escapeHtml(workflow.current_stage || '(none)')}</td>`,
      `<td>${escapeHtml(workflow.contract)}</td>`,
      `<td>${escapeHtml(workflow.missing_artifact_count)}</td>`,
      '</tr>',
    ].join('');
  });
  const workspaceViewPath = join(viewsRoot, 'index.html');
  await writeFile(workspaceViewPath, htmlDoc({
    title: 'loopx 工作台',
    body: [
      '<header>',
      '<h1>loopx 工作台</h1>',
      `<p class="muted">工作区：${escapeHtml(workspaceStatus.workspaceRoot)}</p>`,
      '</header>',
      '<section class="panel">',
      '<h2>工作流</h2>',
      '<table><thead><tr><th>工作流</th><th>阶段</th><th>契约</th><th>缺失产物数</th></tr></thead><tbody>',
      rows.join('\n') || '<tr><td colspan="4" class="muted">暂无工作流。</td></tr>',
      '</tbody></table>',
      '</section>',
    ].join('\n'),
  }));
  return workspaceViewPath;
}

export async function renderHtmlViews(cwd, { slug = null, all = false } = {}) {
  const workspaceStatus = await statusSummary(cwd);
  if (!workspaceStatus.initialized) {
    throw new Error('loopx_workspace_not_initialized');
  }

  const workflowViews = [];
  if (all || !slug) {
    for (const workflow of workspaceStatus.workflows) {
      if (workflow.legacy) {
        continue;
      }
      const workflowStatus = await statusSummary(cwd, workflow.slug);
      workflowViews.push({
        slug: workflow.slug,
        path: await renderWorkflowPages(workflowStatus),
      });
    }
  } else if (slug) {
    const workflowStatus = await statusSummary(cwd, slug);
    if (!workflowStatus.state || workflowStatus.legacy) {
      throw new Error('render_workflow_not_available');
    }
    workflowViews.push({
      slug: workflowStatus.slug,
      path: await renderWorkflowPages(workflowStatus),
    });
  }

  const workspaceViewPath = await renderWorkspaceIndex(workspaceStatus, workflowViews.map((item) => item.slug));
  return {
    workflowViews,
    workflowViewPath: workflowViews[0]?.path || null,
    workspaceViewPath,
  };
}
