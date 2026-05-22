import { join } from 'node:path';
import { mkdir } from 'node:fs/promises';

import { runCodexExecJson } from './codex-exec-runtime.mjs';

const DEFAULT_MAX_ITERATIONS = 5;

function extractSection(text, heading) {
  const pattern = new RegExp(`## ${heading}\\n\\n([\\s\\S]*?)(?=\\n## |$)`, 'i');
  const match = text.match(pattern);
  return match ? match[1].trim() : '';
}

function bulletsFromSection(section, fallback) {
  const bullets = section
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('- '))
    .map((line) => line.slice(2).trim())
    .filter(Boolean);
  return bullets.length > 0 ? bullets : fallback;
}

function paragraphFromSection(section, fallback) {
  const paragraph = section
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.startsWith('- '))
    .join(' ');
  return paragraph || fallback;
}

function buildSourceSummary(sourceText) {
  return {
    intent: paragraphFromSection(extractSection(sourceText, 'Intent'), '将已批准的需求整理成可进入 build 的计划包。'),
    outcome: paragraphFromSection(extractSection(sourceText, 'Desired Outcome'), '产出已批准的计划工件，并在执行前停止。'),
    inScope: bulletsFromSection(extractSection(sourceText, 'In Scope'), [
      '生成已批准的规划工件。',
      '保持 runtime 状态机可检查。',
      '保留显式的执行审批边界。',
    ]),
    nonGoals: bulletsFromSection(extractSection(sourceText, 'Out of Scope / Non-goals'), [
      '不要从 plan 直接启动执行。',
      '不要把任务扩展到已批准范围之外。',
    ]),
    acceptance: bulletsFromSection(extractSection(sourceText, 'Testable Acceptance Criteria'), [
      '规划输出完整且可审阅。',
      '验证步骤明确可执行。',
    ]),
    constraints: bulletsFromSection(extractSection(sourceText, 'Constraints'), [
      '保留既有 workflow 顺序。',
      '保持规划输出稳定且可审阅。',
    ]),
    decisions: bulletsFromSection(extractSection(sourceText, 'Decision Boundaries'), [
      'plan 在生成已批准规划工件后停止。',
      '执行需要显式下游批准。',
    ]),
  };
}

function plannerDraftFromSource({ slug, sourceText, deliberateMode }) {
  const summary = buildSourceSummary(sourceText);
  const executionInputs = bulletsFromSection(extractSection(sourceText, 'Execution Inputs'), []);
  const executionInputsResolved = executionInputs.length > 0 && executionInputs.every((item) => !/\b(TBD|待定|unknown|later)\b/i.test(item));
  const preMortem = deliberateMode
    ? [
        '如果运行时没有独立的规划适配层，真实编排与测试替身会相互污染。',
        '如果 docs 只是附加产物，plan 完成判定会再次与文档契约脱节。',
        '如果 status 只显示 plan_package_status，规划阶段故障仍然无法诊断。',
      ]
    : [];

  return {
    principles: [
      '运行时行为必须与已发布的 planning contract 对齐。',
      '规划阶段只做规划，不自动进入执行阶段。',
      '完成判定必须机器可检查。',
      '中文 docs 是阻塞产物，不是附加导出。',
      '保持变更范围集中在 plan runtime、status 和测试。',
    ],
    decisionDrivers: [
      '当前 skill contract 与 runtime truth 不一致。',
      'approved plan 与中文 docs 都是必需产物。',
      '现有 clarify/build/review 行为需要保持稳定。',
    ],
    options: [
      {
        name: '在 plan runtime 内嵌编排',
        pros: ['runtime 真相与产品契约保持一致', '由同一个状态机管理 gate 与工件'],
        cons: ['需要额外的 adapter 边界来支撑确定性测试'],
      },
      {
        name: '在轻量 plan 外包一层共识流程',
        pros: ['短期 diff 更小'],
        cons: ['wrapper 与 runtime 的事实仍然分裂', 'status 与调试信息继续碎片化'],
      },
    ],
    planText: [
      `# loopx 计划: ${slug}`,
      '',
      '## 需求摘要',
      '',
      `- ${summary.intent}`,
      `- ${summary.outcome}`,
      '',
      '## 交付物',
      '',
      ...summary.acceptance.map((item, index) => `${index + 1}. ${item}`),
      '',
      '## 实施步骤',
      '',
      '1. 为 planner、architect、critic 增加 plan orchestration adapter。',
      '2. 在 workflow state 中记录 plan iteration、review verdict 和 execution-input blockers。',
      '3. 从已批准的 planning source 生成中文主规划工件与 canonical plan artifacts。',
      '4. 在 CLI status 中暴露 plan 阶段进度。',
      '5. 为 happy path、iterate path 和 execution input 未收口路径补 deterministic regression coverage。',
      '',
      '## 执行输入',
      '',
      ...(executionInputs.length > 0 ? executionInputs.map((item) => `- ${item}`) : ['- TBD: execution inputs not yet mapped to concrete sources.']),
      '',
      '## 风险',
      '',
      ...summary.constraints.map((item) => `- ${item}`),
      '',
      '## 验证',
      '',
      '- 运行 workflow tests',
      '- 运行 CLI status checks',
      '- 证明 execution input blockers 与 iterate path 生效',
    ].join('\n'),
    architectureText: [
      `# 架构文档: ${slug}`,
      '',
      '## 目标',
      '',
      `- ${summary.intent}`,
      '',
      '## 边界',
      '',
      ...summary.decisions.map((item) => `- ${item}`),
      '',
      '## 选定方案',
      '',
      '- plan runtime 负责 planner -> architect -> critic 闭环',
      '- 通过专用 adapter 隔离生产编排与确定性测试',
      '- canonical plan artifacts 保持写入 `.loopx/plans/`',
      '- `.loopx/workflows/<slug>/` 下的主规划工件直接作为中文产物',
      '',
      '## 备选方案',
      '',
      '- 保持 plan 轻量并在外层包一层流程',
      '- 推迟 runtime 对齐，仅把 skill contract 当目标状态',
    ].join('\n'),
    developmentPlanText: [
      `# 开发计划: ${slug}`,
      '',
      '## 执行拆解',
      '',
      '1. 扩展 plan state schema 与 status 输出。',
      '2. 实现带有有界迭代的 planner/architect/critic 编排。',
      '3. 直接输出中文主规划工件与 canonical plan artifacts。',
      '4. 增加 deterministic test seams 与 regression coverage。',
      '',
      '## 责任分工',
      '',
      '- owner: plan runtime',
      '- reviewer: architect and critic',
      '- downstream execution: 仅在后续显式批准后进入',
      '',
      '## 时序要求',
      '',
      '- architect 未完成前不得运行 critic',
      '- plan blockers 清除前不得批准 build',
      '- plan 阶段不得自动启动执行',
    ].join('\n'),
    testPlanText: [
      `# 测试计划: ${slug}`,
      '',
      '## 单元测试',
      '',
      '- plan consensus mode 的 state 初始化',
      '- 中文主规划工件的 blocking checks',
      '- planner/architect/critic review artifact 记录',
      '',
      '## 集成测试',
      '',
      '- clarify -> plan happy path',
      '- critic iterate 再 approve 的路径',
      '- 主规划工件缺失或非中文时的 blocking 路径',
      '- execution inputs 缺失或标记 TBD 的 blocking 路径',
      '',
      '## 可观测性',
      '',
      '- status 输出 iteration、architect review status、critic verdict 与 execution input blockers',
    ].join('\n'),
    preMortem,
    principlesResolved: true,
    optionsReviewed: true,
    acceptanceCriteriaTestable: true,
    verificationStepsResolved: true,
    executionInputsResolved,
  };
}

function reviewArtifact(kind, iteration, verdict, findings, extras = {}) {
  return {
    kind,
    iteration,
    verdict,
    findings,
    ...extras,
  };
}

function reviewHistoryText(reviewHistory = []) {
  if (!Array.isArray(reviewHistory) || reviewHistory.length === 0) {
    return 'None.';
  }
  return reviewHistory.map((entry) => [
    `Iteration ${entry.iteration}:`,
    `- Architect status: ${entry.architectReview?.status ?? 'unknown'}`,
    `- Architect verdict: ${entry.architectReview?.verdict ?? 'unknown'}`,
    `- Architect findings: ${(entry.architectReview?.findings || []).join(' | ') || 'none'}`,
    `- Strongest objection: ${entry.architectReview?.strongestObjection || 'none'}`,
    `- Tradeoff tension: ${entry.architectReview?.tradeoffTension || 'none'}`,
    `- Critic verdict: ${entry.criticReview?.verdict ?? 'unknown'}`,
    `- Critic findings: ${(entry.criticReview?.findings || []).join(' | ') || 'none'}`,
    `- Acceptance criteria testable: ${Boolean(entry.criticReview?.acceptanceCriteriaTestable)}`,
    `- Verification steps resolved: ${Boolean(entry.criticReview?.verificationStepsResolved)}`,
    `- Execution inputs resolved: ${Boolean(entry.criticReview?.executionInputsResolved)}`,
  ].join('\n')).join('\n\n');
}

function defaultArchitectReview({ plannerDraft, iteration }) {
  const findings = [
    'Real planning orchestration needs an adapter seam so production runtime and deterministic tests can share one state machine.',
    'Plan completion should depend on blocking workflow planning artifacts, not only canonical plan artifacts.',
  ];
  return reviewArtifact('architect', iteration, 'approve', findings, {
    status: 'complete',
    strongestObjection: 'Without an explicit adapter boundary, live orchestration and tests will drift or become flaky.',
    tradeoffTension: 'Faithful multi-agent behavior increases runtime complexity, while deterministic tests push toward stronger adapter isolation.',
  });
}

function containsChinese(text) {
  const chineseChars = text.match(/[\u3400-\u9fff]/g) || [];
  const latinChars = text.match(/[A-Za-z]/g) || [];
  const signalChars = chineseChars.length + latinChars.length;
  if (signalChars === 0) {
    return false;
  }
  return chineseChars.length >= 40 || (chineseChars.length >= 8 && chineseChars.length / signalChars >= 0.2);
}

function defaultCriticReview({ plannerDraft, iteration }) {
  const findings = [];
  if (!plannerDraft.principlesResolved) {
    findings.push('Planning principles are not explicit.');
  }
  if (!plannerDraft.optionsReviewed) {
    findings.push('Alternatives are not fairly compared.');
  }
  if (!plannerDraft.acceptanceCriteriaTestable) {
    findings.push('Acceptance criteria are not testable.');
  }
  if (!plannerDraft.verificationStepsResolved) {
    findings.push('Verification steps are not concrete.');
  }
  if (!plannerDraft.executionInputsResolved) {
    findings.push('Execution inputs are not fully mapped to concrete sources.');
  }
  if (!containsChinese(plannerDraft.planText) || !containsChinese(plannerDraft.architectureText) || !containsChinese(plannerDraft.developmentPlanText) || !containsChinese(plannerDraft.testPlanText)) {
    findings.push('Required workflow planning artifacts are not Chinese.');
  }
  return reviewArtifact('critic', iteration, findings.length > 0 ? 'iterate' : 'approve', findings, {
    acceptanceCriteriaTestable: plannerDraft.acceptanceCriteriaTestable,
    verificationStepsResolved: plannerDraft.verificationStepsResolved,
    executionInputsResolved: plannerDraft.executionInputsResolved,
  });
}

function scriptedVerdict(script, index, fallback) {
  if (!Array.isArray(script) || script.length === 0) {
    return fallback;
  }
  const boundedIndex = Math.min(index, script.length - 1);
  return String(script[boundedIndex]).trim().toLowerCase();
}

function scriptedCriticReview({ plannerDraft, iteration }, script, index) {
  if (!Array.isArray(script) || script.length === 0) {
    return defaultCriticReview({ plannerDraft, iteration });
  }
  const verdict = scriptedVerdict(script, index, 'approve');
  const findings = verdict === 'approve'
    ? ['Structured planning outputs satisfy the scripted approval path.']
    : [`Scripted critic verdict requested: ${verdict}.`];
  return reviewArtifact('critic', iteration, verdict, findings, {
    acceptanceCriteriaTestable: plannerDraft.acceptanceCriteriaTestable,
    verificationStepsResolved: plannerDraft.verificationStepsResolved,
    executionInputsResolved: plannerDraft.executionInputsResolved,
  });
}

export function createScriptedPlanAdapter(script = {}) {
  let architectIndex = 0;
  let criticIndex = 0;
  return {
    async planner(context) {
      return plannerDraftFromSource(context);
    },
    async architect(context) {
      const base = defaultArchitectReview(context);
      if (!Array.isArray(script.architect) || script.architect.length === 0) {
        return base;
      }
      const mode = scriptedVerdict(script.architect, architectIndex, 'approve');
      architectIndex += 1;
      return {
        ...base,
        status: mode === 'changes-requested' ? 'changes-requested' : 'complete',
        verdict: mode,
        findings: mode === 'approve' ? base.findings : [`Scripted architect verdict requested: ${mode}.`],
      };
    },
    async critic(context) {
      const result = scriptedCriticReview(context, script.critic, criticIndex);
      criticIndex += 1;
      return result;
    },
  };
}

export function createDefaultPlanAdapter() {
  return createRealPlanAdapter();
}

export function createRealPlanAdapter({ model } = {}) {
  return {
    async planner(context) {
      const outputPath = join(context.root, 'plan-reviews', `planner-iteration-${context.iteration}.json`);
      await mkdir(join(context.root, 'plan-reviews'), { recursive: true });
      const prompt = [
        `You are acting as the real loopx plan runtime for workflow "${context.slug}".`,
        'Read the source requirements and produce planning content for this workflow.',
        'Return only raw JSON matching this shape:',
        '{',
        '  "principles": string[],',
        '  "decisionDrivers": string[],',
        '  "options": [{"name": string, "pros": string[], "cons": string[]}],',
        '  "planText": string,',
        '  "architectureText": string,',
        '  "developmentPlanText": string,',
        '  "testPlanText": string,',
        '  "principlesResolved": boolean,',
        '  "optionsReviewed": boolean,',
        '  "acceptanceCriteriaTestable": boolean,',
        '  "verificationStepsResolved": boolean,',
        '  "executionInputsResolved": boolean',
        '}',
        `Deliberate mode: ${Boolean(context.deliberateMode)}`,
        '',
        'Use Chinese for planText / architectureText / developmentPlanText / testPlanText.',
        'Treat the source requirements/PRD as the source of truth. Explicitly cover every named event, field, processing mode, table row, and acceptance item that appears in the source, or clearly mark it out of scope with rationale.',
        'If previous review feedback is present, revise the plan to explicitly resolve it. Do not repeat the same plan unchanged.',
        'Do not ask questions. Do not wrap JSON in markdown.',
        '',
        'Previous review feedback:',
        reviewHistoryText(context.reviewHistory),
        '',
        'Source requirements:',
        context.sourceText,
      ].join('\n');
      return runCodexExecJson({
        cwd: context.cwd,
        prompt,
        outputPath,
        model,
      });
    },
    async architect(context) {
      const outputPath = join(context.root, 'plan-reviews', `architect-iteration-${context.iteration}.json`);
      await mkdir(join(context.root, 'plan-reviews'), { recursive: true });
      const draftText = [
        context.plannerDraft.planText,
        '',
        context.plannerDraft.architectureText,
        '',
        context.plannerDraft.developmentPlanText,
        '',
        context.plannerDraft.testPlanText,
      ].join('\n');
      const prompt = [
        `You are acting as the real loopx architect review for workflow "${context.slug}".`,
        'Review the provided planning draft and return only raw JSON with this shape:',
        '{',
        '  "status": "complete" | "changes-requested",',
        '  "verdict": "approve" | "iterate" | "reject",',
        '  "findings": string[],',
        '  "strongestObjection": string,',
        '  "tradeoffTension": string',
        '}',
        'Do not ask questions. Do not wrap JSON in markdown.',
        '',
        'Planning draft:',
        draftText,
      ].join('\n');
      return runCodexExecJson({
        cwd: context.cwd,
        prompt,
        outputPath,
        model,
      });
    },
    async critic(context) {
      const outputPath = join(context.root, 'plan-reviews', `critic-iteration-${context.iteration}.json`);
      await mkdir(join(context.root, 'plan-reviews'), { recursive: true });
      const draftText = [
        context.plannerDraft.planText,
        '',
        context.plannerDraft.architectureText,
        '',
        context.plannerDraft.developmentPlanText,
        '',
        context.plannerDraft.testPlanText,
      ].join('\n');
      const prompt = [
        `You are acting as the real loopx critic gate for workflow "${context.slug}".`,
        'Review the planning draft plus architect review and return only raw JSON with this shape:',
        '{',
        '  "verdict": "approve" | "iterate" | "reject",',
        '  "findings": string[],',
        '  "acceptanceCriteriaTestable": boolean,',
        '  "verificationStepsResolved": boolean,',
        '  "executionInputsResolved": boolean',
        '}',
        'Do not ask questions. Do not wrap JSON in markdown.',
        '',
        'Planning draft:',
        draftText,
        '',
        'Architect review:',
        JSON.stringify(context.architectReview, null, 2),
      ].join('\n');
      return runCodexExecJson({
        cwd: context.cwd,
        prompt,
        outputPath,
        model,
      });
    },
  };
}

export { DEFAULT_MAX_ITERATIONS };
