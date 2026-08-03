# loopx 轻量化治理与真实 Eval 体系 · 执行计划

## Source And Goal

- Source: `docs/loopx/design/2026-07-24-lightweight-governance-and-eval/需求设计文档.md`（AC-01~AC-11、D-01~D-13）
- Goal: 在 `redesign/lightweight-governance-eval` 分支上完成判分修复、压力测试安全网、治理机制化、文本瘦身与四臂 benchmark，产出可信的 effect-size 报告，目标版本 v0.7.0。

## Boundaries And Global Constraints

- 安全不变量（leaf 拓扑、fail-closed 评审门禁、新鲜验证、升级必停）任一 slice 不得削弱。
- `node scripts/verify-skills.mjs` 与 `npm test` 在每个 slice 完成时保持通过。
- 不新增外部依赖；不恢复旧版 ledger / finish-gate 协议；不改六大 intent 语义。
- 本计划散文 slice 仅为摘要，字段级权威见下方执行图（D-13 新格式样品）。

## Execution Slices

### P-001 eval 判分地基修复（D-05、D-06、D-12）

- Outcome: 离线正确性判定三态化，governed-escalation 与 integration_order 从 trace 真实派生，gpt-5.6 全部 case 具备机器可判字段，finding 判分含内容判据，离线 eval 在文档中降级定位。
- Acceptance: TC-01、TC-02、TC-03 通过；聚合报告 schema 版本递增。
- Review focus: 三态语义不误伤既有 live 判分路径；报告 schema 变更向后兼容说明。

### P-002 行为压力测试框架（D-08）

- Outcome: `evals/drills/` 框架 + 四条核心保证场景 + verifier 契约，在 v0.6 文本上建立基线。
- Acceptance: TC-10 通过（基线数据落盘）；场景与被测文本无互相引用。
- Review focus: 场景真实施压（压力要素组合）而非走过场；verifier 判据可复核。

### P-003 workflow-state 面包屑注入（D-01）

- Outcome: 两端 hook 每轮注入阶段面包屑，含分诊表（无状态时）与强制义务（有状态时）；不变式测试守护。
- Acceptance: TC-04 通过；hook 失败静默降级验证。
- Review focus: 注入内容与 skill 正文职责切分清晰；状态损坏路径不猜测。

### P-004 三档分诊收敛（D-02）

- Outcome: 分诊表进入注入模板与 RESOLVER；RESOLVER Disambiguation 收敛，语义不变。
- Acceptance: TC-05 通过。
- Review focus: 判据全部可观测；无既有触发条件丢失。

### P-005 单一真相源去重（D-03）

- Outcome: 评审门禁、handoff 语法、shared 契约引用化完成；verify-skills 重复检测上线。
- Acceptance: TC-06 通过；契约矩阵同步更新。
- Review focus: 门禁语义逐条保持（对照 v0.6 文本 diff 审查）。

### P-006 模板/schema 改革与 skill 正文瘦身（D-13 + AC-01）

- Outcome: 新版 DESIGN_SPEC_TEMPLATE 与 plan-schema 落地（核心节必填 + 触发节按需；图为唯一字段权威）；plan-reviewer 校验同步；重量级 SKILL.md（tdd、debug、spec、clarify、requirement-analyzer 等）正文瘦身至目标行数，细节下沉 references。
- Acceptance: TC-11（drills 不劣于基线）、TC-15 通过；工作流 skill 行数守卫收紧后 verify-skills 通过。
- Review focus: 瘦身 diff 中删除的每一段都能指认"由注入/引用/决策库承接"或"确属冗余"。

### P-007 review 家族重定性与编排成本工程（D-04、D-09）

- Outcome: final-review / fix-review 永久意图入口化（含 install-discovery 分类更名与文档同步）；fixer 语义显式；模型分档、单一修复波、反预判红旗进入 dispatch 与 review 契约。
- Acceptance: TC-07、TC-12 通过。
- Review focus: 转发契约与 v0.6 行为兼容；反预判红旗覆盖 controller 全部 reviewer 派发路径。

### P-008 账本分级与决策库（D-10、D-11）

- Outcome: issue/fix 短表路径 + high-risk 回填规则 + `needs_scope_change` 状态收敛；`docs/loopx/decisions/` 建库并完成条款迁移。
- Acceptance: TC-13、TC-14 通过。
- Review focus: 短表不弱化 `ready_for_fix` 门禁；迁移条款语义逐条对照。

### P-009 benchmark 框架与种子任务（D-07 前半）

- Outcome: 四臂 runner（含 docs-only 臂占位 AGENTS.md）+ 隐藏测试注入机制 + 带种子 bootstrap 的 effect-size 聚合 + 五类种子任务各一 + PROTOCOL 草稿；fake-agent 干跑通过。
- Acceptance: TC-08、TC-09 通过。
- Review focus: 隐藏测试对被测 agent 不可见；假独立并行 case 的写冲突真实可触发。
- 调整记录（2026-07-24）：任务集扩充至五类 20–30 个移入 P-010 前置步骤，避免一次性堆低质任务；框架与判分机制在本 slice 全量交付。

### P-010 协议冻结与四臂运行（D-07 后半）

- Outcome: 任务集扩充至五类 20–30 个 → docs-only AGENTS.md 由维护者定稿 → PROTOCOL.md 冻结（git tag）→ 四臂 × n≥5 运行 → 含 bootstrap 置信区间的 effect-size 报告；每个 loss/tie 立 follow-up issue。
- Acceptance: 报告落盘于 `.loopx/evals/benchmark/`（不入库），汇总结论写入 `evals/benchmark/RESULTS.md`。
- Review focus: 协议冻结后无参数漂移；结论仅陈述数据支持的差异。

## Authoritative Execution Graph

```loopx-execution-graph
{
  "schema": "loopx.execution-graph.v1",
  "selected_profile": "delegated-serial-v1",
  "selection_rationale": "P-001/P-002/P-003 可并行但共享 src/agent-eval 与 hook 测试基建的独立性未证明，且后续 slice 链式依赖，保守选串行。",
  "max_parallel": 4,
  "tasks": [
    {
      "id": "P-001",
      "outcome": "判分三态化与真实派生落地，gpt-5.6 契约补齐机器可判字段",
      "depends_on": [],
      "write_scope": ["src/agent-eval.mjs", "src/codex-agent-trace.mjs", "scripts/run-agent-evals.mjs", "scripts/run-darwin-simple-evals.mjs", "scripts/aggregate-agent-evals.mjs", "evals/gpt-5.6/", "test/"],
      "relevant_paths": ["src/installed-product-eval.mjs", "evals/darwin-simple/cases.json"],
      "exclusive_resources": [],
      "interfaces": { "consumes": ["现有 trace schema", "评审结果契约"], "produces": ["三态 quality 判定", "报告 schema v2"] },
      "source_anchors": ["AC-05", "D-05", "D-06", "D-12"],
      "acceptance": ["TC-01", "TC-02", "TC-03"],
      "verification": ["npm test", "node scripts/verify-skills.mjs"],
      "expected_evidence": ["新增单测通过输出", "unknown 计数出现在聚合报告"],
      "review_focus": ["live 判分路径无回归", "schema v2 兼容说明"],
      "parallel_safe": false,
      "parallel_rationale": "与 P-002/P-003 的 test/ 基建写作用域重叠未排除，串行。"
    },
    {
      "id": "P-002",
      "outcome": "drills 框架与四条核心保证场景，v0.6 基线落盘",
      "depends_on": [],
      "write_scope": ["evals/drills/", "scripts/", "src/drill-eval.mjs", "package.json", "test/"],
      "relevant_paths": ["skills/shared/", "evals/gpt-5.6/reviewer-live-cases.json"],
      "exclusive_resources": [],
      "interfaces": { "consumes": ["宿主 CLI 派发", "shared 契约保证清单"], "produces": ["drills 场景契约", "基线报告"] },
      "source_anchors": ["AC-07", "D-08"],
      "acceptance": ["TC-10"],
      "verification": ["npm run eval:drills -- --dry-run", "node scripts/verify-skills.mjs"],
      "expected_evidence": ["四场景基线通过率与方差数据"],
      "review_focus": ["场景施压真实性", "场景与被测文本无互引"],
      "parallel_safe": false,
      "parallel_rationale": "与 P-001 共享 package.json/test/ 写作用域，串行。"
    },
    {
      "id": "P-003",
      "outcome": "两端 hook 每轮注入 workflow-state 面包屑，不变式测试守护",
      "depends_on": [],
      "write_scope": ["scripts/claude-workflow-hook.mjs", "scripts/codex-workflow-hook.mjs", "src/", "test/"],
      "relevant_paths": ["skills/RESOLVER.md", "docs/loopx/cli.md"],
      "exclusive_resources": [],
      "interfaces": { "consumes": [".loopx 状态产物布局"], "produces": ["<loopx-workflow-state> 注入块契约"] },
      "source_anchors": ["AC-01", "D-01"],
      "acceptance": ["TC-04"],
      "verification": ["npm test", "node scripts/verify-skills.mjs"],
      "expected_evidence": ["不变式测试通过", "hook 失败降级用例通过"],
      "review_focus": ["注入与正文职责切分", "状态损坏路径"],
      "parallel_safe": false,
      "parallel_rationale": "与 P-001/P-002 共享 test/ 与 src/ 写作用域，串行。"
    },
    {
      "id": "P-004",
      "outcome": "三档分诊表进入注入模板与 RESOLVER，Disambiguation 收敛",
      "depends_on": ["P-003"],
      "write_scope": ["skills/RESOLVER.md", "scripts/claude-workflow-hook.mjs", "scripts/codex-workflow-hook.mjs", "test/"],
      "relevant_paths": ["docs/loopx/skills.md"],
      "exclusive_resources": [],
      "interfaces": { "consumes": ["<loopx-workflow-state> 注入块契约"], "produces": ["三档分诊判据表"] },
      "source_anchors": ["AC-02", "D-02"],
      "acceptance": ["TC-05"],
      "verification": ["node scripts/verify-skills.mjs", "npm test"],
      "expected_evidence": ["分诊判据与 RESOLVER 一致性检查通过"],
      "review_focus": ["无既有触发条件丢失"],
      "parallel_safe": false,
      "parallel_rationale": "依赖 P-003 注入通道。"
    },
    {
      "id": "P-005",
      "outcome": "评审门禁/handoff/shared 契约单一真相源化，重复检测上线",
      "depends_on": ["P-004"],
      "write_scope": ["skills/shared/", "skills/exec/", "skills/review/", "skills/subagent-exec/", "skills/parallel-subagent-exec/", "skills/clarify/", "scripts/verify-skills.mjs", "test/fixtures/skill-contract-matrix.json"],
      "relevant_paths": ["skills/RESOLVER.md"],
      "exclusive_resources": [],
      "interfaces": { "consumes": ["shared 契约"], "produces": ["引用化正文", "重复检测规则"] },
      "source_anchors": ["AC-03", "D-03"],
      "acceptance": ["TC-06"],
      "verification": ["node scripts/verify-skills.mjs", "npm test"],
      "expected_evidence": ["重复检测通过", "契约矩阵同步"],
      "review_focus": ["门禁语义逐条保持（v0.6 diff 对照）"],
      "parallel_safe": false,
      "parallel_rationale": "大范围 skills/ 文本改动，需在分诊收敛后统一进行。"
    },
    {
      "id": "P-006",
      "outcome": "模板/plan-schema 改革落地，重量级 SKILL.md 瘦身，drills 不劣于基线",
      "depends_on": ["P-002", "P-005"],
      "write_scope": ["skills/spec/", "skills/plan2exec/", "skills/plan-reviewer/", "skills/tdd/", "skills/debug/", "skills/clarify/", "skills/requirement-analyzer/", "test/fixtures/skill-contract-matrix.json", "scripts/verify-skills.mjs"],
      "relevant_paths": ["evals/drills/"],
      "exclusive_resources": [],
      "interfaces": { "consumes": ["drills 基线", "引用化正文"], "produces": ["新模板", "新 plan schema", "瘦身后正文"] },
      "source_anchors": ["AC-11", "D-13", "AC-01"],
      "acceptance": ["TC-11", "TC-15"],
      "verification": ["npm run eval:drills", "node scripts/verify-skills.mjs", "npm test"],
      "expected_evidence": ["drills 对比报告不劣于基线", "行数守卫收紧后全绿"],
      "review_focus": ["每段删除有承接方或确属冗余"],
      "parallel_safe": false,
      "parallel_rationale": "依赖 P-002 基线与 P-005 引用化。"
    },
    {
      "id": "P-007",
      "outcome": "review 家族永久入口化，fixer 语义显式，编排成本三规则落地",
      "depends_on": ["P-005"],
      "write_scope": ["skills/final-review/", "skills/fix-review/", "skills/review/", "skills/subagent-exec/", "skills/exec/", "src/install-discovery.mjs", "scripts/verify-skills.mjs", "README.md", "README.zh-CN.md", "docs/loopx/skills.md", "docs/loopx/skills.zh-CN.md", "test/"],
      "relevant_paths": ["skills/RESOLVER.md", "plugins/loopx/"],
      "exclusive_resources": [],
      "interfaces": { "consumes": ["review 三意图解析"], "produces": ["意图入口分类", "模型分档 dispatch 契约", "反预判红旗"] },
      "source_anchors": ["AC-04", "AC-08", "D-04", "D-09"],
      "acceptance": ["TC-07", "TC-12"],
      "verification": ["node scripts/verify-skills.mjs", "npm test"],
      "expected_evidence": ["弃用措辞清零断言", "红旗拦截用例通过"],
      "review_focus": ["转发契约兼容 v0.6", "红旗覆盖全部派发路径"],
      "parallel_safe": false,
      "parallel_rationale": "与 P-006 共享 skills/exec、verify-skills 写作用域，串行。"
    },
    {
      "id": "P-008",
      "outcome": "issue/fix 账本分级与 needs_scope_change 收敛，决策库建库并迁移条款",
      "depends_on": ["P-005"],
      "write_scope": ["skills/issue/", "skills/fix/", "skills/finish/", "skills/shared/completion-check.md", "docs/loopx/decisions/", "scripts/verify-skills.mjs", "test/"],
      "relevant_paths": ["skills/RESOLVER.md"],
      "exclusive_resources": [],
      "interfaces": { "consumes": ["High-Risk Triggers 既有定义"], "produces": ["短表 ledger 契约", "决策库"] },
      "source_anchors": ["AC-09", "AC-10", "D-10", "D-11"],
      "acceptance": ["TC-13", "TC-14"],
      "verification": ["node scripts/verify-skills.mjs", "npm test"],
      "expected_evidence": ["短表 preflight 用例通过", "决策文件存在性检查通过"],
      "review_focus": ["短表不弱化门禁", "迁移条款语义对照"],
      "parallel_safe": false,
      "parallel_rationale": "与 P-007 共享 verify-skills/test 写作用域，串行。"
    },
    {
      "id": "P-009",
      "outcome": "benchmark 任务集、隐藏测试、docs-only 臂与四臂 runner，fake-agent 干跑通过",
      "depends_on": ["P-001"],
      "write_scope": ["evals/benchmark/", "scripts/", "test/fixtures/", "package.json", "test/"],
      "relevant_paths": ["scripts/run-darwin-simple-evals.mjs", "src/installed-product-eval.mjs"],
      "exclusive_resources": [],
      "interfaces": { "consumes": ["三态判分", "ref 打包安装机制"], "produces": ["四臂运行契约", "隐藏测试布局"] },
      "source_anchors": ["AC-06", "D-07"],
      "acceptance": ["TC-08", "TC-09"],
      "verification": ["npm test", "node scripts/verify-skills.mjs"],
      "expected_evidence": ["干跑 v2 报告含 effect-size 段", "安装面检查通过"],
      "review_focus": ["隐藏测试不可见性", "假独立写冲突可触发"],
      "parallel_safe": false,
      "parallel_rationale": "依赖 P-001 判分地基；与文本类 slice 无冲突但保守串行。"
    },
    {
      "id": "P-010",
      "outcome": "协议冻结、四臂 × n≥5 运行、effect-size 报告与 loss 工单",
      "depends_on": ["P-006", "P-007", "P-008", "P-009"],
      "write_scope": ["evals/benchmark/PROTOCOL.md", "evals/benchmark/RESULTS.md"],
      "relevant_paths": ["evals/benchmark/"],
      "exclusive_resources": [{ "kind": "budget", "key": "live-model-runs", "reason": "四臂 × n≥5 的模型调用预算独占" }],
      "interfaces": { "consumes": ["四臂运行契约", "冻结协议"], "produces": ["effect-size 报告", "follow-up issues"] },
      "source_anchors": ["AC-06", "D-07"],
      "acceptance": ["RESULTS.md 含 C/D vs A 与 D vs C 的胜率与置信区间", "每个 loss/tie 有对应 issue"],
      "verification": ["npm run eval:benchmark -- --protocol evals/benchmark/PROTOCOL.md"],
      "expected_evidence": ["报告落盘", "协议 tag 存在"],
      "review_focus": ["协议冻结后无参数漂移", "结论不超出数据支持"],
      "parallel_safe": false,
      "parallel_rationale": "终末聚合 slice，依赖全部前序。"
    }
  ]
}
```

## Integration And Final Verification

- 全链回归：`node scripts/verify-skills.mjs && npm test` 全绿；drills 全量运行不劣于 P-002 基线（AC-01 终验）。
- 发布前清单：release notes 说明 D-04 分类更名与 D-13 模板改革；plugin 清单版本对齐。
- 仅在集成层覆盖的锚点：AC-01（跨 slice 的"机制承接文本"总验证，由 drills 全量对比承担）。

## Handoff And Residual Risks

- Status: ready_for_exec
- Blockers: none
- Residual risks: benchmark 模型调用预算需维护者确认后启动 P-010；docs-only 臂 CLAUDE.md 内容边界待维护者定稿（设计文档 §6）。
- Resume note: 分支 `redesign/lightweight-governance-eval`；主工作区存在维护者未提交的 eval 相关改动（configurationParity 等），P-001 实施时需先与之合并或由维护者先行提交。
