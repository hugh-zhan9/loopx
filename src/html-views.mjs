import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';

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
  { file: 'plan.html', title: '计划与架构', artifacts: ['plan', 'architecture', 'development-plan', 'test-plan', 'requirement-traceability'] },
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
  if (artifact.id === 'spec') {
    const candidate = state.spec_artifact_path || state.clarify_spec_path || null;
    if (candidate) {
      return isAbsolute(candidate) ? candidate : resolve(dirname(dirname(root)), candidate);
    }
  }
  return join(root, artifact.name);
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

function replaceDocumentReferences(text) {
  return String(text || '')
    .replace(/^#\s+Clarify Spec:\s*/gim, '# ')
    .replace(/^#+\s+loopx\s+/gim, (match) => match.replace(/loopx\s+/i, ''))
    .replace(/`?architecture\.md`?/g, '架构方案')
    .replace(/`?development-plan\.md`?/g, '开发计划')
    .replace(/`?design\.md`?/g, '详细设计')
    .replace(/`?plan\.md`?/g, '计划')
    .replace(/`?test-plan\.md`?/g, '测试计划')
    .replace(/`?requirement-traceability\.md`?/g, '需求覆盖矩阵')
    .replace(/`?plan-delegation-decision\.md`?/g, '委派决策')
    .replace(/`?spec-delta\.md`?/g, '规格增量')
    .replace(/`?tasks\.md`?/g, '任务拆解')
    .replace(/`?slices\.json`?/g, '切片定义');
}

function displayTextForArtifact(artifact, text) {
  if (artifact.name.endsWith('.json')) {
    return text;
  }
  const removeSectionTitles = artifact.id === 'plan'
    ? [/^状态$/, /^推荐执行入口$/, /^Build 前审阅清单$/i]
    : [];
  const lines = String(text || '').split('\n');
  const kept = [];
  let skippingLevel = null;
  for (const line of lines) {
    const heading = line.match(/^(#{1,4})\s+(.+?)\s*$/);
    if (heading) {
      const level = heading[1].length;
      const title = heading[2].replace(/`/g, '').trim();
      if (skippingLevel !== null && level <= skippingLevel) {
        skippingLevel = null;
      }
      if (skippingLevel === null && removeSectionTitles.some((pattern) => pattern.test(title))) {
        skippingLevel = level;
        continue;
      }
    }
    if (skippingLevel !== null) {
      continue;
    }
    if (/\$build\s+/.test(line) || /\.loopx\//.test(line)) {
      continue;
    }
    if (/^\s*-\s*(iteration|Architect review|Critic verdict|plan package|execution approved)\s*:/i.test(line)) {
      continue;
    }
    kept.push(line);
  }
  return replaceDocumentReferences(kept.join('\n'));
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

function cleanDocumentTitle(title) {
  return String(title || '')
    .replace(/^loopx\s+/i, '')
    .replace(/^工作流\s+/i, '')
    .replace(/^Clarify Spec:\s*/i, '')
    .trim() || '技术方案';
}

function pageIntro(group) {
  if (group.file === 'plan.html') {
    return '本页汇总需求方案、架构方案、开发计划、测试计划和需求覆盖，供直接阅读和人工确认。';
  }
  if (group.file === 'change.html') {
    return '本页汇总变更提案、规格增量、详细设计和任务拆解，供确认具体实现边界。';
  }
  if (group.file === 'intake.html') {
    return '本页汇总需求澄清结果，供确认范围、非目标、约束和验收口径。';
  }
  if (group.file === 'build.html') {
    return '本页汇总执行结果和验证证据。';
  }
  if (group.file === 'review.html') {
    return '本页汇总评审结论、问题和后续处理建议。';
  }
  return '本页汇总相关方案内容。';
}

async function solutionTitle(artifactRows) {
  const preferred = artifactRows.find((artifact) => ['plan', 'spec', 'change-proposal'].includes(artifactId(artifact)) && artifact.exists)
    || artifactRows.find((artifact) => artifact.exists);
  if (!preferred) {
    return '技术方案';
  }
  const text = await readFile(preferred.path, 'utf8');
  return cleanDocumentTitle(sectionDigest(text).title);
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
    const displayText = displayTextForArtifact(artifact, text);
    const metrics = artifactMetrics(displayText);
    const digest = sectionDigest(displayText);
    const isJson = artifact.name.endsWith('.json');
    const detailHtml = artifactDetailHtml(artifact, displayText);
    return {
      text: displayText,
      metrics,
      digest,
      detailHtml,
      body: isJson
        ? `<pre><code>${escapeHtml(displayText)}</code></pre>`
        : markdownToHtml(displayText),
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
        `<h2>${escapeHtml(artifact.label)}</h2>`,
        `<p>${escapeHtml(rendered.digest.summary || '该部分正文如下。')}</p>`,
        rendered.detailHtml,
        rendered.body,
        '</section>',
      ].join('\n'));
    }
    await writeFile(join(viewRoot, group.file), htmlDoc({
      title: group.title,
      body: [
        '<header>',
        `<h1>${escapeHtml(group.title)}</h1>`,
        `<div class="callout">${escapeHtml(pageIntro(group))}</div>`,
        '<p><a href="index.html">返回方案总览</a></p>',
        nav,
        '</header>',
        sections.length > 0 ? sections.join('\n') : '<section class="panel muted">暂无对应产物。</section>',
      ].join('\n'),
    }));
  }

  const title = await solutionTitle(artifactRows);
  const pageRows = PAGE_GROUPS.map((group) => {
    const availableArtifacts = artifactRows.filter((artifact) => group.artifacts.includes(artifactId(artifact)) && artifact.exists);
    if (availableArtifacts.length === 0) {
      return '';
    }
    return [
      '<tr>',
      `<td><a href="${escapeHtml(group.file)}">${escapeHtml(group.title)}</a></td>`,
      `<td>${escapeHtml(availableArtifacts.map((artifact) => artifact.label).join('、'))}</td>`,
      `<td>${escapeHtml(pageIntro(group))}</td>`,
      '</tr>',
    ].join('');
  }).filter(Boolean);

  const indexBody = [
    '<header>',
    '<h1>技术方案总览</h1>',
    `<p class="muted">${escapeHtml(title)}</p>`,
    '<div class="callout">本页面提供完整 HTML 阅读入口；各页面已内嵌方案正文，可直接阅读和确认。</div>',
    '</header>',
    '<section class="panel">',
    '<h2>方案阅读目录</h2>',
    '<table><thead><tr><th>页面</th><th>包含内容</th><th>阅读重点</th></tr></thead><tbody>',
    ...pageRows,
    '</tbody></table>',
    '</section>',
  ].join('\n');

  const workflowViewPath = join(viewRoot, 'index.html');
  await writeFile(workflowViewPath, htmlDoc({
    title: '技术方案总览',
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
    return `<tr><td>${link}</td><td>技术方案总览</td></tr>`;
  });
  const workspaceViewPath = join(viewsRoot, 'index.html');
  await writeFile(workspaceViewPath, htmlDoc({
    title: '方案阅读入口',
    body: [
      '<header>',
      '<h1>方案阅读入口</h1>',
      '<p class="muted">选择一个需求方案，进入完整 HTML 阅读页。</p>',
      '</header>',
      '<section class="panel">',
      '<h2>方案列表</h2>',
      '<table><thead><tr><th>方案</th><th>阅读入口</th></tr></thead><tbody>',
      rows.join('\n') || '<tr><td colspan="2" class="muted">暂无方案。</td></tr>',
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
      const workflowStatus = await statusSummary(cwd, workflow.slug);
      workflowViews.push({
        slug: workflow.slug,
        path: await renderWorkflowPages(workflowStatus),
      });
    }
  } else if (slug) {
    const workflowStatus = await statusSummary(cwd, slug);
    if (!workflowStatus.state) {
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
