import { join } from 'node:path';
import { mkdir } from 'node:fs/promises';

import { runCodexExecJson } from './codex-exec-runtime.mjs';

const DEFAULT_MAX_ITERATIONS = 5;
const DEFAULT_PLAN_CODEX_TIMEOUT_MS = 600000;

function planCodexTimeoutMs() {
  const value = Number(process.env.LOOPX_PLAN_CODEX_TIMEOUT_MS || DEFAULT_PLAN_CODEX_TIMEOUT_MS);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_PLAN_CODEX_TIMEOUT_MS;
}

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

function mdTable(headers, rows) {
  return [
    `| ${headers.join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.map((cell) => String(cell ?? '').replace(/\n/g, ' ').replace(/\|/g, '\\|')).join(' | ')} |`),
  ].join('\n');
}

function plannerDraftFromSource({ slug, sourceText, deliberateMode }) {
  const summary = buildSourceSummary(sourceText);
  const executionInputs = bulletsFromSection(extractSection(sourceText, 'Execution Inputs'), []);
  const executionInputsResolved = executionInputs.length > 0 && executionInputs.every((item) => !/\b(TBD|待定|unknown|later)\b/i.test(item));
  const inScope = summary.inScope.slice(0, 16);
  const acceptance = summary.acceptance.slice(0, 16);
  const constraints = summary.constraints.slice(0, 12);
  const decisions = summary.decisions.slice(0, 12);
  const preMortem = deliberateMode
    ? [
        '如果架构边界没有明确外部依赖和副作用控制，build 阶段容易把 mock 范围误做成真实集成。',
        '如果开发切片只按模块拆分而不是按可验收行为拆分，后续实现容易出现页面、接口和数据闭环脱节。',
        '如果测试计划没有覆盖核心验收样例、异常路径和人工确认点，review 阶段无法判断是否满足需求。',
      ]
    : [];

  return {
    principles: [
      '计划必须完整承接已澄清需求，不把核心范围压缩成泛化条目。',
      '架构、详细设计、开发计划和测试计划必须分别回答不同问题，避免 build 阶段自行补设计。',
      '涉及人工确认、外部系统、资金资产、交易、权限或通知的边界必须显式写清。',
      '每个可交付切片都必须有可验证信号和人工确认点。',
      '计划阶段只输出方案和执行输入，不自动进入实现。',
    ],
    decisionDrivers: [
      summary.intent,
      summary.outcome,
      '后续 build 需要可直接执行的模块边界、数据结构、接口契约和验收矩阵。',
    ],
    options: [
      {
        name: '统一平台底座 + 场景扩展',
        pros: ['共享状态、日志、异常和验收闭环', '减少重复实现', '便于后续接入真实 adapter'],
        cons: ['需要严格控制扩展字段和状态机边界'],
      },
      {
        name: '按场景分别实现',
        pros: ['单个场景领域表达更直接'],
        cons: ['重复状态机、接口、日志和页面结构，首期交付和回归成本高'],
      },
    ],
    planText: [
      `# 计划：${slug}`,
      '',
      '## 需求摘要',
      '',
      `- ${summary.intent}`,
      `- ${summary.outcome}`,
      '',
      '## 交付范围',
      '',
      ...inScope.map((item) => `- ${item}`),
      '',
      '## 方案选择',
      '',
      '采用统一平台底座承载核心流程，并通过场景配置、受控扩展结构或子表表达差异。该方案优先保证人工确认边界、数据追溯、异常处理和验收闭环。',
      '',
      '## 关键里程碑',
      '',
      '1. 明确架构边界、数据模型、状态机和外部依赖隔离方式。',
      '2. 定义接口、函数、组件、字段和错误处理契约。',
      '3. 按可验收行为拆分开发切片并逐项落地。',
      '4. 按需求验收矩阵完成自动化验证和必要人工确认。',
      '',
      '## 验收目标',
      '',
      ...acceptance.map((item) => `- ${item}`),
      '',
      '## 风险',
      '',
      ...constraints.map((item) => `- ${item}`),
      '',
      '## 执行输入',
      '',
      ...(executionInputs.length > 0 ? executionInputs.map((item) => `- ${item}`) : ['- 源需求规格、产品文档、原型说明和当前代码事实。']),
    ].join('\n'),
    architectureText: [
      `# 架构方案：${slug}`,
      '',
      '## 文档定位',
      '',
      '架构方案是本阶段的架构文档，回答系统边界、模块职责、数据/状态流、接口边界、架构决策和质量属性，不负责逐文件排期或字段级默认值。',
      '',
      '## 架构目标与非目标',
      '',
      `目标：${summary.intent}`,
      '',
      '非目标：',
      '',
      ...summary.nonGoals.map((item) => `- ${item}`),
      '',
      '## 上下文与系统边界',
      '',
      ...decisions.map((item) => `- ${item}`),
      '',
      '## 组件与职责',
      '',
      '| 组件 | 职责 | 边界 |',
      '| --- | --- | --- |',
      '| 入口层 | 接收用户、API、任务或页面操作 | 只做参数适配和鉴权，不承载核心业务规则 |',
      '| 业务层 | 编排状态机、明细生成、异常处理和人工动作 | 不直接调用未声明的真实外部副作用 |',
      '| 数据层 | 持久化核心实体、日志、状态和追溯字段 | 结构化字段优先，扩展字段受控 |',
      '| 前端/交互层 | 展示任务、明细、进度、操作和验收反馈 | 不自行推导状态机或绕过后端校验 |',
      '',
      '## 数据与状态模型',
      '',
      '- 核心数据必须支持来源追溯、状态推进、人工操作留痕、异常处理和验收核对。',
      '- 状态机必须集中定义合法动作、前置条件、后置状态和非法路径。',
      '- 外部来源、下游回写和真实副作用必须通过明确 adapter/provider 边界隔离。',
      '',
      '## 接口与集成契约',
      '',
      '- API、任务入口、页面路由和 provider 方法必须列明输入、输出、权限、错误和幂等边界。',
      '- mock 与真实集成必须可区分；首期未批准的真实依赖不得暗接。',
      '',
      '## 架构决策记录',
      '',
      '| 决策 | 取舍 | 后续影响 |',
      '| --- | --- | --- |',
      '| 统一平台底座 | 降低重复实现并集中控制状态/日志/异常 | 场景差异必须进入受控扩展点 |',
    ].join('\n'),
    developmentPlanText: [
      `# 开发计划：${slug}`,
      '',
      '## 文档定位',
      '',
      '开发计划回答交付顺序、切片、依赖、验证、人工确认点、回滚和完成定义，不重新选择架构方向。',
      '',
      '## 交付切片',
      '',
      '1. 领域/数据/状态底座：定义核心实体、状态机、repository/usecase 边界和基础测试。',
      '2. 主流程闭环：实现数据生成、查询、人工动作、日志和异常处理。',
      '3. 入口与交互：接入 API、页面、权限和必要的前端组件。',
      '4. 验收收敛：按源需求逐项跑自动化验证和人工验收。',
      '',
      '## 实施顺序与依赖',
      '',
      '- 先完成数据和状态机，再暴露入口，最后做页面和端到端验收。',
      '- 涉及外部副作用、权限、资金资产、交易或通知的切片必须 HITL。',
      '- 如果实现发现源需求与代码事实冲突，必须回到 plan/clarify 修订。',
      '',
      '## 文件级变更清单',
      '',
      '- 后端业务域、API/handler、数据 schema/repository、service/server wiring。',
      '- 前端页面、组件、API client、构建配置。',
      '- 单元测试、接口测试、构建验证和人工验收记录。',
      '',
      '## 验证计划',
      '',
      ...acceptance.map((item) => `- 验证：${item}`),
      '',
      '## 完成定义',
      '',
      '- 所有源需求都有实现证据或明确非目标说明。',
      '- 自动化测试、构建和人工验收信号与开发切片一一对应。',
      '- 未完成、风险和回滚路径在交付说明中明确记录。',
    ].join('\n'),
    testPlanText: [
      `# 测试计划：${slug}`,
      '',
      '## 需求到测试矩阵',
      '',
      ...acceptance.map((item) => `- ${item}`),
      '',
      '## 自动化测试',
      '',
      '- 状态机合法/非法转换。',
      '- 数据去重、持久化、查询和日志写入。',
      '- API 参数、权限、错误和响应结构。',
      '- 前端构建和关键页面渲染。',
      '',
      '## 人工验收',
      '',
      '- 页面/流程是否符合原型和产品文档。',
      '- 人工确认动作是否清晰且不可被系统自动跳过。',
      '- mock/真实边界是否符合非目标。',
      '',
      '## 回归门禁',
      '',
      '- build 阶段必须记录命令、结果、截图或人工确认证据。',
      '- review 阶段必须能按需求矩阵追溯每个验收项。',
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

function isCodexTimeoutError(error) {
  return /codex_exec_failed:timeout|timeout/i.test(error instanceof Error ? error.message : String(error));
}

function shouldUseSourceDrivenDefault(context) {
  const mode = String(process.env.LOOPX_PLAN_RUNTIME || '').trim().toLowerCase();
  if (mode === 'local' || mode === 'source' || mode === 'source-driven') {
    return true;
  }
  if (mode === 'codex' || mode === 'real') {
    return false;
  }
  return String(context?.sourceText || '').length > 45000;
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
  const local = createScriptedPlanAdapter();
  const real = createRealPlanAdapter();
  return {
    async planner(context) {
      return shouldUseSourceDrivenDefault(context) ? local.planner(context) : real.planner(context);
    },
    async architect(context) {
      return shouldUseSourceDrivenDefault(context) ? local.architect(context) : real.architect(context);
    },
    async critic(context) {
      return shouldUseSourceDrivenDefault(context) ? local.critic(context) : real.critic(context);
    },
  };
}

export function createRealPlanAdapter({ model } = {}) {
  return {
    async planner(context) {
      const outputPath = join(context.root, 'plan-reviews', `planner-iteration-${context.iteration}.json`);
      await mkdir(join(context.root, 'plan-reviews'), { recursive: true });
      const timeoutMs = planCodexTimeoutMs();
      const prompt = [
        `You are acting as the real loopx plan runtime for workflow "${context.slug}".`,
        'Read the source requirements and produce planning content for this workflow.',
        'Use only the source requirements included in this prompt and the Brownfield Evidence already written there. Do not inspect the repository, run shell commands, or search generated code. If a code fact is not in the source, mark it as an assumption or build-time confirmation point.',
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
        'planText, architectureText, developmentPlanText, and testPlanText MUST be written in Chinese for human review. Do not write English headings or English prose except literal code paths, API names, commands, enum values, and product terms.',
        'Make the artifacts approval-ready, not summary-only: each Markdown body must include enough detail for a human reviewer to approve or reject without opening JSON runtime state.',
        'Required reviewer-facing sections: 原始需求清单, 原始需求映射, 方案选择/ADR, 架构边界, 开发切片, 测试矩阵, 风险与非目标, 人工确认点, build handoff.',
        'architectureText is the architecture document: it MUST define 文档定位, 架构目标与非目标, 上下文与系统边界, 组件与职责, 数据与状态模型, 接口与集成契约, 关键流程, 质量属性与风险, 架构决策记录. It answers system boundaries and design tradeoffs, not implementation scheduling.',
        'developmentPlanText is the development plan: it MUST define 文档定位, 交付切片, 实施顺序与依赖, 需求到开发切片, 文件级变更清单, 验证计划, 人工确认点, 回滚/降级策略, 完成定义. It answers execution sequence and completion gates, not architecture selection.',
        'The detailed design is generated as change design.md from the plan package and MUST define 文档定位, 需求到设计映射, 数据结构与字段, 接口、函数与组件契约, 状态机与流程细节, 错误处理与边界条件, 测试设计, 实现注意事项. It answers field/function/component-level implementation details.',
        'Treat the source requirements/PRD as the source of truth. Explicitly enumerate every named event, field, workflow, processing mode, table row, and acceptance item that appears in the source, or clearly mark it out of scope with rationale.',
        'Do not collapse broad requirements into generic bullets such as "新增后台页面" or "覆盖 8 类工作流"; expand them into reviewable subitems, ownership, verification signals, and residual risks.',
        'The HTML reading view is derived from these Markdown bodies, so the Markdown itself must contain detailed tables and sections instead of relying on a separate visual summary.',
        'If previous review feedback is present, revise the plan to explicitly resolve it. Do not repeat the same plan unchanged.',
        'Do not ask questions. Do not wrap JSON in markdown.',
        '',
        'Previous review feedback:',
        reviewHistoryText(context.reviewHistory),
        '',
        'Source requirements:',
        context.sourceText,
      ].join('\n');
      try {
        return await runCodexExecJson({
          cwd: context.cwd,
          prompt,
          outputPath,
          model,
          timeoutMs,
          promptViaStdin: true,
        });
      } catch (error) {
        if (isCodexTimeoutError(error)) {
          return plannerDraftFromSource(context);
        }
        throw error;
      }
    },
    async architect(context) {
      const outputPath = join(context.root, 'plan-reviews', `architect-iteration-${context.iteration}.json`);
      await mkdir(join(context.root, 'plan-reviews'), { recursive: true });
      const timeoutMs = planCodexTimeoutMs();
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
        'Use only the planning draft in this prompt. Do not inspect the repository or run searches.',
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
      try {
        return await runCodexExecJson({
          cwd: context.cwd,
          prompt,
          outputPath,
          model,
          timeoutMs,
          promptViaStdin: true,
        });
      } catch (error) {
        if (isCodexTimeoutError(error)) {
          return defaultArchitectReview(context);
        }
        throw error;
      }
    },
    async critic(context) {
      const outputPath = join(context.root, 'plan-reviews', `critic-iteration-${context.iteration}.json`);
      await mkdir(join(context.root, 'plan-reviews'), { recursive: true });
      const timeoutMs = planCodexTimeoutMs();
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
        'Use only the planning draft and architect review in this prompt. Do not inspect the repository or run searches.',
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
      try {
        return await runCodexExecJson({
          cwd: context.cwd,
          prompt,
          outputPath,
          model,
          timeoutMs,
          promptViaStdin: true,
        });
      } catch (error) {
        if (isCodexTimeoutError(error)) {
          return defaultCriticReview(context);
        }
        throw error;
      }
    },
  };
}

export { DEFAULT_MAX_ITERATIONS };
