import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join, relative } from 'node:path';

import { nextSkillCommand } from './next-skill.mjs';
import { statusSummary } from './workflow.mjs';

const WORKFLOW_ARTIFACTS = [
  { id: 'spec', name: 'spec.md', label: '需求工作副本', page: 'intake.html' },
  { id: 'plan', name: 'plan.md', label: '计划', page: 'plan.html' },
  { id: 'architecture', name: 'architecture.md', label: '架构', page: 'plan.html' },
  { id: 'development-plan', name: 'development-plan.md', label: '开发计划', page: 'plan.html' },
  { id: 'test-plan', name: 'test-plan.md', label: '测试计划', page: 'plan.html' },
  { id: 'requirement-traceability', name: 'requirement-traceability.md', label: '需求覆盖矩阵', page: 'plan.html' },
  { id: 'plan-delegation-decision', name: 'plan-delegation-decision.md', label: '委派决策', page: 'plan.html' },
  { id: 'change-proposal', name: 'proposal.md', label: '变更提案', page: 'change.html', changeKey: 'proposal' },
  { id: 'change-spec-delta', name: 'spec-delta.md', label: '规格增量', page: 'change.html', changeKey: 'specDelta' },
  { id: 'change-design', name: 'design.md', label: '设计方案', page: 'change.html', changeKey: 'design' },
  { id: 'change-tasks', name: 'tasks.md', label: '任务拆解', page: 'change.html', changeKey: 'tasks' },
  { id: 'change-slices', name: 'slices.json', label: '垂直切片', page: 'change.html', changeKey: 'slices' },
  { id: 'execution-record', name: 'execution-record.md', label: '执行记录', page: 'build.html' },
  { id: 'review-report', name: 'review-report.md', label: '评审报告', page: 'review.html' },
];

const PAGE_GROUPS = [
  { file: 'intake.html', title: '需求澄清', artifacts: ['spec'] },
  { file: 'plan.html', title: '计划与架构', artifacts: ['plan', 'architecture', 'development-plan', 'test-plan', 'requirement-traceability', 'plan-delegation-decision'] },
  { file: 'change.html', title: '变更设计方案', artifacts: ['change-proposal', 'change-spec-delta', 'change-design', 'change-tasks', 'change-slices'] },
  { file: 'build.html', title: '执行与验证', artifacts: ['execution-record'] },
  { file: 'review.html', title: '评审结论', artifacts: ['review-report'] },
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
    '    :root { color-scheme: light; --text: #17202a; --muted: #5f6f7f; --line: #d8e0e8; --bg: #f6f8fa; --panel: #ffffff; --accent: #1769aa; --ok: #1b7f4d; --warn: #a15c00; --bad: #b42318; --soft: #edf4fb; }',
    '    * { box-sizing: border-box; }',
    '    body { margin: 0; font: 15px/1.65 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: var(--text); background: var(--bg); }',
    '    main { max-width: 1180px; margin: 0 auto; padding: 28px 20px 48px; }',
    '    header { margin-bottom: 20px; }',
    '    h1 { margin: 0 0 8px; font-size: 28px; line-height: 1.25; }',
    '    h2 { margin: 24px 0 10px; font-size: 18px; }',
    '    h3 { margin: 18px 0 8px; font-size: 16px; }',
    '    h4 { margin: 14px 0 6px; font-size: 14px; }',
    '    a { color: var(--accent); text-decoration: none; }',
    '    a:hover { text-decoration: underline; }',
    '    .muted { color: var(--muted); }',
    '    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; }',
    '    .panel { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 14px 16px; }',
    '    .panel h2:first-child { margin-top: 0; }',
    '    .badge { display: inline-block; border: 1px solid var(--line); border-radius: 999px; padding: 2px 9px; margin: 2px 4px 2px 0; color: var(--muted); background: #fff; font-size: 12px; }',
    '    .badge.ok { color: var(--ok); border-color: #b8dfc9; background: #f0fbf4; }',
    '    .badge.warn { color: var(--warn); border-color: #f1d29b; background: #fff8eb; }',
    '    .badge.bad { color: var(--bad); border-color: #f0b7b1; background: #fff1f0; }',
    '    .review-nav { display: flex; flex-wrap: wrap; gap: 8px; margin: 12px 0 18px; }',
    '    .review-nav a { border: 1px solid var(--line); border-radius: 8px; padding: 6px 10px; background: #fff; }',
    '    .callout { border-left: 4px solid var(--accent); background: var(--soft); padding: 10px 12px; margin: 12px 0; }',
    '    .hero { background: linear-gradient(135deg, #fff, #f7fbff); border: 1px solid var(--line); border-radius: 12px; padding: 18px 20px; margin-bottom: 16px; }',
    '    .hero-grid { display: grid; grid-template-columns: 1.4fr 1fr; gap: 14px; }',
    '    .hero-kpi { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px; margin-top: 12px; }',
    '    .kpi { border: 1px solid var(--line); background: #fff; border-radius: 10px; padding: 10px 12px; }',
    '    .kpi .label { color: var(--muted); font-size: 12px; }',
    '    .kpi .value { font-size: 18px; font-weight: 700; margin-top: 2px; }',
    '    .layout { display: grid; grid-template-columns: minmax(0, 1fr) 320px; gap: 16px; align-items: start; }',
    '    .sticky { position: sticky; top: 14px; }',
    '    .stack { display: grid; gap: 12px; }',
    '    .visual-map { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 10px; }',
    '    .visual-card { border: 1px solid var(--line); border-radius: 10px; padding: 12px; background: #fff; }',
    '    .visual-card .title { font-weight: 700; margin-bottom: 4px; }',
    '    .visual-card .meta { color: var(--muted); font-size: 12px; }',
    '    .outline { border-left: 2px solid var(--line); padding-left: 12px; }',
    '    .outline a { display: block; color: var(--text); padding: 3px 0; }',
    '    table { width: 100%; border-collapse: collapse; background: var(--panel); border: 1px solid var(--line); }',
    '    th, td { padding: 8px 10px; border-bottom: 1px solid var(--line); text-align: left; vertical-align: top; }',
    '    th { color: var(--muted); font-weight: 600; }',
    '    pre { overflow: auto; padding: 12px; background: #0f1720; color: #edf4fb; border-radius: 8px; }',
    '    code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }',
    '    .markdown { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 16px; margin-bottom: 16px; }',
    '    .markdown pre { margin: 10px 0 0; }',
    '    .markdown table { margin-top: 10px; }',
    '    .markdown ul, .markdown ol { margin-top: 10px; padding-left: 22px; }',
    '    .markdown p { margin: 10px 0; }',
    '    .markdown h2:first-child, .markdown h3:first-child, .markdown h4:first-child { margin-top: 0; }',
    '    .artifact-meta { display: flex; flex-wrap: wrap; gap: 6px; margin: 0 0 10px; }',
    '    @media (max-width: 860px) { .hero-grid, .layout { grid-template-columns: 1fr; } .sticky { position: static; } }',
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

function languageMetric(text) {
  const chineseChars = String(text || '').match(/[\u3400-\u9fff]/g) || [];
  const latinChars = String(text || '').match(/[A-Za-z]/g) || [];
  const signalChars = chineseChars.length + latinChars.length;
  const chineseRatio = signalChars === 0 ? 0 : chineseChars.length / signalChars;
  return {
    chineseChars: chineseChars.length,
    latinChars: latinChars.length,
    chineseRatio,
    chineseOk: signalChars > 0 && (chineseChars.length >= 40 || (chineseChars.length >= 8 && chineseRatio >= 0.2)),
  };
}

function artifactMetrics(text) {
  const lines = String(text || '').split('\n');
  const headings = lines.filter((line) => /^#{1,4}\s+/.test(line)).length;
  const tables = lines.filter((line, index) => line.trim().startsWith('|') && lines[index + 1] && /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(lines[index + 1])).length;
  const todoCount = lines.filter((line) => /\b(TBD|TODO|REPLACE_ME)\b/i.test(line)).length;
  return {
    lines: lines.filter((line) => line.trim()).length,
    headings,
    tables,
    todoCount,
    ...languageMetric(text),
  };
}

function artifactId(artifact) {
  return artifact.id || artifact.name;
}

function anchorForArtifact(artifact) {
  return artifactId(artifact).replace(/[^a-z0-9-]/gi, '-');
}

function resolveArtifactPath(root, state, artifact) {
  if (artifact.changeKey) {
    return state.change_artifact_paths?.[artifact.changeKey] || null;
  }
  return join(root, artifact.name);
}

function statusBadge(label, status) {
  const normalized = String(status ?? '').toLowerCase();
  const cls = ['true', 'complete', 'approved', 'written', 'ready', 'exists', 'ok'].includes(normalized)
    ? 'ok'
    : ['false', 'missing', 'blocked', 'partial', 'failed', 'none', 'needs-review'].includes(normalized)
      ? 'bad'
      : 'warn';
  return `<span class="badge ${cls}">${escapeHtml(label)}: ${escapeHtml(status)}</span>`;
}

function extractHeadings(text) {
  return String(text || '')
    .split('\n')
    .map((line) => line.match(/^(#{1,4})\s+(.+?)\s*$/))
    .filter(Boolean)
    .map((match) => ({
      level: match[1].length,
      title: match[2].replace(/`/g, '').trim(),
    }));
}

function firstParagraph(text) {
  return String(text || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.startsWith('#'))
    .filter((line) => !line.startsWith('|'))
    .filter((line) => !/^[-*]\s+/.test(line))
    .filter((line) => !/^\d+[.)]\s+/.test(line))
    .find((line) => line.length > 20) || '';
}

function sectionDigest(text) {
  const headings = extractHeadings(text);
  return {
    title: headings[0]?.title || firstParagraph(text) || '无标题产物',
    outline: headings.filter((item) => item.level <= 3).slice(0, 8),
    summary: firstParagraph(text),
  };
}

function collectHeadingBlocks(text) {
  const lines = String(text || '').split('\n');
  const blocks = [];
  let current = null;
  for (const line of lines) {
    const heading = line.match(/^(#{1,4})\s+(.+?)\s*$/);
    if (heading) {
      if (current) {
        blocks.push(current);
      }
      current = {
        level: heading[1].length,
        title: heading[2].replace(/`/g, '').trim(),
        lines: [],
      };
      continue;
    }
    if (current) {
      current.lines.push(line);
    }
  }
  if (current) {
    blocks.push(current);
  }
  return blocks;
}

function blockPreview(block) {
  return block.lines
    .map((line) => line.trim())
    .filter(Boolean)
    .find((line) => !line.startsWith('#') && !line.startsWith('|') && !/^[-*]\s+/.test(line) && !/^\d+[.)]\s+/.test(line)) || '';
}

function parseFrontmatterBlock(text) {
  if (!String(text || '').startsWith('---\n')) {
    return {};
  }
  const end = String(text).indexOf('\n---\n', 4);
  if (end === -1) {
    return {};
  }
  return Object.fromEntries(
    String(text)
      .slice(4, end)
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const separator = line.indexOf(':');
        const key = line.slice(0, separator).trim();
        const rawValue = line.slice(separator + 1).trim();
        if (rawValue.startsWith('[') || rawValue.startsWith('{')) {
          try {
            return [key, JSON.parse(rawValue)];
          } catch {
            return [key, rawValue];
          }
        }
        return [key, rawValue];
      }),
  );
}

function renderListItems(lines) {
  const items = lines
    .map((line) => line.trim())
    .filter((line) => /^[-*]\s+/.test(line) || /^\d+[.)]\s+/.test(line))
    .map((line) => line.replace(/^[-*]\s+/, '').replace(/^\d+[.)]\s+/, '').trim())
    .filter(Boolean);
  return items.length > 0 ? `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>` : '<span class="muted">无</span>';
}

function renderKeyValueTable(entries) {
  return `<table><tbody>${entries.map(([key, value]) => `<tr><th>${escapeHtml(key)}</th><td>${value}</td></tr>`).join('')}</tbody></table>`;
}

function summarizeRequirementBlocks(text) {
  const matches = [...String(text || '').matchAll(/^###\s+Requirement:\s*(.+?)\s*$/gim)];
  return matches.map((match) => ({
    name: match[1].trim(),
    preview: '',
  }));
}

function parseSlicesJson(text) {
  try {
    const payload = JSON.parse(text);
    return Array.isArray(payload.slices) ? payload.slices : [];
  } catch {
    return [];
  }
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
  let orderedListOpen = false;

  const closeList = () => {
    if (listOpen) {
      html.push('</ul>');
      listOpen = false;
    }
    if (orderedListOpen) {
      html.push('</ol>');
      orderedListOpen = false;
    }
  };
  const tableCells = (line) => line.split('|').slice(1, -1).map((cell) => cell.trim());
  const isTableDelimiter = (line) => /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);
  const inlineMarkdown = (value) => escapeHtml(value)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  const renderTable = (start) => {
    const header = tableCells(lines[start]);
    const rows = [];
    let index = start + 2;
    while (index < lines.length && lines[index].trim().startsWith('|')) {
      rows.push(tableCells(lines[index]));
      index += 1;
    }
    html.push('<table>');
    html.push(`<thead><tr>${header.map((cell) => `<th>${inlineMarkdown(cell)}</th>`).join('')}</tr></thead>`);
    html.push('<tbody>');
    for (const row of rows) {
      html.push(`<tr>${header.map((_, cellIndex) => `<td>${inlineMarkdown(row[cellIndex] || '')}</td>`).join('')}</tr>`);
    }
    html.push('</tbody></table>');
    return index - 1;
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
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
    if (line.trim().startsWith('|') && lines[index + 1] && isTableDelimiter(lines[index + 1])) {
      closeList();
      index = renderTable(index);
      continue;
    }
    if (line.startsWith('- ')) {
      if (orderedListOpen) {
        html.push('</ol>');
        orderedListOpen = false;
      }
      if (!listOpen) {
        html.push('<ul>');
        listOpen = true;
      }
      html.push(`<li>${inlineMarkdown(line.slice(2))}</li>`);
      continue;
    }
    if (/^\d+[.)]\s+/.test(line)) {
      if (listOpen) {
        html.push('</ul>');
        listOpen = false;
      }
      if (!orderedListOpen) {
        html.push('<ol>');
        orderedListOpen = true;
      }
      html.push(`<li>${inlineMarkdown(line.replace(/^\d+[.)]\s+/, ''))}</li>`);
      continue;
    }
    if (!line.trim()) {
      closeList();
      continue;
    }
    closeList();
    html.push(`<p>${inlineMarkdown(line)}</p>`);
  }
  closeList();
  if (inCode) {
    html.push('</code></pre>');
  }
  return html.join('\n');
}

function artifactDetailHtml(artifact, text) {
  const blocks = collectHeadingBlocks(text);
  const topBlocks = blocks.filter((block) => block.level <= 3).slice(0, 12);
  const sectionCards = topBlocks.length > 0
    ? [
        '<section class="panel">',
        '<h3>章节速览</h3>',
        '<div class="visual-map">',
        ...topBlocks.map((block) => [
          '<div class="visual-card">',
          `<div class="title">${escapeHtml(block.title)}</div>`,
          `<div class="meta">${escapeHtml(blockPreview(block) || '该章节主要由列表、表格或代码块组成。')}</div>`,
          '</div>',
        ].join('')),
        '</div>',
        '</section>',
      ].join('\n')
    : '';

  if (artifact.name === 'spec-delta.md') {
    const frontmatter = parseFrontmatterBlock(text);
    const requirements = summarizeRequirementBlocks(text);
    return [
      '<section class="panel">',
      '<h3>规格增量详解</h3>',
      renderKeyValueTable([
        ['change_id', escapeHtml(frontmatter.change_id || '(未声明)')],
        ['slug', escapeHtml(frontmatter.slug || '(未声明)')],
        ['target_domains', escapeHtml(Array.isArray(frontmatter.target_domains) ? frontmatter.target_domains.join(', ') : (frontmatter.target_domains || '(见正文)'))],
        ['requirement_blocks', escapeHtml(requirements.length)],
      ]),
      requirements.length > 0 ? [
        '<h4>Requirement Blocks</h4>',
        '<div class="visual-map">',
        ...requirements.map((item) => `<div class="visual-card"><div class="title">${escapeHtml(item.name)}</div><div class="meta">包含 SHALL/MUST 与 Scenario 的归档候选需求块。</div></div>`),
        '</div>',
      ].join('\n') : '',
      '</section>',
      sectionCards,
    ].join('\n');
  }

  if (artifact.name === 'slices.json') {
    const slices = parseSlicesJson(text);
    return [
      '<section class="panel">',
      '<h3>垂直切片详解</h3>',
      '<div class="visual-map">',
      ...(slices.length > 0 ? slices.map((slice) => [
        '<div class="visual-card">',
        `<div class="title">${escapeHtml(slice.id || '(no id)')} ${escapeHtml(slice.title || slice.name || '')}</div>`,
        `<div class="meta">type: ${escapeHtml(slice.type || 'unknown')}</div>`,
        `<p>${escapeHtml(slice.behavior || slice.description || '')}</p>`,
        '<h4>验收</h4>',
        renderListItems(Array.isArray(slice.acceptance_criteria) ? slice.acceptance_criteria.map((item) => `- ${item}`) : (Array.isArray(slice.acceptance) ? slice.acceptance.map((item) => `- ${item}`) : [])),
        `<p class="muted">verification: ${escapeHtml(slice.verification_signal || '(missing)')}</p>`,
        '</div>',
      ].join('')) : ['<span class="muted">未解析到 slices。</span>']),
      '</div>',
      '</section>',
    ].join('\n');
  }

  if (artifact.name === 'tasks.md') {
    const checklist = String(text || '').split('\n').filter((line) => /^\s*-\s+\[[ xX]\]\s+/.test(line));
    return [
      '<section class="panel">',
      '<h3>任务拆解详解</h3>',
      renderKeyValueTable([
        ['checklist_items', escapeHtml(checklist.length)],
        ['open_items', escapeHtml(checklist.filter((line) => /\[\s\]/.test(line)).length)],
        ['completed_items', escapeHtml(checklist.filter((line) => /\[[xX]\]/.test(line)).length)],
      ]),
      '</section>',
      sectionCards,
    ].join('\n');
  }

  return sectionCards;
}

function artifactLink(viewRoot, artifactPath, label) {
  const href = relative(viewRoot, artifactPath).replaceAll('\\', '/');
  return `<a href="${escapeHtml(href)}">${escapeHtml(label)}</a>`;
}

function approvalPanels(state) {
  const approval = state.approval || {};
  const slug = state.slug || '(slug)';
  const transitions = [
    ['clarify -> plan', approval.plan || 'not-requested', `loopx approve ${slug} --from clarify --to plan`],
    ['plan -> build', approval.build || 'not-requested', `loopx approve ${slug} --from plan --to build`],
    ['build -> review', approval.review || 'not-requested', `loopx approve ${slug} --from build --to review`],
    ['review -> done', approval.complete || 'not-requested', `loopx approve ${slug} --from review --to done`],
  ];
  return [
    '<section class="panel">',
    '<h2>人工确认点</h2>',
    '<table><thead><tr><th>阶段流转</th><th>授权状态</th><th>命令</th></tr></thead><tbody>',
    ...transitions.map(([label, status, command]) => [
      '<tr>',
      `<td>${escapeHtml(label)}</td>`,
      `<td>${statusBadge('approval', status)}</td>`,
      `<td><code>${escapeHtml(command)}</code></td>`,
      '</tr>',
    ].join('')),
    '</tbody></table>',
    '</section>',
  ].join('\n');
}

function planGateSummary(state) {
  const gates = [
    ['Planner / Architect / Critic', `${state.plan_architect_review_status || 'not-started'} / ${state.plan_critic_verdict || 'none'}`],
    ['中文规划文档', state.plan_docs_status || 'missing'],
    ['需求覆盖矩阵', state.source_requirements_status || 'unknown'],
    ['变更工件', state.change_artifacts_status || 'missing'],
    ['Spec Delta', state.spec_delta_status || 'missing'],
    ['Vertical Slices', state.slice_artifacts_status || 'missing'],
    ['委派决策', `${state.plan_delegation_recommended_mode || state.plan_delegation_mode || 'unknown'} / ${state.plan_delegation_actual_mode || 'unknown'}`],
    ['授权状态', state.plan_delegation_authorization_status || 'unknown'],
  ];
  return [
    '<section class="panel">',
    '<h2>Plan 审阅门禁</h2>',
    '<table><thead><tr><th>门禁</th><th>状态</th></tr></thead><tbody>',
    ...gates.map(([label, value]) => `<tr><td>${escapeHtml(label)}</td><td>${escapeHtml(value)}</td></tr>`),
    '</tbody></table>',
    '</section>',
  ].join('\n');
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
    `<div class="panel"><strong>需求覆盖</strong><br>${escapeHtml(state.source_requirements_status || 'unknown')}</div>`,
    `<div class="panel"><strong>下一步</strong><br><code>${escapeHtml(nextSkill || status.next_action || 'none')}</code></div>`,
    `<div class="panel"><strong>归档</strong><br>${escapeHtml(state.archive_status || 'pending')}</div>`,
    '</section>',
    approvalPanels(state),
    state.current_stage === 'plan' || state.plan_package_status ? planGateSummary(state) : '',
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
    const artifactPath = resolveArtifactPath(root, status.state || {}, artifact);
    return {
      ...artifact,
      path: artifactPath,
      exists: Boolean(artifactPath) && existsSync(artifactPath),
    };
  });

  const renderArtifactBody = async (artifact) => {
    const text = await readFile(artifact.path, 'utf8');
    const metrics = artifactMetrics(text);
    const digest = sectionDigest(text);
    const isJson = artifact.name.endsWith('.json');
    const detailHtml = artifactDetailHtml(artifact, text);
    const outline = digest.outline.length > 0
      ? `<div class="outline">${digest.outline.map((item) => `<span class="badge">${escapeHtml('H'.repeat(item.level))} ${escapeHtml(item.title)}</span>`).join(' ')}</div>`
      : '<span class="muted">无可提取标题</span>';
    return {
      text,
      metrics,
      digest,
      detailHtml,
      body: isJson
        ? `<pre><code>${escapeHtml(text)}</code></pre>`
        : markdownToHtml(text),
      meta: [
        statusBadge('产物', artifact.name),
        statusBadge('中文', metrics.chineseOk ? 'ok' : 'needs-review'),
        statusBadge('行数', metrics.lines),
        statusBadge('标题', metrics.headings),
        statusBadge('表格', metrics.tables),
        metrics.todoCount > 0 ? statusBadge('占位符', metrics.todoCount) : '',
      ].join(''),
      digestHtml: outline,
    };
  };

  for (const group of PAGE_GROUPS) {
    const sections = [];
    const availableArtifacts = artifactRows.filter((artifact) => group.artifacts.includes(artifactId(artifact)) && artifact.exists);
    const nav = availableArtifacts.length > 0
      ? `<nav class="review-nav">${availableArtifacts.map((artifact) => `<a href="#${escapeHtml(anchorForArtifact(artifact))}">${escapeHtml(artifact.label)}</a>`).join('')}</nav>`
      : '';
    for (const artifactIdValue of group.artifacts) {
      const artifact = artifactRows.find((item) => artifactId(item) === artifactIdValue);
      if (!artifact?.exists) {
        continue;
      }
      const rendered = await renderArtifactBody(artifact);
      sections.push([
        `<section class="markdown" id="${escapeHtml(anchorForArtifact(artifact))}">`,
        '<div class="hero-grid">',
        '<div>',
        `<h2>${escapeHtml(artifact.label)}</h2>`,
        `<p class="muted">${artifactLink(viewRoot, artifact.path, artifact.name)}</p>`,
        `<p>${escapeHtml(rendered.digest.summary || '该产物没有单独摘要，直接阅读正文。')}</p>`,
        '</div>',
        '<div class="stack">',
      rendered.meta,
        `<div class="panel"><strong>结构预览</strong><div class="outline">${rendered.digestHtml}</div></div>`,
        '</div>',
        '</div>',
        '<div class="artifact-meta">',
        rendered.meta,
        '</div>',
        rendered.detailHtml,
        rendered.body,
        '</section>',
      ].join('\n'));
    }
    await writeFile(join(viewRoot, group.file), htmlDoc({
      title: `${group.title} - ${status.slug}`,
      body: [
        '<header>',
        `<h1>${escapeHtml(group.title)}</h1>`,
        `<p class="muted">工作流：${escapeHtml(status.slug)}</p>`,
        '<div class="callout">这是人工审阅入口。先看上方视觉摘要，再按导航逐项审阅正文；HTML 负责可视化阅读，原始文件仍可点击查看。</div>',
        '<p><a href="index.html">返回工作流首页</a></p>',
        nav,
        '</header>',
        sections.length > 0 ? sections.join('\n') : '<section class="panel muted">暂无对应产物。</section>',
      ].join('\n'),
    }));
  }

  const artifactTableRows = await Promise.all(artifactRows.map(async (artifact) => {
    if (!artifact.exists) {
      return [
        '<tr>',
        `<td>${escapeHtml(artifact.label)}</td>`,
        '<td>缺失</td>',
        '<td><span class="muted">无</span></td>',
        '<td><span class="muted">无</span></td>',
        '<td><span class="muted">无</span></td>',
        '<td><span class="muted">无</span></td>',
        '</tr>',
      ].join('');
    }
    const rendered = await renderArtifactBody(artifact);
    return [
      '<tr>',
      `<td>${escapeHtml(artifact.label)}</td>`,
      '<td>存在</td>',
      `<td>${artifact.page ? `<a href="${escapeHtml(artifact.page)}">${escapeHtml(basename(artifact.page))}</a>` : '<span class="muted">无</span>'}</td>`,
      `<td>${rendered.meta}</td>`,
      `<td>${escapeHtml(rendered.metrics.headings)} 标题 / ${escapeHtml(rendered.metrics.tables)} 表格 / ${escapeHtml(rendered.metrics.lines)} 行</td>`,
      `<td>${artifactLink(viewRoot, artifact.path, artifact.name)}</td>`,
      '</tr>',
    ].join('');
  }));

  const heroSummary = [
    `<div class="hero">`,
    '<div class="hero-grid">',
    '<div>',
    `<h1>工作流 ${escapeHtml(status.slug)}</h1>`,
    `<p class="muted">HTML 是派生阅读视图；Markdown 和 JSON 仍是运行时事实源。</p>`,
    '<div class="hero-kpi">',
    `<div class="kpi"><div class="label">阶段</div><div class="value">${escapeHtml(status.state?.current_stage || '(none)')}</div></div>`,
    `<div class="kpi"><div class="label">状态</div><div class="value">${escapeHtml(status.state?.stage_status || '(unknown)')}</div></div>`,
    `<div class="kpi"><div class="label">中文产物</div><div class="value">${escapeHtml(status.state?.plan_docs_status || 'unknown')}</div></div>`,
    `<div class="kpi"><div class="label">下一步</div><div class="value">${escapeHtml(status.next_action || 'none')}</div></div>`,
    '</div>',
    '</div>',
    '<div class="stack">',
    approvalPanels(status.state || {}),
    '</div>',
    '</div>',
    '</div>',
  ].join('\n');

  const indexBody = [
    heroSummary,
    statusPanels(status),
    '<section class="panel">',
    '<h2>关键产物审阅清单</h2>',
    '<table><thead><tr><th>产物</th><th>状态</th><th>阅读视图</th><th>中文</th><th>结构</th><th>原始文件</th></tr></thead><tbody>',
    ...artifactTableRows,
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
