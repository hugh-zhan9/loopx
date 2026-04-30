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
    intent: paragraphFromSection(extractSection(sourceText, 'Intent'), 'Translate the approved requirements into a build-ready plan package.'),
    outcome: paragraphFromSection(extractSection(sourceText, 'Desired Outcome'), 'Produce an approved plan package and stop before execution.'),
    inScope: bulletsFromSection(extractSection(sourceText, 'In Scope'), [
      'Create the approved planning artifacts.',
      'Keep runtime state machine-checkable.',
      'Preserve explicit execution approval boundaries.',
    ]),
    nonGoals: bulletsFromSection(extractSection(sourceText, 'Out of Scope / Non-goals'), [
      'Do not launch execution from plan.',
      'Do not widen the task beyond approved planning scope.',
    ]),
    acceptance: bulletsFromSection(extractSection(sourceText, 'Testable Acceptance Criteria'), [
      'Planning outputs are complete and reviewable.',
      'Verification steps are explicit.',
    ]),
    constraints: bulletsFromSection(extractSection(sourceText, 'Constraints'), [
      'Preserve existing workflow sequencing.',
      'Keep planning outputs deterministic and reviewable.',
    ]),
    decisions: bulletsFromSection(extractSection(sourceText, 'Decision Boundaries'), [
      'Plan stops after approved planning artifacts exist.',
      'Execution requires explicit downstream approval.',
    ]),
  };
}

function chineseBulletList(items) {
  return items.map((item) => `- ${item}`).join('\n');
}

function plannerDraftFromSource({ slug, sourceText, deliberateMode }) {
  const summary = buildSourceSummary(sourceText);
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
        name: 'Embed orchestration in plan runtime',
        pros: ['runtime truth and product contract stay aligned', 'one state machine owns gating and artifacts'],
        cons: ['requires new adapter seam for deterministic testing'],
      },
      {
        name: 'Wrapper consensus around lightweight plan',
        pros: ['smaller immediate diff'],
        cons: ['preserves split truth between wrapper and runtime', 'status/debugging remains fragmented'],
      },
    ],
    planText: [
      `# LoopX Plan: ${slug}`,
      '',
      '## Requirements Summary',
      '',
      `- ${summary.intent}`,
      `- ${summary.outcome}`,
      '',
      '## Deliverables',
      '',
      ...summary.acceptance.map((item, index) => `${index + 1}. ${item}`),
      '',
      '## Implementation Steps',
      '',
      '1. Add a plan orchestration adapter for planner, architect, and critic.',
      '2. Record plan iteration, review verdicts, and docs blockers in workflow state.',
      '3. Generate canonical plan artifacts and Chinese docs outputs from the approved planning source.',
      '4. Expose plan-stage progress in CLI status.',
      '5. Add deterministic regression coverage for happy path, iterate path, and docs blockers.',
      '',
      '## Risks',
      '',
      ...summary.constraints.map((item) => `- ${item}`),
      '',
      '## Verification',
      '',
      '- run workflow tests',
      '- run CLI status checks',
      '- prove docs blocking and iteration paths',
    ].join('\n'),
    architectureText: [
      `# LoopX Architecture: ${slug}`,
      '',
      '## Intent',
      '',
      `- ${summary.intent}`,
      '',
      '## Boundaries',
      '',
      ...summary.decisions.map((item) => `- ${item}`),
      '',
      '## Chosen Design',
      '',
      '- plan runtime owns the planner -> architect -> critic loop',
      '- a dedicated adapter separates production orchestration from deterministic tests',
      '- canonical plan artifacts remain under `.LoopX/plans/`',
      '- required Chinese docs are emitted under `docs/<slug>/`',
      '',
      '## Alternatives Considered',
      '',
      '- keep plan lightweight and wrap it externally',
      '- delay runtime alignment and keep the skill contract aspirational',
    ].join('\n'),
    developmentPlanText: [
      `# LoopX Development Plan: ${slug}`,
      '',
      '## Execution Breakdown',
      '',
      '1. Extend plan state schema and status output.',
      '2. Implement planner/architect/critic orchestration with bounded iteration.',
      '3. Emit canonical and docs planning artifacts.',
      '4. Add deterministic test seams and regression coverage.',
      '',
      '## Staffing Guidance',
      '',
      '- owner: plan runtime',
      '- reviewer: architect and critic',
      '- downstream execution: explicit later approval only',
      '',
      '## Sequencing',
      '',
      '- do not run critic before architect completes',
      '- do not approve build until plan blockers are gone',
      '- do not auto-launch execution from plan',
    ].join('\n'),
    testPlanText: [
      `# LoopX Test Plan: ${slug}`,
      '',
      '## Unit',
      '',
      '- state initialization for plan consensus mode',
      '- docs artifact path and blocking checks',
      '- planner/architect/critic review artifact recording',
      '',
      '## Integration',
      '',
      '- clarify -> plan happy path',
      '- critic iterate then approve path',
      '- docs missing or non-Chinese blocking path',
      '',
      '## Observability',
      '',
      '- status exposes iteration, architect review status, critic verdict, and docs blockers',
    ].join('\n'),
    docs: {
      architecture: [
        '# 架构文档',
        '',
        '## 目标',
        '',
        '- 将 plan 运行时升级为真实的 Planner / Architect / Critic 规划闭环。',
        '- 在 approved plan 产出后停止，不进入执行阶段。',
        '',
        '## 关键边界',
        '',
        ...summary.decisions.map((item) => `- ${item}`),
        '',
        '## 关键约束',
        '',
        ...summary.constraints.map((item) => `- ${item}`),
      ].join('\n'),
      design: [
        '# 设计文档',
        '',
        '## 设计要点',
        '',
        '- 引入 plan orchestration adapter，隔离真实编排与测试替身。',
        '- 在 workflow state 中记录 iteration、architect review、critic verdict 和 docs blockers。',
        '- 以 `.LoopX/plans/` 为 canonical，以 `docs/<slug>/` 为中文规划文档输出。',
        '',
        '## 非目标',
        '',
        ...summary.nonGoals.map((item) => `- ${item}`),
      ].join('\n'),
      testPlan: [
        '# 测试计划',
        '',
        '## 验证范围',
        '',
        ...summary.acceptance.map((item) => `- ${item}`),
        '',
        '## 核心回归',
        '',
        '- happy path: 一轮 approve 完成',
        '- iterate path: Critic 先 iterate 后 approve',
        '- docs blocker: 缺文件或英文占位内容都不能完成',
      ].join('\n'),
    },
    preMortem,
    principlesResolved: true,
    optionsReviewed: true,
    acceptanceCriteriaTestable: true,
    verificationStepsResolved: true,
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

function defaultArchitectReview({ plannerDraft, iteration }) {
  const findings = [
    'Real planning orchestration needs an adapter seam so production runtime and deterministic tests can share one state machine.',
    'Plan completion should depend on blocking docs outputs, not only canonical plan artifacts.',
  ];
  return reviewArtifact('architect', iteration, 'approve', findings, {
    status: 'complete',
    strongestObjection: 'Without an explicit adapter boundary, live orchestration and tests will drift or become flaky.',
    tradeoffTension: 'Faithful multi-agent behavior increases runtime complexity, while deterministic tests push toward stronger adapter isolation.',
  });
}

function containsChinese(text) {
  return /[\u3400-\u9fff]/.test(text);
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
  if (!containsChinese(plannerDraft.docs.architecture) || !containsChinese(plannerDraft.docs.design) || !containsChinese(plannerDraft.docs.testPlan)) {
    findings.push('Required docs outputs are not Chinese.');
  }
  return reviewArtifact('critic', iteration, findings.length > 0 ? 'iterate' : 'approve', findings, {
    acceptanceCriteriaTestable: plannerDraft.acceptanceCriteriaTestable,
    verificationStepsResolved: plannerDraft.verificationStepsResolved,
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
  const verdict = scriptedVerdict(script, index, 'approve');
  const findings = verdict === 'approve'
    ? ['Structured planning outputs satisfy the scripted approval path.']
    : [`Scripted critic verdict requested: ${verdict}.`];
  return reviewArtifact('critic', iteration, verdict, findings, {
    acceptanceCriteriaTestable: plannerDraft.acceptanceCriteriaTestable,
    verificationStepsResolved: plannerDraft.verificationStepsResolved,
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
        `You are acting as the real LoopX plan runtime for workflow "${context.slug}".`,
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
        '  "docs": {"architecture": string, "design": string, "testPlan": string},',
        '  "principlesResolved": boolean,',
        '  "optionsReviewed": boolean,',
        '  "acceptanceCriteriaTestable": boolean,',
        '  "verificationStepsResolved": boolean',
        '}',
        `Deliberate mode: ${Boolean(context.deliberateMode)}`,
        '',
        'Use Chinese for docs.architecture / docs.design / docs.testPlan.',
        'Do not ask questions. Do not wrap JSON in markdown.',
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
        `You are acting as the real LoopX architect review for workflow "${context.slug}".`,
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
        `You are acting as the real LoopX critic gate for workflow "${context.slug}".`,
        'Review the planning draft plus architect review and return only raw JSON with this shape:',
        '{',
        '  "verdict": "approve" | "iterate" | "reject",',
        '  "findings": string[],',
        '  "acceptanceCriteriaTestable": boolean,',
        '  "verificationStepsResolved": boolean',
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
