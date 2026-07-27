import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';

import { statusSummary } from './workflow.mjs';

const DOCUMENTS = [
  { key: 'clarification_path', label: 'Clarification' },
  { key: 'requirements_path', label: 'Requirements' },
  { key: 'working_copy_path', label: 'Working Copy' },
];

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function inlineMarkdown(value) {
  return escapeHtml(value)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
}

function markdownToHtml(text) {
  const output = [];
  let listOpen = false;
  let codeOpen = false;

  const closeList = () => {
    if (listOpen) {
      output.push('</ul>');
      listOpen = false;
    }
  };

  for (const line of String(text || '').split('\n')) {
    if (line.startsWith('```')) {
      closeList();
      output.push(codeOpen ? '</code></pre>' : '<pre><code>');
      codeOpen = !codeOpen;
      continue;
    }
    if (codeOpen) {
      output.push(`${escapeHtml(line)}\n`);
      continue;
    }
    const heading = /^(#{1,4})\s+(.+)$/.exec(line);
    if (heading) {
      closeList();
      const level = heading[1].length;
      output.push(`<h${level}>${inlineMarkdown(heading[2])}</h${level}>`);
      continue;
    }
    const item = /^\s*[-*]\s+(.+)$/.exec(line);
    if (item) {
      if (!listOpen) {
        output.push('<ul>');
        listOpen = true;
      }
      output.push(`<li>${inlineMarkdown(item[1])}</li>`);
      continue;
    }
    closeList();
    if (line.trim()) {
      output.push(`<p>${inlineMarkdown(line)}</p>`);
    }
  }
  closeList();
  if (codeOpen) {
    output.push('</code></pre>');
  }
  return output.join('\n');
}

function htmlDocument(title, body) {
  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '  <meta charset="utf-8">',
    '  <meta name="viewport" content="width=device-width, initial-scale=1">',
    `  <title>${escapeHtml(title)}</title>`,
    '  <style>',
    '    body { margin: 0; font: 15px/1.65 system-ui, sans-serif; color: #18212b; background: #f7f8fa; }',
    '    main { max-width: 920px; margin: 0 auto; padding: 28px 20px 56px; }',
    '    nav { display: flex; flex-wrap: wrap; gap: 12px; margin: 16px 0 24px; }',
    '    section { border-top: 1px solid #d9dee5; padding: 20px 0; }',
    '    h1, h2, h3, h4 { line-height: 1.3; }',
    '    a { color: #1769aa; }',
    '    code { font-family: ui-monospace, monospace; background: #edf0f4; padding: 1px 4px; }',
    '    pre { overflow: auto; background: #18212b; color: #f5f7fa; padding: 14px; }',
    '  </style>',
    '</head>',
    `<body><main>${body}</main></body>`,
    '</html>',
  ].join('\n');
}

function resolveDocumentPath(root, candidate) {
  if (!candidate) {
    return null;
  }
  return isAbsolute(candidate) ? candidate : resolve(dirname(dirname(root)), candidate);
}

async function renderWorkflow(status) {
  const viewRoot = join(status.root, 'view');
  await mkdir(viewRoot, { recursive: true });
  const available = DOCUMENTS
    .map((document) => ({
      ...document,
      path: resolveDocumentPath(status.root, status.documents?.[document.key]),
    }))
    .filter((document) => document.path && existsSync(document.path));

  const sections = [];
  for (const document of available) {
    sections.push([
      `<section id="${escapeHtml(document.key)}">`,
      `<h2>${escapeHtml(document.label)}</h2>`,
      markdownToHtml(await readFile(document.path, 'utf8')),
      '</section>',
    ].join('\n'));
  }
  const navigation = available
    .map((document) => `<a href="#${escapeHtml(document.key)}">${escapeHtml(document.label)}</a>`)
    .join('');
  const body = [
    `<h1>${escapeHtml(status.slug)}</h1>`,
    `<nav><a href="../../../views/index.html">All document sets</a>${navigation}</nav>`,
    sections.join('\n') || '<p>No documents found.</p>',
  ].join('\n');
  const path = join(viewRoot, 'index.html');
  await writeFile(path, htmlDocument(status.slug, body));
  return path;
}

async function renderWorkspaceIndex(status, renderedSlugs) {
  const viewsRoot = join(status.workspaceRoot, 'views');
  await mkdir(viewsRoot, { recursive: true });
  const rendered = new Set(renderedSlugs);
  const items = status.workflows.map((workflow) => {
    const label = escapeHtml(workflow.slug);
    return rendered.has(workflow.slug)
      ? `<li><a href="../workflows/${label}/view/index.html">${label}</a></li>`
      : `<li>${label}</li>`;
  });
  const body = `<h1>loopx Documents</h1>\n<ul>${items.join('\n')}</ul>`;
  const path = join(viewsRoot, 'index.html');
  await writeFile(path, htmlDocument('loopx Documents', body));
  return path;
}

export async function renderHtmlViews(cwd, { slug = null, all = false } = {}) {
  const workspaceStatus = await statusSummary(cwd);
  if (!workspaceStatus.initialized) {
    throw new Error('loopx_workspace_not_initialized');
  }

  const slugs = all || !slug ? workspaceStatus.workflows.map((workflow) => workflow.slug) : [slug];
  const workflowViews = [];
  for (const itemSlug of slugs) {
    const workflowStatus = await statusSummary(cwd, itemSlug);
    if (!workflowStatus.documents) {
      throw new Error('render_workflow_not_available');
    }
    workflowViews.push({ slug: workflowStatus.slug, path: await renderWorkflow(workflowStatus) });
  }
  const workspaceViewPath = await renderWorkspaceIndex(workspaceStatus, workflowViews.map((item) => item.slug));
  return {
    workflowViews,
    workflowViewPath: workflowViews[0]?.path || null,
    workspaceViewPath,
  };
}
