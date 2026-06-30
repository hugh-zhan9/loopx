# Harness Engineering 对 loopx 的可吸收点

本文整理自 `docs/articles/harness-engineering-exploration.md`，目标不是把文中的企业级 SpecWorker 体系原样搬进 loopx，而是提炼出适合 loopx 的工程纪律、skill 优化点和流程改进方向。

loopx 更适合定位为一个轻量、可移植、skill-first 的 Harness kernel：通过 skills、hooks、CLI 和 repo context，把 AI 编码工作从“模型自由发挥”约束到“有契约、有证据、有回路”的工程轨道上。

引用说明：本文中的“原文锚点”均来自 [harness-engineering-exploration.md](./harness-engineering-exploration.md)。原文图片资产保存在 [assets/harness-engineering-exploration/](./assets/harness-engineering-exploration/)；本文只引用正文关键句，不复制整段图文。

## 总体判断

文章中最值得吸收的不是某个具体工具链，而是这几个判断：

> 原文锚点：Harness Engineering “不是教模型怎么回答，而是设计模型怎么工作。”
>
> 原文锚点：真正限制研发节奏的是“理解、对齐、追溯、沉淀、验证”。
>
> 原文锚点：AI Coding 的工程化，本质是对“不确定性”的系统治理。

1. AI Coding 的瓶颈不在“能不能写代码”，而在“理解、对齐、追溯、沉淀、验证”这些非编码环节。
2. Harness Engineering 的核心是治理不确定性：模型输出是不稳定的，所以模型外部必须有确定性的文件、契约、门禁、脚本和反馈回路。
3. 确定的事应该脚本化，不确定的事才交给 AI；AI 负责判断、综合、生成，脚本负责校验、状态、格式和重复执行。
4. 上下文不是越多越好，而是越相关越好；skill 和 subagent 都应该按需读取，避免把成本和注意力浪费在无关材料上。
5. 工作完成不等于代码写完，还包括验证证据、评审结论、知识沉淀和后续可复用的上下文。

loopx 已经有相近的骨架：

```text
clarify -> spec? -> plan-to-exec -> (exec | subagent-exec) -> review/final-review -> fix-review? -> finish
```

因此优化方向应该是强化这条路径的可追踪性、证据链和知识沉淀，而不是新增一套重量级 P1-P6 平台。

## 吸收原则

### 1. 吸收纪律，不照搬平台

文章里的 TAPD、CLS、K8s、流水线发布、UI 像素校准、中心化指标上报都很有价值，但它们绑定具体组织基础设施。loopx 应优先吸收其背后的纪律：

> 原文锚点：回头看，协议层、管线层、纪律层、长期记忆都在做同一件事：把“AI 看不见的东西”挪到它一定看得见的地方。

- 来源必须可追溯。
- 决策必须显式。
- 实现必须映射到需求和设计。
- 完成必须有新鲜证据。
- 失败必须先诊断再修。
- 收尾必须判断是否产生长期知识。

### 2. 用结构化 artifact 承接，而不是靠 agent 自觉

凡是需要跨阶段传递的信息，都不应该只留在会话里。应沉淀到可读文件或本地状态中，例如：

> 原文锚点：状态持久化设计要求“每个步骤的输入、输出、状态都写到一个共享的持久化文件”，而不是在 Agent 间直接传递上下文。

- clarification bundle
- design/spec
- implementation plan
- task review report
- final review report
- finish audit
- memory/spec candidates

### 3. 分数门禁谨慎引入

文章使用 `total_score >= 95` 作为统一门禁。loopx 暂不宜直接照搬固定分数，因为没有真实反馈校准时，分数容易变成伪精确。更适合先采用工程判定：

> 原文锚点：每个阶段结束由独立的 `specworker-evaluation` 跑评分，`total_score >= 95` 才允许进入下一阶段，最多 3 轮整改。

- `blocking`
- `important`
- `suggestion`
- `ready`
- `ready with risks`
- `not ready`

后续如果积累了足够指标，再考虑评分模型。

## 原文对照索引

| 原文位置 | 本文吸收点 | loopx 落点 |
|---|---|---|
| 序章 / 0.3 | AI Coding 瓶颈从写代码转向理解、对齐、追溯、沉淀、验证 | 总体判断；完整 golden path |
| 2.1.1 协议层 | 每一步输入输出必须有契约 | `clarify`、`spec`、artifact validator |
| 2.1.2.1 P1 需求 | `requirements.md` 与 `test-cases.md` 共用 AC；双 SubAgent 串联 | ~~`clarify` intake package~~ 已落地；未来 `acceptance-testcase-generator` |
| 2.1.2.2 P2 设计 | `design.md` 是机器可读契约；D-x 是工单池 | ~~`spec` 产出 D-* anchors，`plan-to-exec`/`review` 消费 D-*~~ 已落地；~~`T-*` 工单池仍可增强~~ 已落地为 plan-local task anchors |
| 2.1.2.3 P3 实现 | code-reviewer 对照设计做契约 review，优先读 diff | `review`、`subagent-exec` |
| 2.1.2.4 P4 集成测试 | 测试左移；从测试用例生成可执行脚本；失败后诊断 | `tdd`、`debug`、`issue`、`fix` |
| 2.1.2.6 P6 归档 | knowledge-sync、delta-spec、增量合并 | `finish`、`codebase-spec`、`docs/loopx/specs/` |
| 2.1.2.7 可监测性 | 证据、回溯、metrics | `verify`、`final-review`、本地 metrics |
| 2.1.3 纪律层 | TDD、Debug、Verify、Review、Evaluate 作为门禁 | support skills 与 review/final-review |
| 2.3 知识库 | 长期记忆、两级查找、diff-first subagent | `docs/loopx/specs/`、memory、subagent task brief |
| 实践原则 1-4 | Fixed Flow、上下文控制、token 成本、脚本化 | workflow skills、hooks、CLI scripts |
| 结束语未解问题 | 测试可信度、知识库治理、老项目适配 | P1/P2 roadmap |

## 可吸收点一：需求口径与验收标准同源

### 文章中的价值

> 原文锚点：P1 阶段同时产出 `requirements.md`（给 P2 用）+ `test-cases.md`（给 P4 用），两份文档共用同一份 AC 列表。
>
> 原文锚点：P1 阶段不是 AI 一气呵成出稿，而是 `specworker-requirement-analyzer` 生成澄清问题，主流程让用户回答，再由 `specworker-integration-testcase-generator` 基于澄清后的需求生成 `test-cases.md`。

文章强调 P1 阶段要钉死需求口径，并让 `requirements.md` 和 `test-cases.md` 共用同一份 AC 列表。核心价值是避免下游重新解释需求。

这里的 `test-cases.md` 不是单元测试清单，而是需求阶段产出的黑盒验收/集成测试设计。它回答“业务上怎么证明这条需求成立”，而不是“代码里哪个函数怎么测”。单元测试仍然由 `tdd` 和实现阶段负责，但它应该回扣同一组 `AC-*`。

### loopx 当前承载点

- `clarify`
- `requirement-analyzer`
- `spec`
- `plan-to-exec`
- `tdd`
- `review`
- `final-review`

### 建议优化

> 状态：`clarify` intake package 已落地，当前新 workflow 会生成 `.loopx/intake/YYYY-MM-DD-<slug>/clarification.md`、`requirements.md`、`test-cases.md`。下列与三件套、`AC-*`、`TC-*` 同源和下游读取相关的建议已完成；独立 `acceptance-testcase-generator` support skill 仍是后续评估项。

#### `clarify`

~~`clarify` 的输出可以更明确地形成需求源头记录：~~ 已落地为 `requirements.md`。

- ~~`Source Facts`：用户原话、PRD、issue、外部文档中的事实，不混入 agent 改写。~~
- ~~`Decisions`：已经确认的业务或技术决策。~~
- ~~`Non-goals`：明确不做什么。~~
- ~~`Acceptance Criteria`：带稳定 ID 的验收标准，例如 `AC-001`。~~
- ~~`Open Questions`：仍未回答但会影响范围、设计、验证或上线的事项。~~
- ~~`Route`：进入 `spec` 还是 `plan-to-exec`。~~

~~AC 建议优先采用可测试形式：~~ 已写入 `clarify` 产物契约。

```text
AC-001
WHEN <前置条件或用户动作>
THEN <系统必须出现的行为>
AND <附加约束>
```

如果需求天然更适合 BDD，可以使用：

```text
GIVEN <上下文>
WHEN <动作>
THEN <结果>
```

#### `requirement-analyzer`

可强化 traceability 报告：

| Source | Claim | AC | Gap | Risk |
|---|---|---|---|---|
| PRD section / issue line | 原始需求点 | `AC-001` | 是否缺失 | 对实现和测试的影响 |

当输入文档质量不足时，`requirement-analyzer` 不应推进流程，而是输出缺口清单，交给 `clarify` 继续问。

#### 需求阶段测试用例

~~建议把需求阶段测试用例作为一等 artifact，而不是等到实现后由 agent 重新理解需求再补测试。~~ 已落地为 intake package 中的 `test-cases.md`。

~~可选路径：~~ 当前采用目录式 intake package：

```text
clarify -> .loopx/intake/YYYY-MM-DD-<slug>/{clarification.md,requirements.md,test-cases.md} -> spec?/plan-to-exec
```

~~在 loopx 当前形态下，可以先不强制文件名固定为 `test-cases.md`，但应明确这个产物的职责。推荐命名：~~ 已决定固定为 `.loopx/intake/YYYY-MM-DD-<slug>/test-cases.md`。

```text
.loopx/intake/YYYY-MM-DD-<slug>/test-cases.md
```

~~或在没有进入 `spec` 的轻量任务中写入：~~ 已被目录式 intake package 替代。

~~`.loopx/intake/test-cases-<slug>-YYYY-MM-DD.md`~~

~~这个文档应和需求共用同一份 `AC-*`，不要另起一套需求编号。推荐结构：~~ 已落地为 `requirements.md` 的 `AC-*` 与 `test-cases.md` 的 `TC-* -> AC-*` 映射。

```text
## Acceptance Criteria Source

- AC-001: <可测验收标准>
- AC-002: <可测验收标准>

## Test Cases

TC-001
Source AC: AC-001
Type: integration | e2e | api | cli | manual
Preconditions:
- <前置数据、权限、配置或系统状态>
Steps:
1. <用户动作或系统调用>
2. <后续动作>
Expected:
- <可观察结果>
Automation target:
- <后续可自动化时的测试层级或命令，未知则写 TBD>
```

这份测试用例文档应该满足几条规则：

- ~~每个 `TC-*` 必须引用至少一个 `AC-*`。~~
- ~~每个高风险 `AC-*` 至少有一个正向 case 和一个失败/边界 case。~~ 已写入 `clarify` skill 规则。
- ~~测试用例描述外部可观察行为，不绑定内部函数或尚未批准的实现方案。~~
- ~~无法自动化的 case 必须标注原因和人工验证方式。~~
- ~~`plan-to-exec` 后续只负责把这些 case 转成具体测试任务，不重新解释需求。~~ 已写入 `plan-to-exec` intake package 规则。

文章里的双 SubAgent 串联可以映射为 loopx 的两段职责：

1. ~~`requirement-analyzer` 或 `clarify` 先找需求歧义，生成问题，主流程让用户确认。~~ 当前由 `clarify` intake package 承接。
2. 一个未来可新增的 `acceptance-testcase-generator` support skill 基于确认后的 `AC-*` 生成 `test-cases.md`。

~~在没有新增 skill 前，可以先把这一步写进 `clarify` 或 `spec` 的输出要求中。~~ 已先写进 `clarify`、`spec`、`plan-to-exec`。长期看，单独做成 support skill 更干净：它不是工作流状态，只负责把已确认 AC 转成验收/集成测试设计。

#### `plan-to-exec`

每个任务必须引用来源 AC：

```text
Task 2: Add renewal state transition guard
Source AC: AC-003, AC-004
Design anchors: D-002
Verification: npm test -- renewal-state
Expected evidence: failing test first, then passing test output
```

#### `tdd`

单元测试和回归测试应尽量映射到 AC，并参考需求阶段的 `test-cases.md`：

- 测试名或注释包含 `AC-xxx`。
- 先观察失败，再写实现。
- 如果某条 AC 无法测试，计划中必须说明原因和替代验证方式。

#### `final-review`

最终评审应输出覆盖矩阵：

| AC | Implemented? | Verified by | Evidence | Gap |
|---|---|---|---|---|
| `AC-001` | Yes/No/Partial | test / command / manual check | 命令或报告 | 剩余风险 |

### 流程变化

~~推荐路径：~~ 当前已调整为：

```text
requirement-analyzer? -> clarify intake package -> spec? -> plan-to-exec -> tdd/exec -> final-review
```

其中 `?` 表示当已有 PRD、issue 或外部需求文档时使用。

## 可吸收点二：设计文档变成机器可比对的契约

### 文章中的价值

> 原文锚点：传统 `design.md` 是给人读的，但 AI 需要的是机器可读的契约：接口签名、错误码、状态机、字段必填项。
>
> 原文锚点：`design.md` 里有一个 `D-1 / D-2 / D-3 ...` 改动点列表，P3 实现时按 D-x 列表逐项勾掉，code-reviewer 也按 D-x 列表逐项 review。

文章认为传统 design.md 太像给人读的说明文，AI 更需要机器可读的契约：接口、状态、字段、错误码、数据模型、边界条件。

### loopx 当前承载点

- `spec`
- `api-designer`
- `architecture-designer`
- `sql-style`
- `cli-developer`
- `review`
- `final-review`

### 建议优化

#### `spec`

> 状态：`D-*` design contract anchors 已落地到 `spec` skill 和详细设计模板。当前实现保留人类可读设计文档，同时要求实现相关决策有 inline `D-*`、末尾索引、Source AC、contract type、boundary/non-goal、downstream expectation；~~完整分类型 contract block 仍可后续细化~~ 已落地为 `Behavior` / `Data` / `Interface` / `Workflow` / `Operational` contract blocks，其中 `Workflow Contract` 承接 skill handoff。

`spec` 应继续保持“决策文档”定位，但对可实现契约增加结构化块。按变更类型选择相关部分：

- `Behavior Contract`：业务行为、状态变化、边界条件。
- `API Contract`：endpoint / command / function signature、request、response、错误模型、兼容性。
- `Data Contract`：schema、字段、索引、迁移、回滚、数据兼容。
- `Permission Contract`：角色、权限、鉴权失败行为。
- `State Contract`：状态机、非法转移、幂等性、并发风险。
- `CLI Contract`：命令、flags、stdout/stderr、exit code、JSON 输出。
- `Operational Contract`：配置、部署、告警、回滚、可观测性。

~~每个契约项建议分配稳定 ID：~~ 已落地为详细设计中的 `D-*` design contract anchors。

```text
D-001 API response includes `usage_limit_remaining`
D-002 Billing state transition rejects expired subscriptions
D-003 Migration backfills existing rows without changing public IDs
```

#### 支持 skills 的使用方式

根据契约类型叠加 lens：

- API 变更：`api-designer`
- 数据库或 migration：`sql-style`
- 架构/NFR/operability：`architecture-designer`
- CLI 行为：`cli-developer`

~~这些 support skills 不应替代 `spec`，而是帮助 `spec` 把对应领域的契约写得更完整。~~ 已落地为 support lenses 合并进统一设计文档，不生成第二权威 contract 文件。

#### `review`

~~review 先检查契约一致性，再检查代码质量：~~ 已落地为 Stage 1 spec compliance 先检查 `AC-*` 和 `D-*`，再进入 code quality。

1. ~~Spec compliance：实现是否覆盖 `AC-*` 和 `D-*`。~~
2. Code quality：复杂度、错误处理、测试、维护性、局部设计。

这能避免 reviewer 只看风格，却漏掉“做错功能”的问题。

### 流程变化

```text
clarify -> spec(+api-designer/sql-style/architecture-designer/cli-developer) -> plan-to-exec -> review
```

## 可吸收点三：计划要能作为执行工单池

### 文章中的价值

> 原文锚点：D-x 改动点“不是流水账，是 P3 的工单池”。

文章中的 D-x 改动点列表把设计拆成 P3 可执行工单，并让实现和 review 都按同一组 ID 对齐。

### loopx 当前承载点

- `plan-to-exec`
- `exec`
- `subagent-exec`
- `review`

### 建议优化

#### `plan-to-exec`

> 状态：`plan-to-exec` 已支持从 source design 保留 `D-*`，并在 task traceability 中记录 `Source AC`、`Design anchors`、`Test cases`。~~`T-*` task ID 体系仍是后续增强项。~~ 已落地为稳定的 plan-local task anchors，并由 `exec`、`subagent-exec`、`review` 保留。

计划中的任务应该包含：

- ~~Task ID：`T-001`~~ 已落地为 `### T-001 / Task 1: ...`
- Source AC：来自需求的 `AC-*`
- ~~Design anchors：来自设计的 `D-*`~~ 已落地
- Target files：预期修改文件或模块
- Implementation notes：关键约束，不重新发明设计
- Verification：具体命令
- ~~Expected evidence：预期看到什么输出~~ 已落地为 `Expected execution evidence`，由 `exec`、`subagent-exec` 和 `review` 消费。
- ~~Review focus：reviewer 需要重点检查什么~~ 已成为 task 必填项，允许 `not_applicable` 但必须有理由

示例：

```text
T-003 Add ledger validation before fix execution
Source AC: AC-002
Design anchors: D-004
Target files:
- src/workflow.mjs
- test/workflow.test.mjs
Implementation notes:
- Do not allow fix execution unless ledger status is ready_for_fix.
- Preserve existing JSON output contract.
Verification:
- node --test test/workflow.test.mjs
Review focus:
- State transition gate cannot be bypassed by CLI options.
```

#### `exec`

> 状态：`exec` 已要求每个 `T-*` 任务完成前记录 `task_anchor`、`source_ac`、`design_anchors`、`test_cases`、`commands_run`、`evidence_summary` 和 `remaining_risk`。

执行时应逐项更新计划状态或内部 task list：

- `pending`
- `in_progress`
- `implemented`
- `verified`
- `reviewed`
- `blocked`

~~完成声明必须带验证证据，不应只说“完成”。~~ 已落地为 task completion evidence。

#### `subagent-exec`

subagent task brief 应只携带该任务需要的上下文：

- 对应 `AC-*`
- ~~对应 `D-*`~~ 已落地
- 目标文件
- 必读 specs
- ~~验证命令~~ 已落地为 `Expected execution evidence` 和 `commands_run`
- review package 路径

避免把完整会话、完整设计或全仓库文档塞给 subagent。

### 流程变化

```text
spec -> plan-to-exec(D/T anchors) -> exec/subagent-exec -> review(D/T/AC compliance)
```

## 可吸收点四：证据先于完成声明

### 文章中的价值

> 原文锚点：把 AI 自述的“我做完了”变成机器能读的证据，这是“证据先于断言”纪律的物理形态。
>
> 原文锚点：如果没有可监测性，AI 跑完一段告诉你“我做完了”，你既无法验证它真的做完了，也无法回放它是怎么做的。

文章强调可追踪、可回溯、可度量。对 loopx 最直接的吸收点是：任何“完成”“通过”“修复”都必须有新鲜证据。

### loopx 当前承载点

- `verify`
- `exec`
- `subagent-exec`
- `review`
- `final-review`
- `finish`

### 建议优化

#### `verify`

继续保持核心铁律：

```text
NO COMPLETION CLAIMS WITHOUT FRESH VERIFICATION EVIDENCE
```

可以进一步要求完成报告记录：

- 命令
- 执行时间
- exit code
- 关键输出摘要
- 失败数或通过数
- 没有运行时的原因

#### `exec` / `subagent-exec`

~~每个任务完成时都应记录：~~ 已落地为 `exec` 和 `subagent-exec` 的任务证据字段。

```text
Task: T-003
Status: verified
Commands run:
- node --test test/workflow.test.mjs
Evidence:
- exit code 0
- 18 tests passed
Remaining risk:
- No integration test covers external installer mode
```

#### `finish`

~~`finish` 不应只处理 git 归宿，也应确认：~~ 已落地为 tests verification、final-review gate、finish audit 和 learning extraction gate。

- ~~是否有 final-review artifact。~~
- ~~是否仍有 blocking/important findings。~~
- ~~是否已经运行最新验证。~~
- ~~是否已经执行 finish audit。~~
- ~~是否处理 memory/spec learning candidates。~~

### 流程变化

```text
implementation -> verify evidence -> review -> final-review -> finish
```

## 可吸收点五：失败必须先诊断再修复

### 文章中的价值

> 原文锚点：AI 跑挂的时候，能从“结果异常”自动收敛到“根因是什么、该怎么修”，而不是丢一句“测试失败”让人手工排查。
>
> 原文锚点：关键纪律是“SOP 写死，不让 Agent 自由发挥”。

文章中的 API 测试失败自愈强调：失败后先收集 trace/log/db/cache 证据，再给出根因和修法。虽然 loopx 不应绑定具体基础设施，但应吸收“先诊断、后修复”的纪律。

### loopx 当前承载点

- `debug`
- `issue`
- `fix`
- `fix-review`

### 建议优化

#### `debug`

~~保持 root cause first，不猜修。可进一步把排查产物结构化：~~ 已落地为 Diagnosis Summary Contract。

- ~~Symptom~~
- ~~Reproduction~~
- ~~Observed evidence~~
- ~~Hypotheses~~
- ~~Ruled-out causes~~
- ~~Root cause~~
- ~~Fix strategy~~
- ~~Regression test~~

#### `issue`

~~issue ledger 应成为 bug 类问题的协议文件。建议包含：~~ 已落地为 `.loopx/issues` ledger、diagnosis summary、fix brief 和 ready gate。

```text
status: investigating | ready_for_fix | blocked | fixed
symptom:
reproduction:
root_cause:
evidence:
fix_brief:
regression_tests:
```

~~`fix` 只能执行 `ready_for_fix` 的 ledger，避免含糊报告直接进入改代码。~~ 已落地。

#### `fix`

~~修复后必须补：~~ 已落地为 regression test plan/exception、verification evidence、local review 和 whole diff review。

- ~~regression test 或说明不可自动化原因。~~
- ~~验证命令。~~
- ~~对 root cause 的闭环说明。~~

### 流程变化

```text
issue -> debug discipline -> ready_for_fix ledger -> fix -> verify -> final-review/finish
```

## 可吸收点六：review 分层，先比对契约再看质量

### 文章中的价值

> 原文锚点：每次 P3 实现一个分组都自动调用 `specworker-code-reviewer`，对照 `design.md` 检查“实现与方案的一致性 + 已规划功能的覆盖度”。
>
> 原文锚点：code-reviewer 不读全文件，优先读 git diff；code-reviewer 也不解决“代码风格”，只看契约。

文章里的 code-reviewer 三档输出把 review 从“看代码好不好”提升为“实现是否符合契约”。这点非常适合 loopx。

### loopx 当前承载点

- `review`
- `final-review`
- `fix-review`

### 建议优化

#### `review`

> 状态：`review` 已要求 formal source 中含 `D-*` 时，Stage 1 spec compliance 必须把 `AC-*` 和 `D-*` 一起检查；未覆盖的 `D-*` 需要 deferred rationale，否则按 spec compliance gap 处理。含 `T-*` 的 formal plan 也会在 findings 或 coverage notes 中保留相关 `T-*`。task verification evidence 已成为 Stage 1 输入，缺失或偏弱证据会作为 review finding。

~~输出建议分为：~~ 已落地为 `Critical` / `Important` / `Minor`，其中 `Minor` 承接低风险 suggestion。

- ~~`Critical`：契约违反、行为错误、兼容性破坏、安全/数据风险、验证缺失。~~
- ~~`Important`：可接受但必须显式记录的偏差、测试缺口、维护风险。~~
- ~~`Suggestion`：局部质量、命名、风格、简化建议。~~ 已由 `Minor` 表达。

Review 顺序：

1. ~~读 plan/spec 的 `AC-*`、`D-*`、`T-*`。~~ 已落地。
2. 看 git diff。
3. 必要时读目标文件上下文。
4. ~~先输出契约一致性问题。~~ 已落地为 Stage 1。
5. ~~再输出代码质量问题。~~ 已落地为 Stage 2。

#### `fix-review`

处理 review feedback 时应一条一条来：

- 接受并修复。
- 提供证据后反驳。
- 降级为已知风险。
- 需要用户决策时停止。

#### `final-review`

最终评审要覆盖：

- ~~requirements coverage~~ 已落地为 Requirements Coverage Matrix
- design compliance
- ~~runtime behavior~~ 已落地为 Runtime Validation
- ~~regression risk~~ 已落地为 Regression Checklist
- ~~test trustworthiness 仍可继续显式化为独立 `Test Trust` 小节~~ 已落地为 `final-review` 的独立 `Test Trust` phase/section。
- deployment/config risk when relevant

### 流程变化

```text
task complete -> review(spec compliance first) -> fix-review? -> final-review
```

## 可吸收点七：测试可信度需要被评审

### 文章中的价值

> 原文锚点：AI 生成测试用例仍可能覆盖不足、断言偏弱、只验证“能跑通”而没有验证“业务真的正确”。
>
> 原文锚点：下一步需要补齐测试用例质量评估、反例生成、覆盖率与业务风险映射，以及“测试本身是否可信”的二次评审机制。

文章指出 AI 生成测试可能只验证“能跑通”，不验证“业务真的正确”。这对 loopx 很重要。

### loopx 当前承载点

- `tdd`
- `review`
- `final-review`
- `requirement-analyzer`

### 建议优化

#### `tdd`

除“先失败再实现”外，还应强调测试质量：

- 断言必须验证业务结果，而不是只验证函数被调用。
- 至少覆盖一个失败路径或边界条件，除非任务确实很小。
- 测试数据要能暴露错误实现。
- 快照测试不能替代行为断言。

#### `review`

reviewer 检查测试时应问：

- 测试是否映射到 `AC-*`？
- 是否看到测试先失败的证据？
- 是否有负向/边界路径？
- 是否可能因为 mock 太宽松而误通过？
- 是否只是 smoke test？

#### `final-review`

~~增加 `Test Trust` 小节：~~ 已落地。

```text
Test Trust: High / Medium / Low
Reason:
- Which ACs are covered
- Which risks are only smoke-tested
- Which behavior still relies on manual confidence
```

### 流程变化

```text
plan-to-exec(test expectations) -> tdd -> review(test quality) -> final-review(test trust)
```

## 可吸收点八：长期知识沉淀，但必须有筛选

### 文章中的价值

> 原文锚点：知识库是 AI 的长期记忆；没有它，每次新需求来 AI 都要从零理解一遍上下文。
>
> 原文锚点：Delta Spec 不直接复制本次 change 的全部文档进 specs，而是只标记新增、修改、删除、重命名，避免知识库膨胀。

文章强调 P6 归档和 knowledge-sync，避免每次新需求都从零开始。loopx 的 `finish` 已经有 finish audit，适合承接这点。

### loopx 当前承载点

- `finish`
- `codebase-spec`
- `docs/loopx/specs/`
- `docs/loopx/memory/`
- `.loopx/memory/`

### 建议优化

#### `finish`

~~finish audit 应继续保持“不是每个任务都自动进长期知识”的纪律。可以更明确地区分：~~ 已落地为 finish audit extraction candidates、accepted/rejected candidates、local/shared memory 和 spec candidates。

- ~~写入 `docs/loopx/specs/`：稳定、共享、未来规划和 review 必须依赖的规则。~~
- ~~写入 `docs/loopx/memory/`：有复用价值，但还不是长期契约。~~
- ~~写入 `.loopx/memory/`：本机有用、短期或环境相关。~~
- ~~不沉淀：一次性实现细节、低信号过程记录、未验证猜测。~~

#### delta-spec 候选

~~可以借鉴文章的 delta-spec，但先作为候选输出，不自动改 specs：~~ 已落地为 `finish-audit` 的 `audit.extraction_candidates`、人工接受/拒绝和 repo-visible spec candidates；~~`ADDED/MODIFIED/REMOVED/RENAMED` 命名可后续细化~~ 已落地为 `Spec Delta Candidates` 分类。

```text
Spec Delta Candidates
- ADDED: New CLI output invariant for `loopx status --json`
- MODIFIED: Finish audit now rejects unreviewed extraction candidates
- REMOVED: none
- RENAMED: none
```

用户或 maintainer 决定是否写入 `docs/loopx/specs/`。

#### `codebase-spec`

针对老项目初始化，可增加一个“repo specs 初始化”模式：

1. 从代码、测试、配置、文档提取 observed spec。
2. 标注 inferred 和 unknown。
3. 输出人工确认问题。
4. 经确认后再进入 `docs/loopx/specs/`。

### 流程变化

```text
final-review -> finish-audit -> memory/spec candidates -> user/maintainer confirmation -> finish-record
```

## 可吸收点九：上下文注入要按需、分层、可控

### 文章中的价值

> 原文锚点：任何检索必须 `index.md -> 相关 spec` 两跳命中，明令禁止 `**/*.md`。
>
> 原文锚点：SubAgent 并非节省上下文的银弹，而是另一份独立计费的开销；解法是优先读 git diff + 关键片段。

文章强调 index 两级查找、禁止全局通配、subagent 优先读 diff。这直接对应 loopx 的 context discipline。

### loopx 当前承载点

- `clarify`
- `spec`
- `plan-to-exec`
- `subagent-exec`
- `review`
- `final-review`
- `docs/loopx/specs/`
- `.loopx/memory/`

### 建议优化

#### 所有核心 workflow skills

统一上下文规则：

1. 当前用户指令最高优先级。
2. source document 次之。
3. `docs/loopx/specs/` 是长期约束。
4. memory 是建议性上下文。
5. 不默认全量读取 `docs/loopx/specs/`。
6. 优先读 index 或文件名相关 spec。

#### `subagent-exec`

subagent task brief 应最小化：

- 必须读什么。
- 禁止读什么。
- 哪些上下文只是参考。
- 当前任务的边界。
- 完成后写入哪个 report。

#### `review`

reviewer 默认 diff-first：

1. 读 requirements/spec/plan 摘要。
2. 读 git diff。
3. 只在 diff 无法判断时读完整文件或调用者。

### 流程变化

```text
index/spec selection -> focused task brief -> diff-first review -> explicit escalation if context insufficient
```

## 可吸收点十：本地 metrics 可先于平台上报

### 文章中的价值

> 原文锚点：`.phase-metrics.jsonl` 每个阶段一行 JSON，记录 phase、action、timestamp、duration、token、文件改动等阶段级运行明细。
>
> 原文锚点：让“这套 AI 体系到底好不好用、贵不贵”从感觉变成数字，能做横向对比。

文章使用 `.phase-metrics.jsonl` 和 Report API 做可度量。loopx 可先做本地 metrics，不急着中心化。

### loopx 当前承载点

- CLI
- hooks
- `exec`
- `subagent-exec`
- `finish`

### 建议优化

第一阶段可以考虑本地文件：

```text
.loopx/metrics/events.jsonl
```

记录：

- timestamp
- skill
- workflow slug
- phase
- action
- duration_ms
- command
- exit_code
- files_changed
- tests_passed / tests_failed
- retry_count

不建议一开始记录或上报敏感内容、完整 prompt、完整输出。metrics 的第一目标是发现流程瓶颈，而不是做审计平台。

### 流程变化

```text
skill start/end -> local metrics jsonl -> finish summary can reference high-level metrics
```

## 可吸收点十一：确定性检查脚本化

### 文章中的价值

> 原文锚点：对于确定性强、可重复执行的流程，沉淀为脚本：`skill.md`、`scripts/run_test.js`。
>
> 原文锚点：确定的事用脚本，不确定的事用 AI。

文章强调确定性过程用脚本实现。loopx 已经有 `verify-skills.mjs`，可以延伸到 workflow artifacts。

### loopx 当前承载点

- `scripts/verify-skills.mjs`
- CLI
- tests
- hooks

### 建议优化

可新增或扩展确定性检查：

- skill metadata/schema 校验：已有，继续保持。
- plan artifact 校验：是否包含 source、tasks、verification、handoff。
- final-review artifact 校验：是否包含 readiness、blocking issues、test evidence。
- finish audit 校验：是否处理 extraction candidates。
- docs/specs index 校验：是否存在坏链接或重复 ID。

这些检查应由脚本负责，而不是让 agent 自己判断格式是否合格。

### 流程变化

```text
agent writes artifact -> script validates artifact -> failed checks route back to the owning skill
```

## 可吸收点十二：老项目接入需要专门流程

### 文章中的价值

> 原文锚点：老项目的历史积淀往往是“水下的冰山”，隐性约束散落在老同学脑袋里，过期文档与现网行为对不上。
>
> 原文锚点：存量初始化不能完全靠 AI，必须由熟悉业务的人确认、剔除过时内容、补关键约束。

文章指出老项目的历史约束、过期文档、隐性规则是 AI Native 的主要阻力。loopx 可以用 `codebase-spec` 承接。

### loopx 当前承载点

- `codebase-spec`
- `clarify`
- `spec`
- `docs/loopx/specs/`

### 建议优化

新增推荐流程：

```text
codebase-spec -> human confirmation -> docs/loopx/specs initialization -> clarify/spec for new work
```

~~`codebase-spec` 输出应区分：~~ 已落地为 evidence labels；完整 repo specs 初始化流程仍待增强。

- ~~`Observed`：代码/测试/配置明确存在。~~
- ~~`Inferred`：多处证据推断，但不是明文。~~
- ~~`Unknown`：需要业务确认。~~
- ~~`Conflict`：代码、文档、测试互相矛盾。~~ 当前 skill 使用 `Contradiction` 标签。

只有人工确认后的稳定规则才进入 `docs/loopx/specs/`。

## 按 skill 汇总的优化建议

| Skill | 可吸收点 | 具体优化 |
|---|---|---|
| `clarify` | 需求口径、AC 同源 | ~~输出 `AC-*`、非目标、决策、开放问题；需求不清时不进入 plan；必要时同步产出需求阶段测试用例。~~ 已落地为 intake package 三件套。 |
| `requirement-analyzer` | 需求可测性和 traceability | ~~输出缺口、traceability 和 readiness。~~ 已落地为 gap checks、traceability matrix、readiness recommendation 和 evidence-backed P0/P1/P2 issues；source claim 到 AC 的精细映射可继续按深度增强。 |
| 未来 `acceptance-testcase-generator` | 需求阶段验收/集成测试设计 | 基于已确认 `AC-*` 生成 `test-cases.md`，不重新解释需求，不绑定内部实现。 |
| `spec` | 设计即契约 | ~~增加结构化 contract blocks 和 `D-*` anchors。~~ 已落地为 `D-*` anchors 和分类型 contract blocks。 |
| `api-designer` | API 契约 | 为 REST/GraphQL/OpenAPI 变更补全请求、响应、错误、版本和兼容性。 |
| `sql-style` | 数据契约 | 强化 schema、migration、rollback、兼容和性能验证要求。 |
| `architecture-designer` | 系统边界和 NFR | 在 spec/final-review 中暴露 failure modes、operability、cost、scalability。 |
| `cli-developer` | CLI 作为产品契约 | 明确 stdout/stderr、exit code、JSON 输出和兼容性。 |
| `plan-to-exec` | 工单池和追踪 | ~~每个 task 绑定 `AC-*`、`D-*`、目标文件、验证命令和 review focus。~~ 已增加 `D-*` traceability；~~`T-*` task ID 仍可增强。~~ 已落地为 `T-* / Task N` heading、task anchor coverage 和 review focus。 |
| `tdd` | 测试同源和可信度 | 测试映射 AC 仍可增强；~~要求先失败；检查断言质量。~~ 已落地为 red/green/refactor、mandatory red verification 和 good/bad test guidance。 |
| `debug` | 失败先诊断 | ~~结构化记录 symptom、repro、evidence、hypotheses、root cause。~~ 已落地为 Diagnosis Summary Contract。 |
| `issue` | bug 类 ledger | ~~ledger 必须有复现、证据、根因和 fix brief 后才 ready。~~ 已落地为 `.loopx/issues` ledger、diagnosis summary、fix brief 和 `ready_for_fix` gate。 |
| `fix` | 从 ledger 修复 | ~~只执行 ready ledger；修后补 regression test 和验证证据。~~ 已落地为 ready ledger gate、regression test plan/exception、verification evidence、local review 和 whole diff review。 |
| `exec` | 证据链执行 | ~~每个任务记录状态、命令、exit code、剩余风险。~~ 已落地为 task completion evidence。 |
| `subagent-exec` | 最小上下文执行 | ~~每个 subagent 只拿必要 `AC/D/T`、目标文件、验证命令和 report path。~~ 已落地为 task brief、review package、`ANCHOR_CONTEXT`、`SURFACE_CHANGE_CONTEXT`、`Expected execution evidence` 和 report path 约束。 |
| `review` | 契约优先 review | ~~先 spec compliance，再 code quality；~~ 已增加 `AC-*`/`D-*`/`T-*` 和 task evidence Stage 1 检查；~~findings 分级可继续按 review 契约演进。~~ 已落地为 `Critical` / `Important` / `Minor`。 |
| `fix-review` | 反馈闭环 | ~~一次处理一条反馈；修复、反驳或升级都要有证据。~~ 已落地为 read/understand/verify/evaluate/respond/implement pattern、one-item-at-a-time fixes 和 technical pushback rules。 |
| `final-review` | 全功能风险评审 | ~~输出 AC 覆盖矩阵、runtime/integration risk。~~ 已落地为 Requirements Coverage Matrix、Runtime Validation、Regression Checklist、Support Lens Risk Scan 和 `Test Trust`。 |
| `finish` | 归档和知识沉淀 | ~~强化 finish audit、memory/spec candidates、delta-spec 候选和人工确认。~~ 已落地为 finish audit、extraction candidates、accepted/rejected candidates、local/shared memory、spec candidates 和 `ADDED/MODIFIED/REMOVED/RENAMED` delta labels。 |
| `codebase-spec` | 老项目初始化 | ~~从现有代码提 observed spec，列 unknown/conflict 给人工确认。~~ 已落地为 `Observed` / `Inferred` / `Unknown` / `Contradiction` evidence labels；repo specs 初始化模式仍待增强。 |
| `verify` | 完成前证据 | ~~任何完成/修复/通过声明前都要求新鲜命令证据。~~ 已落地为 fresh verification evidence 铁律。 |
| `lancet` | 防止过度平台化 | 在实现和 review 中提醒优先复用、删除、脚本化，不扩张流程。 |

## 推荐流程形态

### 普通 feature

```text
clarify
  -> intake package(requirements.md + test-cases.md)
  -> spec? (+ api-designer/sql-style/architecture-designer/cli-developer)
  -> plan-to-exec
  -> exec/subagent-exec (+ tdd/debug/verify as needed)
  -> review
  -> fix-review?
  -> final-review
  -> finish
```

关键增强：

- ~~`clarify` 产出 `AC-*`。~~ 已落地到 `requirements.md`。
- ~~`test-cases` 在需求阶段产出验收/集成测试设计，并复用同一组 `AC-*`。~~ 已落地到 `test-cases.md`。
- ~~`spec` 产出 `D-*`。~~ 已落地。
- ~~`plan-to-exec` 产出 `T-*`，并绑定 `AC-*` 和 `D-*`。~~ 已支持 intake package 输入、`test-cases.md` 覆盖要求、`D-*` traceability 和稳定 `T-*` task anchors。
- `review` 已按 `AC/D/T` 和 task evidence 检查覆盖；`final-review` 已有 AC coverage matrix、runtime validation、regression checklist 和 `Test Trust`，full `AC -> D -> T -> verification` hard matrix 仍不在当前 slice。
- ~~`finish` 判断是否沉淀 memory/spec。~~ 已落地为 audit-first learning extraction、memory/spec candidates 和 accepted/rejected candidates。

### Bug 类问题

```text
issue
  -> debug discipline
  -> ready_for_fix ledger
  -> fix
  -> verify
  -> final-review?
  -> finish
```

关键增强：

- ~~不从含糊症状直接改代码。~~ 已落地为 `issue` diagnosis gate 和 `fix` ready ledger gate。
- ~~ledger 必须记录复现、证据、根因和 regression test。~~ 已落地。
- ~~fix 完成后沉淀可复用 pitfall 或 invariant。~~ 已由 `finish` learning extraction 承接。

### 老项目初始化

```text
codebase-spec
  -> human confirmation
  -> docs/loopx/specs initialization
  -> normal loopx workflow
```

关键增强：

- 代码是事实来源，旧文档只能作为证据之一。
- 人工确认 unknown/conflict。
- 只把稳定规则写入 specs。

## 优先级建议

### P0：低成本、高收益，优先做

1. ~~`clarify` 输出稳定 `AC-*`。~~ 已落地。
2. ~~`clarify` 或 `spec` 同步产出需求阶段 `test-cases.md`，并复用同一组 `AC-*`。~~ 已落地。
3. ~~`spec` 输出稳定 `D-*` contract anchors。~~ 已落地。
4. ~~`plan-to-exec` 任务绑定 `AC-*`、`D-*`、测试用例和验证命令。~~ 已支持读取 `requirements.md`/`test-cases.md`、`D-*` traceability、稳定 `T-*` task anchors 和 `Review focus`。
5. ~~`review` 明确 spec compliance first。~~ 已落地，并覆盖 `AC-*`/`D-*`。
6. ~~`final-review` 输出 AC coverage~~ 已落地为 Requirements Coverage Matrix；~~test trust 仍可显式化为独立小节~~ 已落地为 `Test Trust`。
7. ~~`finish` 更清楚地区分 spec、shared memory、local memory 和 no candidate。~~ 已落地。

这些主要是 skill 文档和产物格式优化，不需要引入重平台能力。

### P1：需要设计，但值得做

1. workflow artifact validator：校验 plan、review、finish audit 的必填结构。
2. 本地 metrics jsonl：记录 skill/phase/action/duration/exit code。
3. ~~delta-spec candidates：finish audit 生成候选。~~ 已落地为 extraction/spec candidates 和 `ADDED/MODIFIED/REMOVED/RENAMED` 命名结构。
4. `codebase-spec` 增加 repo specs 初始化模式。
5. 新增 `acceptance-testcase-generator` support skill。
6. ~~subagent task brief/review package 标准化。~~ 已落地。

这些会触及 CLI、scripts 或多个 skill 的协同，适合单独设计。

### P2：适合作为插件或专项能力

1. 部署流程 skill。
2. 前端 UI 像素校准 skill。
3. 线上告警诊断/修复 skill。
4. 中心化 metrics/report API。
5. 固定评分门禁或模型评估器。

这些能力价值很高，但强依赖组织基础设施，不适合作为 loopx 核心默认路径。

## 不建议直接吸收的内容

| 内容 | 不建议原因 | loopx 替代方式 |
|---|---|---|
| 完整 P1-P6 企业流程 | 过重，且绑定组织工具链 | 保留 loopx golden path，强化每个 skill 的契约和证据。 |
| 统一 95 分门禁 | 没有反馈校准时容易伪精确 | 使用 blocking/important/suggestion/ready 判定。 |
| TAPD/CLS/K8s/MySQL/Redis 固定 SOP | 强绑定企业内部环境 | 通过插件或项目 specs 注入项目自己的 SOP。 |
| 自动部署作为默认流程 | 权限和风险高 | 作为可选 deploy skill 或项目专用 plugin。 |
| UI 95% 像素校准进核心 | 领域过窄 | 作为前端专项 skill/plugin。 |
| 线上告警自动修复进核心 | 安全、权限、责任边界复杂 | 作为 ops plugin，且默认人工确认高风险修复。 |

## 可形成的后续工作项

如果要把本文落成 loopx 改造，可以拆成这些独立工作：

1. ~~更新 `clarify`：增加 AC 输出规范和 route gate。~~ 已落地为 intake package。
2. ~~更新 `clarify` 或 `spec`：增加需求阶段 `test-cases.md` 产物，并要求与 `AC-*` 同源。~~ 已落地为 intake package，并同步更新 `spec`/`plan-to-exec` 消费规则。
3. ~~更新 `spec`：增加 contract blocks 与 `D-*` anchors。~~ 已落地。
4. ~~更新 `plan-to-exec`：增加 `AC/D/T` traceability、测试用例引用和验证字段。~~ 已落地为 intake package 消费、`D-*` traceability、`T-*` task anchors、`Review focus`、`Expected execution evidence` 和 `task-brief` 兼容。
5. ~~更新 `review`：明确 spec compliance first 和三档 findings。~~ spec compliance first 已落地并覆盖 `AC/D/T` 和 task evidence；findings 分级继续按 review 契约演进。
6. ~~更新 `final-review`：增加 AC coverage matrix 和 test trust。~~ 已落地。
7. ~~更新 `finish`：增强 learning extraction 说明和 spec candidate 结构，并细化 delta-spec `ADDED/MODIFIED/REMOVED/RENAMED` 候选命名。~~ 已落地。
8. 更新 `codebase-spec`：~~增加 evidence labels~~ 已落地；老项目 specs 初始化模式仍待增强。
9. 设计 artifact validator：先校验 plan/review/final-review/finish audit 的结构。
10. 设计本地 metrics：先写 `.loopx/metrics/events.jsonl`，不做中心化上报。
11. 评估是否需要新增 `acceptance-testcase-generator`、deploy、ui-calibration、ops-diagnose 等插件型 skills。

## 结论

loopx 应该吸收 Harness Engineering 的确定性骨架，而不是复制某个企业平台的完整形态。

最值得强化的主线是：

```text
需求 AC -> 设计契约 D -> 执行任务 T -> 验证证据 -> 评审覆盖 -> finish 沉淀
```

这条链路一旦明确，loopx 的每个 skill 都能知道自己在整个 Harness 中承担什么责任，也能让 Codex/Claude 风格的 coding agent 更稳定地跨阶段完成真实工程任务。
