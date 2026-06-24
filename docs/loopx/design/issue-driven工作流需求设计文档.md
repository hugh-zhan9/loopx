# issue-driven 工作流设计文档

## 一、修订历史

| 版本号 | 修订内容 | 修订时间 | 修订人 |
|---|---|---|---|
| V1.0.0 | 新建初稿，定义与 feature-driven 并列的 issue-driven bug 修复工作流 | 2026-06-23 | zhangyukun |
| V1.0.1 | 调整 `fix` 并行模型，允许并行直接修改时使用隔离 git worktree | 2026-06-23 | zhangyukun |

## 二、需求信息

### 2.1 需求背景

- 背景：loopx v1 当前主链是 feature-driven：`clarify -> spec? -> plan-to-exec -> exec/subagent-exec -> review/final-review -> fix-review? -> finish`。这条链路适合新需求、设计明确后的实现和计划驱动开发，但 bug 类 issue 的工作方式不同：先要确认问题、复现或收集证据、定位 root cause，再确定修复边界。直接套用 feature-driven 容易把 bug 修复伪装成需求施工。
- 需求目的：新增一条 issue-driven 主链，专门处理 bug-class issues，使 bug report 能经过诊断、fix brief、受控执行、review、fix-review、verify 和 finish 收口。
- 目标用户/使用方：使用 loopx 技能的 Codex/Claude 等 agent、维护 bug backlog 的开发者、希望把 bug 修复和新需求开发分开的用户。
- 需求链接：无外部链接。来源为当前会话对 `ref/goal-workflow`、`loop-it`、现有 `debug/review/fix-review/subagent-exec` 的对比讨论。
- 关联原始材料：
  - `.loopx/intake/clarify-issue-driven-workflow-20260623-171518.md`
  - `docs/loopx/design/loopx-skill-suite-v1-design.md`
  - `docs/loopx/skills.md`
  - `docs/loopx/specs/installation.md`
  - `skills/debug/SKILL.md`
  - `skills/review/SKILL.md`
  - `skills/fix-review/SKILL.md`
  - `skills/verify/SKILL.md`
  - `skills/finish/SKILL.md`
  - `ref/goal-workflow/skills/loop-it/SKILL.md`

### 2.2 需求范围

- 本期范围：
  - 新增 bundled core workflow skill：`issue`。
  - 新增 bundled core workflow skill：`fix`。
  - 增强 `debug` skill，增加可被 `issue` 消费的结构化 diagnosis summary contract。
  - 将产品文档更新为两条并列主链：feature-driven workflow 与 issue-driven workflow。
  - 定义 `.loopx/issues/issue-<slug>-<timestamp>.md` ledger 格式，用于诊断、fix brief、执行、review、验证和 closeout。
  - `issue` 负责 bug report intake、triage、debug-discipline diagnosis、fix brief、response draft 和 handoff，不做持久修复。
  - `fix` 负责消费 ready ledger，执行修复、默认写 regression test 或记录例外、验证、局部 review、整体 review、处理 Critical/Important review findings、更新 ledger，并交给 `finish` 收口。
  - `fix` 第一版支持多个无关联 bug 的 subagent 并行执行；并行直接修改代码时必须使用隔离 git worktree。
  - 更新根技能、plugin mirror、安装发现、公开文档、治理测试和卸载说明。
- 非目标：
  - 不替代 feature-driven workflow。
  - 不处理普通 enhancement 或 feature request；这些 issue 必须路由回 feature-driven。
  - 不调用 `gh` 拉取 GitHub issue，不要求 GitHub CLI。
  - 不自动评论、关闭、创建 PR、merge GitHub issue。
  - 不复用 `exec` 或 `subagent-exec` 作为 bug fix 执行器。
  - 不要求所有修复都使用 git worktree；串行修复可直接在主工作区执行。
  - 不允许 fix subagent commit、push 或 close issue。
  - 不实现全局 open issue 批量队列或 `.loop-state.json` 式全局状态文件。
- 决策边界：
  - `issue` 是 issue-driven workflow 入口。
  - `fix` 是 issue-driven execution skill。
  - `debug` 是 root cause investigation engine；`issue` 内部必须执行 debug discipline，但用户不需要显式再运行 `$debug`。
  - `finish` 仍是最终 commit/PR/merge/keep/discard 终端步骤。
  - `review` 和 `fix-review` 的质量规则被 `fix` 复用，不复制成另一套 review 语义。
- 依赖方：
  - 技能安装发现：`src/install-discovery.mjs` 中的 bundled skill 集。
  - 根技能目录：`skills/issue/`、`skills/fix/`、`skills/debug/`。
  - 插件镜像：`plugins/loopx/skills/`。
  - 技能文档：`docs/loopx/skills.md`、`docs/loopx/skills.zh-CN.md`。
  - 安装/卸载文档：`docs/loopx/specs/installation.md`。
  - 治理测试：skill mirror、frontmatter、bundled surface、文档一致性相关测试。
- 约束条件：
  - `issue` 接受粘贴 bug report、本地 Markdown 文件、测试/构建失败输出、用户手写复现说明。
  - `issue` 不强制 clean worktree，但必须记录 dirty baseline，不能回滚用户既有变更。
  - `issue` 可以做临时诊断修改，但必须回滚，或明确记录为 diagnostic patch 交给 `fix` 接管。
  - `fix` 开始前必须 clean worktree，除目标 `.loopx/issues/` ledger 变更外不允许 unrelated dirty diff。
  - `fix` 只接受 `status: ready_for_fix` 的 ledger。
  - `fix` 并行执行必须依赖 `expected_touched_files` 和 `parallel_safe`，并在执行前做轻量 scope validation。

### 2.3 可行性分析

- 业务可行性：bug 修复与新需求开发的认知路径不同。新增 issue-driven workflow 能让用户用 `$issue` 进入 bug 诊断，用 `$fix` 执行修复，降低把 bug report 错误转成 feature plan 的概率。
- 技术可行性：loopx 已是 skill-first 产品，新增技能和增强技能文档即可形成第一版；`.loopx/` 已用于本地 runtime/scratch 状态，适合保存 issue ledger。
- 团队接受能力：沿用现有 `debug/review/fix-review/verify/finish` 纪律，不新增重型 runtime 状态机；新增的两个入口技能能降低使用成本。
- 时间成本：中到高。主要工作在 skill 设计、文档同步、plugin mirror、bundled install set、治理测试，以及并行 subagent scope guard 的文档合同。
- 资源成本：本地 Markdown ledger 和 subagent report 文件，无外部服务依赖。
- 替代方案：
  - 增强 `debug` 成完整 bug workflow：安装面少，但会让 `debug` 从诊断技能膨胀为端到端修复技能，职责不清。
  - 复用 `exec/subagent-exec`：执行纪律成熟，但它们是 plan-driven，不适合 symptom/evidence/root-cause 驱动。
  - 直接搬 `loop-it`：产品闭环强，但它是 GitHub issue 队列和批量 ship 流程，与本需求的通用 bug report 入口不匹配。
  - 只写文档不加 bundled skill：风险低，但用户无法通过安装获得新主链。
- 关键风险：
  - 并行 subagent 直接修改主工作区会导致工作区污染；必须使用隔离 git worktree，或让 subagent 只产出 patch/report。
  - `expected_touched_files` 预测错误会导致并行安全判断失效。
  - `issue` 临时诊断修改在 dirty worktree 下容易和用户既有变更混淆。
  - `issue-driven` 命名可能让用户误以为 enhancement issue 也能走该流程，文档必须强调 bug-class boundary。

## 三、概要设计

### 3.1 方案总述

- 设计目标：
  - 将 loopx 产品主链扩展为 feature-driven 和 issue-driven 两条并列 workflow。
  - issue-driven 只处理 bug-class issues：bug、regression、failing test、build failure、unexpected behavior。
  - 所有 bug 修复必须先诊断，再形成 fix brief，再执行。
  - 每个 issue 有一个可恢复、可审计的 `.loopx/issues/` ledger。
  - 多个无关联 bug 可以通过 subagent 并行执行，但必须有严格 scope guard。
- 总体思路：
  - `issue` 创建或更新 ledger，执行 debug discipline，产出 diagnosis summary、fix brief、response draft，并根据状态分流 handoff。
  - `fix` 读取 ready ledger，做 preflight、scope validation、调度串行或并行执行、review、fix-review、verify，并更新同一个 ledger。
  - `debug` 增加结构化 diagnosis summary contract。
  - `review/fix-review/verify/finish` 作为现有质量与收尾能力被 `fix` 复用。
- 核心模块：
  - `skills/issue/SKILL.md`
  - `skills/fix/SKILL.md`
  - `skills/debug/SKILL.md`
  - `plugins/loopx/skills/{issue,fix,debug}/`
  - `.loopx/issues/` ledger 和 reports
  - 安装发现、文档和治理测试
- 主要难点：
  - 在不使用 worktree 的情况下定义可执行的并行安全边界。
  - 保持 `issue` 不修代码但又允许足够的诊断能力。
  - 让 `fix` 内部复用 review/fix-review 契约而不复制或发散质量标准。
- 技术指标：
  - `issue` ledger 必须含 phase、status、diagnosis summary、fix brief、response draft、evidence log。
  - `fix` 必须拒绝非 ready ledger。
  - 并行执行前必须确认 expected touched files/surfaces 不重叠。
  - 每个代码修改必须有 local review 和 whole diff review。

### 3.2 整体架构设计

- 业务模式：skill-first workflow。`issue` 和 `fix` 是 core workflow skills；`debug/review/fix-review/verify/finish` 作为既有技能被复用或增强。
- 系统边界：
  - repo-tracked 文档和技能定义在 `skills/`、`plugins/loopx/skills/`、`docs/loopx/`。
  - runtime/scratch issue ledger 在 `.loopx/issues/`，默认不进 git。
  - `finish` 继续负责最终 commit/PR/merge/keep/discard，不被 `fix` 取代。
- 上下游系统：
  - 上游：bug report、测试失败输出、本地 issue 文件、用户复现说明、代码库证据。
  - 中游：`issue` ledger、debug diagnosis summary、fix brief、subagent reports、review findings。
  - 下游：verification evidence、response draft、finish handoff。
- 应用架构：
  - 新增 `issue` 和 `fix` skill 文档；同步 plugin mirror。
  - 增强 `debug` skill 文档，增加 diagnosis summary contract。
  - 更新 `docs/loopx/skills*.md` 的 mental model、routing rules、examples。
  - 更新 bundled install set 和 governance tests。
- 技术架构：
  - 不新增必须的 CLI runtime command。
  - 以 Markdown ledger 作为人类可读状态合同。
  - 多 bug subagent 执行通过 file handoff 限制上下文：每个 subagent 只收到自己的 ledger、allowed files/surfaces 和 report path。
- 数据流转：
  - `$issue <bug report>` -> `.loopx/issues/issue-<slug>-<timestamp>.md`
  - ledger `status: ready_for_fix` -> `$fix .loopx/issues/<file>.md`
  - `$fix` 更新同一个 ledger，写 execution/review/verification/closeout sections
  - `$fix` 最终输出 `$finish` handoff

### 3.3 核心流程设计

| 流程 | 触发条件 | 参与系统/模块 | 主流程 | 异常/补偿 | 输出 |
|---|---|---|---|---|---|
| issue intake 与 triage | 用户运行 `$issue` 并提供 bug report、文件或失败输出 | `issue`、代码库、`.loopx/issues/` | 读取输入，判断是否 bug-class，创建 ledger，记录 source、dirty baseline、classification | 非 bug-class 则输出 `feature_request/not_a_bug/needs_info` 等状态和 response draft | issue ledger |
| diagnosis | triage 判断为 bug-class | `issue`、`debug` contract、测试/构建命令 | 按 debug discipline 复现、收集证据、验证假设，输出 diagnosis summary | 无法复现时记录 limitation；可进入 defensive fix，但不得声称 root cause confirmed | diagnosis summary |
| fix brief | diagnosis 得出需要修复 | `issue` | 写修复策略、expected touched files/surfaces、regression test plan、risk triggers、parallel safety | root cause unknown、防御性修复、public surface 影响等标记风险；必要时 handoff 前提示确认 | `status: ready_for_fix` ledger |
| fix execution | 用户运行 `$fix <ledger...>` | `fix`、fix subagents、测试命令 | preflight clean worktree，验证 ledger ready，判断并行/串行，执行测试与修复，写 reports | 需要越界修改时暂停并更新 brief；并行不安全时降级串行；高风险时确认 | updated ledger |
| review and fix-review | 每个 bug 修复完成后以及整体 diff 完成后 | `fix`、`review` contract、`fix-review` contract | 每 bug local review，处理 Critical/Important findings；最后 whole diff review，再处理 findings | reviewer 建议不正确时按 fix-review 规则 evidence-based pushback；修复后重跑测试和 review | review outcomes |
| verify and finish handoff | review clean 或 accepted findings 处理完 | `fix`、`verify`、`finish` | 跑最终验证，更新 response/closeout draft，输出 `$finish` | 验证失败则标 failed/blocked，不进入 finish handoff | complete ledger 和 finish handoff |

### 3.4 功能模块

| 模块 | 职责 | 关键功能 | 依赖 | 备注 |
|---|---|---|---|---|
| `issue` skill | issue-driven 入口和诊断编排 | intake、triage、debug discipline、diagnosis summary、fix brief、response draft、handoff routing | `debug` contract、`.loopx/issues/` | 不做 durable fix |
| `fix` skill | bug fix 执行器 | ready ledger preflight、scope validation、串行/并行调度、regression test、implementation、review、fix-review、verify、finish handoff | `review`、`fix-review`、`verify`、`finish` contracts | 不复用 `exec/subagent-exec` |
| `debug` skill | root cause investigation engine | 新增 diagnosis summary schema，保持 no-fix-without-investigation 纪律 | 现有 debug 流程 | 可独立使用，也可被 `issue` 内部遵循 |
| `.loopx/issues/` | issue ledger 存储 | 每 bug 一个 Markdown ledger，reports 子目录可存 subagent reports | `.loopx/` gitignored | 默认不进 git |
| docs and install surface | 产品发现与治理 | 更新 docs、bundled skill set、plugin mirror、uninstall list、tests | `src/install-discovery.mjs`、tests | 保持 v1 skill suite 一致 |

### 3.5 新增/调整功能说明

- 新增 `skills/issue/SKILL.md`：
  - frontmatter description 明确 bug-class issue workflow。
  - 入口支持 pasted report、local file、failing output。
  - 不支持 `gh` fetch。
  - 输出 `.loopx/issues/issue-<slug>-<timestamp>.md`。
  - handoff 根据 ledger status 分流。
- 新增 `skills/fix/SKILL.md`：
  - 输入为一个或多个 ready issue ledgers。
  - preflight 要求 clean worktree，允许目标 ledgers dirty。
  - 支持多 bug subagent 并行；直接改代码时必须使用隔离 git worktree，未使用 worktree 的并行 subagent 只能产出 patch/report。
  - 内部执行 local review、whole diff review、fix-review 和 verification。
- 增强 `skills/debug/SKILL.md`：
  - 增加 diagnosis summary contract。
  - 明确 `issue` diagnosis phase 必须遵守 debug discipline。
- 更新产品文档：
  - mental model 改为 core workflows + support lenses。
  - feature-driven 和 issue-driven 并列。
  - 明确 issue-driven 不处理 feature/enhancement issue。

## 四、详细设计

### 4.1 `issue` skill 详细设计

#### 4.1.1 需求内容

- 入口：`$issue <bug report | local file | failing output>`。
- 操作人/调用方：用户或 agent。
- 前置条件：用户提供 bug report 内容或文件路径；不要求 clean worktree。
- 输出结果：`.loopx/issues/issue-<slug>-<timestamp>.md` ledger；根据状态输出 `$fix <ledger>` 或其他 response/handoff。

#### 4.1.2 方案设计

- 核心逻辑：
  - 读取 bug report 来源。
  - 记录 git worktree baseline：clean/dirty、dirty files；不回滚用户已有变更。
  - triage 是否属于 bug-class：bug、regression、failing test、build failure、unexpected behavior。
  - 如果不是 bug-class，输出对应状态：`feature_request`、`not_a_bug`、`duplicate`、`needs_info`、`already_fixed`、`blocked`。
  - 对 bug-class 输入执行 debug discipline：复现、证据收集、最近变更检查、假设验证、root cause 状态判断。
  - 写 diagnosis summary。
  - 写 fix brief：fix strategy、expected touched files/surfaces、parallel safety、regression test plan 或 exception、risk triggers、verification commands。
  - 写 response draft。
- 状态流转：
  - `phase`: `intake -> triage -> diagnosis -> fix_brief -> closeout`
  - `status`: `pending -> in_progress -> ready_for_fix | needs_info | not_a_bug | duplicate | already_fixed | feature_request | blocked`
- 数据变更：
  - 创建或更新 `.loopx/issues/issue-<slug>-<timestamp>.md`。
  - 允许临时诊断修改，但必须回滚或标记为 diagnostic patch。
  - 不持久修改产品代码作为正式修复。
- 计算公式：
  - slug 从 bug title、failing test name 或用户描述提取，kebab-case。
  - timestamp 使用本地或 UTC 时间，确保文件名唯一。
- 幂等设计：
  - 默认每次 `$issue` 创建新 ledger。
  - 如果用户传入已有 ledger，允许继续诊断并追加 evidence log。
- 权限/越权控制：
  - 不调用外部 issue tracker API。
  - 不关闭、不评论、不创建 PR。
- 异常处理：
  - 输入太模糊时标记 `needs_info`，列出所需复现、日志、环境、版本信息。
  - 无法复现但有防御性修复依据时，`root_cause_status: unknown|likely`，`fix_mode: defensive_fix`，并触发风险确认。
- 补偿/重试：
  - 临时 diagnostic patch 必须在 ledger 中记录，并在完成诊断前清理或移交。
- 日志与审计：
  - Evidence log append-only，记录命令、结果、文件证据、用户重要表述。

#### 4.1.3 流程步骤

1. 读取用户输入或本地文件。
2. 检查并记录 worktree baseline。
3. 创建 ledger。
4. triage 输入类型。
5. 按 debug contract 执行 diagnosis。
6. 生成 diagnosis summary。
7. 生成 fix brief 或非修复出口。
8. 写 response draft。
9. 根据状态输出 handoff。

#### 4.1.4 边界条件

| 场景 | 处理方式 | 用户/调用方感知 | 监控/告警 |
|---|---|---|---|
| 输入是 feature request | 标记 `feature_request`，建议 `$clarify` 进入 feature-driven | 不生成 `$fix` handoff | ledger status |
| 无法复现 | 可生成 defensive fix brief，但必须记录 limitation 和 risk trigger | 用户看到 root cause 未确认 | diagnosis summary |
| 输入缺少关键信息 | 标记 `needs_info`，列出缺失项 | 输出可回复 reporter 的问题 | response draft |
| 临时诊断修改未清理 | 不得结束为 ready，必须清理或记录 diagnostic patch | 用户看到阻塞说明 | evidence log |

### 4.2 `fix` skill 详细设计

#### 4.2.1 需求内容

- 入口：`$fix .loopx/issues/<ledger>.md [more ledgers...]`。
- 操作人/调用方：用户或 agent。
- 前置条件：每个 ledger `status: ready_for_fix`；worktree clean，除目标 ledger 变更外没有 unrelated dirty diff。
- 输出结果：同一 ledger 更新 execution、review、verification、closeout；最终输出 `$finish` handoff 或 blocked/failed 状态。

#### 4.2.2 方案设计

- 核心逻辑：
  - preflight 检查 git repo、worktree clean、ledger status、diagnosis summary、fix brief、expected touched files、parallel safety。
  - 轻量 scope validation：文件存在或为明确新增测试；多个 ledger expected files/surfaces 不重叠；没有 public surface/config/schema/lockfile/generated artifact 风险。
  - 调度：
    - 全部 parallel safe 且无重叠：每 ledger 一个隔离 git worktree 和 bug-fix subagent。
    - 不满足并行但无高风险：自动串行。
    - 有高风险：停止确认。
  - 每个 subagent 只收到自己的 ledger、allowed files/surfaces、forbidden scope、report path，以及需要直接修改时的隔离 worktree path。
  - subagent 不允许 commit/push/close issue。
  - subagent 如需越界修改，必须停止并报告 `needs_scope_change`。
  - controller 汇总 reports，检查 actual changed files 是否越界或重叠。
  - 对每个 bug 执行 local review；处理 Critical/Important findings。
  - 对整体 diff 执行 whole review；处理 Critical/Important findings。
  - 跑 final verification，更新 ledger 和 closeout draft。
- 状态流转：
  - `phase`: `execution -> local_review -> whole_review -> verification -> closeout`
  - `status`: `ready_for_fix -> in_progress -> fixed -> reviewed -> complete | failed | blocked`
- 数据变更：
  - 修改 fix brief 允许范围内的 production/test files。
  - 更新同一个 `.loopx/issues/...md`。
  - 可写 `.loopx/issues/reports/` 作为 subagent report scratch。
- 计算公式：
  - `actual_changed_files = git diff --name-only <baseline>...working-tree` 加上 untracked files。
  - scope violation = actual changed file 不在任一 ledger allowed set 且非允许的 paired test/report ledger。
- 幂等设计：
  - 完成的 ledger 不重复执行，除非用户明确重新运行并记录 reason。
  - failed/blocked ledger 可在修正 brief 后重试。
- 权限/越权控制：
  - subagent forbidden list 必须包括 public CLI/API/schema/config changes、lockfile、generated artifacts、其他 ledger files。
  - 需要越界时暂停，不允许自行扩大 scope。
- 异常处理：
  - review finding 为 Critical/Important：必须处理或 evidence-based pushback。
  - Minor：可修可记，但不得扩大 scope。
  - verification 失败：回到 diagnosis/fix strategy 或标记 failed，不进入 finish。
- 补偿/重试：
  - 每类 fix attempt 应有合理上限，避免无限修复；多次失败时记录 architecture/risk concern。
- 日志与审计：
  - 每个执行、测试、review、fix-review 决策写入 ledger。

#### 4.2.3 流程步骤

1. 读取 ledgers。
2. 执行 preflight 和 clean worktree 检查。
3. 验证每个 ledger ready。
4. 做 scope validation 和调度决策。
5. 串行或并行执行 bug fixes。
6. 汇总 reports，检查 actual changed files。
7. 每 bug local review。
8. 处理 Critical/Important findings 并 re-review。
9. whole diff review。
10. 处理整体 findings 并 re-review。
11. final verification。
12. 更新 closeout draft，输出 `$finish` handoff。

#### 4.2.4 边界条件

| 场景 | 处理方式 | 用户/调用方感知 | 监控/告警 |
|---|---|---|---|
| ledger 非 ready | 拒绝执行，提示先 `$issue` 完成 diagnosis/fix brief | 明确错误和缺失字段 | preflight failure |
| worktree dirty | 停止，列出 unrelated dirty files | 用户先清理或保存工作 | preflight failure |
| ledgers 不能并行 | 无高风险则自动串行 | 报告降级原因 | scheduler log |
| subagent 需要越界 | 停止该 bug，更新 ledger 为 scope change required | 用户看到需要重新确认 | report status |
| actual changed files 重叠 | 停止整体 closeout，要求人工决策 | 不进入 finish | scope violation |

### 4.3 `debug` 增强详细设计

#### 4.3.1 需求内容

- 入口：独立 `$debug` 或 `$issue` diagnosis phase 内部遵守。
- 操作人/调用方：用户、`issue` skill。
- 前置条件：存在 bug symptom、failing output 或 unexpected behavior。
- 输出结果：结构化 diagnosis summary。

#### 4.3.2 方案设计

- 核心逻辑：
  - 保留 no fixes without root cause investigation 的 iron law。
  - 新增 diagnosis summary schema：

```yaml
diagnosis:
  classification: bug | regression | failing_test | build_failure | unexpected_behavior | not_a_bug | needs_info
  reproduction_status: reproduced | intermittent | not_reproduced | not_attempted
  evidence:
    - type: command | log | steps | code | user_report
      value: ...
  root_cause_status: confirmed | likely | unknown
  root_cause: ...
  hypotheses_rejected:
    - ...
  fix_mode: root_cause_fix | defensive_fix | blocked | no_fix_needed
  regression_test_required: true | false
  regression_test_exception_reason: ...
  risk_triggers:
    - no_repro
    - defensive_fix
    - public_surface
    - scope_unclear
```

- 状态流转：不引入独立 runtime 状态；由 `issue` ledger 保存。
- 数据变更：无固定文件，除被 `issue` 写入 ledger。
- 异常处理：无法复现不等于可跳过诊断，必须记录已尝试步骤和证据缺口。

#### 4.3.3 流程步骤

1. 读取 symptom 和错误输出。
2. 尝试复现或收集可替代证据。
3. 检查最近变更和相似工作代码。
4. 形成并测试假设。
5. 输出 diagnosis summary。

#### 4.3.4 边界条件

| 场景 | 处理方式 | 用户/调用方感知 | 监控/告警 |
|---|---|---|---|
| root cause unknown | 允许 defensive fix brief，但必须标风险 | 用户知道未证明 root cause | risk_triggers |
| 不是 bug | 输出 `not_a_bug` 或 `feature_request` | issue 不进入 fix | classification |
| 缺复现信息 | 输出 `needs_info` | 生成 response draft | evidence gap |

## 五、存储类设计

### 5.1 库表设计

#### 5.1.1 数据库模型图

不涉及数据库。issue-driven 第一版使用本地 Markdown ledger。

#### 5.1.2 表结构

| 表名 | 用途 | 主键 | 关键索引 | 数据量预估 | 备注 |
|---|---|---|---|---|---|
| 不涉及 | 不新增数据库表 | 不涉及 | 不涉及 | 不涉及 | 使用 `.loopx/issues/*.md` |

字段明细：

| 字段 | 类型 | 是否必填 | 默认值 | 含义 | 来源/取值逻辑 | 备注 |
|---|---|---|---|---|---|---|
| phase | string | 是 | intake | 当前处理阶段 | `issue`/`fix` 更新 | intake/triage/diagnosis/fix_brief/execution/local_review/whole_review/verification/closeout |
| status | string | 是 | pending | 当前处理状态 | `issue`/`fix` 更新 | ready_for_fix/needs_info/not_a_bug/complete 等 |
| expected_touched_files | list | ready_for_fix 时是 | 无 | 预计修改文件 | `issue` fix brief | `fix` 并行调度硬输入 |
| parallel_safe | boolean | ready_for_fix 时是 | false | 是否可并行 | `issue` fix brief | 缺失时不可并行 |
| evidence_log | list | 是 | 空 | 诊断和验证证据 | append-only | Markdown 列表即可 |

### 5.2 数据迁移/初始化

- DDL：不涉及。
- DML：不涉及。
- 数据回填：不涉及。
- 老数据兼容：已有 `.loopx/intake`、`.loopx/finish` 等目录不受影响。新增 `.loopx/issues/`。
- 新老系统读写关系：不涉及。

### 5.3 缓存设计

不涉及缓存。

## 六、其他组件设计

### 6.1 消息设计

不涉及消息系统。

### 6.2 配置设计

| 配置项 | 环境 | 默认值 | 是否动态生效 | 说明 | 风险 |
|---|---|---|---|---|---|
| 不涉及 | 不涉及 | 不涉及 | 不涉及 | 第一版不新增配置 | 无 |

### 6.3 定时任务/批处理

不涉及定时任务。

### 6.4 技术组件

- 分布式锁：不涉及。
- 唯一 ID：ledger 文件名使用 slug + timestamp。
- 加解密/验签：不涉及。
- 字典转换：issue status、phase、classification 枚举由 skill 文档定义。
- Excel/文件处理：不涉及。
- 用户信息透传：不涉及。
- 限流/熔断：不涉及。

## 七、接口设计

### 7.1 接口设计原则

- 本期不新增 CLI runtime command；接口主要是 skill invocation 和 Markdown ledger contract。
- Skill contract 必须明确输入、输出、状态、拒绝条件和 handoff。
- Ledger 字段必须足够稳定，供后续 `fix`、review、finish 引用。
- 非 ready ledger 不得被 `fix` 当作执行输入。

### 7.2 接口清单

| 接口 | 调用方 | 服务方 | 权限/认证 | 幂等 | 文档地址 | 备注 |
|---|---|---|---|---|---|---|
| `$issue <source>` | 用户/agent | `issue` skill | 本地文件权限 | 默认新建 ledger；传已有 ledger 可续写 | `skills/issue/SKILL.md` | 新增 |
| `$fix <ledger...>` | 用户/agent | `fix` skill | 本地文件和 git 工作区权限 | ready ledger 可执行；complete 默认不重跑 | `skills/fix/SKILL.md` | 新增 |
| diagnosis summary | `issue` | `debug` contract | 不涉及 | 每次诊断覆盖当前 summary，evidence log append-only | `skills/debug/SKILL.md` | 增强 |

### 7.3 接口明细

#### 7.3.1 `$issue`

- 路径/方法：skill invocation。
- 请求头：不涉及。
- 请求参数：bug report 文本、本地文件路径、失败输出或复现说明。
- 响应参数：ledger path、status、response draft summary、next handoff。
- 错误码：不涉及 runtime error code；skill 文档定义 `needs_info`、`blocked` 等状态。
- 业务校验：仅 bug-class issue 进入 ready_for_fix；feature request 路由回 feature-driven。
- 数据变更：写 `.loopx/issues/*.md`。
- 日志字段：evidence log。

#### 7.3.2 `$fix`

- 路径/方法：skill invocation。
- 请求头：不涉及。
- 请求参数：一个或多个 `.loopx/issues/*.md` ledger path。
- 响应参数：execution result、review result、verification result、finish handoff。
- 错误码：不涉及 runtime error code；preflight failure 写入/报告具体原因。
- 业务校验：ledger ready、worktree clean、scope validation。
- 数据变更：修改允许范围内代码和测试；更新同一 ledger；写 reports。
- 日志字段：execution reports、review decisions、verification evidence。

## 八、系统发布

### 8.1 灰度方案

- 灰度范围：作为 bundled core workflow skill 随下一次 loopx skill suite 发布。
- 灰度开关：不新增开关；用户通过是否调用 `$issue`/`$fix` 选择使用。
- 验证指标：治理测试通过、plugin mirror 同步、安装后 skills 可发现、docs 中两条主链一致。
- 放量节奏：先合入 skill/docs/tests；再通过 package 发布进入默认安装。

### 8.2 降级方案

- 降级触发条件：`issue`/`fix` 文档或治理测试导致安装失败，或并行 scope guard 被证明不清晰。
- 降级行为：从 bundled install set 暂时移除 `issue`/`fix`，保留文档或标记 experimental。
- 用户影响：用户回到现有 `$debug` + 手动修复 + `$review` + `$finish` 路径。
- 恢复方式：修复 skill contracts 和治理测试后重新加入 bundled set。

### 8.3 关联系统/功能影响

| 系统/功能 | 影响 | 依赖动作 | 负责人 | 验证方式 |
|---|---|---|---|---|
| bundled skill install | 新增 `issue`、`fix` | 更新 `LOOPX_BUNDLED_SKILLS` | loopx maintainer | governance tests |
| plugin mirror | 新增镜像并同步 debug 改动 | 运行 sync 或手动保持一致 | loopx maintainer | mirror byte equality tests |
| docs | 主叙事变为两条 workflow | 更新 skills 文档和卸载列表 | loopx maintainer | 文档 grep 和测试 |
| existing feature flow | 不应改变行为 | 保持原 skill contracts | loopx maintainer | npm test |

### 8.4 回滚方案

- 回滚条件：新增 skills 破坏安装、治理测试或用户主链理解。
- 回滚步骤：
  - 从 bundled install set 移除 `issue`、`fix`。
  - 从 plugin mirror 移除对应目录。
  - docs 回退到 feature-driven only 叙事，或标记 issue-driven experimental。
  - 保留 `debug` diagnosis summary 如不破坏兼容。
- 数据回滚：`.loopx/issues/` 是本地 scratch，可保留或用户自行删除。
- 配置回滚：不涉及。
- 风险：已安装用户可能已有 `issue/fix` skills；卸载说明需覆盖。

## 九、系统监控与维护

### 9.1 监控与告警

- 系统异常：无 runtime service；通过测试和安装诊断发现。
- 业务异常：ledger status 不合法、ready ledger 缺字段、scope validation 缺失。
- 重试异常：fix 多次失败必须记录 failed/blocked，不能无限重试。
- 超时：subagent 或测试命令超时由 agent 报告并写 ledger。
- 关键接口指标：不涉及线上指标。
- 告警渠道：开发期通过 `npm test`、governance tests、manual skill review。

### 9.2 性能与容量

- TPS/吞吐：不涉及。
- CPU/内存/磁盘 IO/网络 IO：主要为本地测试和文件读写。
- 数据容量：每个 bug 一个 Markdown ledger；容量低。
- 缓存容量：不涉及。
- 跑批耗时：多 ledger fix 可能并行执行测试；由用户和 agent 控制。
- 是否压测：不涉及。

### 9.3 可靠性与兜底

- 幂等击穿：complete ledger 默认不重跑；重跑需记录 reason。
- 并发失效：并行直接修改主 working tree 会造成污染；通过隔离 git worktree、expected files、scope validation、actual changed files check 兜底。
- 冷热备：不涉及。
- 数据丢失：ledger 在 `.loopx/`，默认本地 scratch；用户需要长期保存时可手动提升为文档。
- 人工兜底：scope violation、root cause unknown 高风险、防御性修复、public surface change 必须停下或确认。

## 十、排期与规划

### 10.1 里程碑建议

| 阶段 | 目标 | 主要产物 | 验收 |
|---|---|---|---|
| M1 | 固定 skill contracts | `skills/issue`、`skills/fix`、`skills/debug` 更新 | governance tests fail/pass 驱动 |
| M2 | 更新 product surface | install discovery、plugin mirror、docs、uninstall list | `npm test` |
| M3 | 强化并行安全文档 | `fix` subagent assignment/report contract、scope validation rules | 手工 walkthrough 多 ledger 场景 |
| M4 | 发布前审查 | final review 和 package dry-run | `npm test`、`npm pack --dry-run` |

### 10.2 Planning Handoff

`plan-to-exec` 可以决定：

- 具体测试文件新增位置和断言写法。
- `issue`/`fix` skill 文档的章节组织和示例措辞。
- governance tests 的具体断言文本。
- plugin mirror 同步方式。
- docs 中英文具体排版。

必须回到 `clarify` 或 `spec` 的情况：

- 想让 `issue` 直接调用 GitHub/`gh`。
- 想让 `issue` 持久修改产品代码。
- 想让 `fix` 复用 `exec/subagent-exec`。
- 想引入 git worktree。
- 想让 issue-driven 处理 enhancement/feature request。
- 想让 `fix` 自动 commit、push、PR、merge 或 close issue。
- 想新增 runtime CLI command/state machine。

建议下一步：

```text
$plan-to-exec docs/loopx/design/issue-driven工作流需求设计文档.md
```

## 十一、QA

### 11.1 验证策略

- Skill governance:
  - `issue` 和 `fix` 必须在 bundled install set。
  - root skill 与 plugin mirror 保持一致。
  - `issue`/`fix` frontmatter description 存在且聚焦。
  - `debug` 包含 diagnosis summary contract。
- Docs:
  - `docs/loopx/skills.md` 和中文文档展示 feature-driven 与 issue-driven 两条主链。
  - docs 明确 issue-driven 只处理 bug-class issues。
  - uninstall list 包含 `issue` 和 `fix`。
- Contract tests:
  - `issue` 文档包含 `.loopx/issues/`、phase/status/evidence log、ready_for_fix handoff、non-fix exits。
  - `fix` 文档包含 ready ledger preflight、clean worktree、expected_touched_files、parallel_safe、scope validation、no commits、local review + whole review。
  - `fix` 文档不引用 `exec/subagent-exec` 作为执行引擎。

### 11.2 重点测试场景

| 场景 | 输入 | 预期 |
|---|---|---|
| bug report ready | failing test output | `$issue` 产出 ready_for_fix ledger |
| feature request issue | enhancement 描述 | `$issue` 标记 feature_request 并建议 `$clarify` |
| missing repro | 模糊 bug 描述 | `$issue` 标记 needs_info 或 defensive fix 风险 |
| single fix | 一个 ready ledger | `$fix` 执行、review、verify、finish handoff |
| multiple parallel fixes | 多个 expected files 不重叠 ledger | `$fix` 可并行 subagent |
| overlap fixes | expected files 重叠 | `$fix` 自动串行或高风险确认 |
| scope expansion | subagent 需要改未声明文件 | 停止并更新 ledger，不擅自越界 |
| dirty worktree | unrelated diff 存在 | `$fix` preflight 拒绝执行 |

### 11.3 残余风险

- 第一版主要靠 skill contracts 和 agent discipline，不靠 runtime enforcement。
- 并行直接修改依赖隔离 git worktree；无 worktree 并行只能产出 patch/report，并由 controller 串行应用。
- Markdown ledger 可读性强但机器校验弱；后续如需要更强恢复能力，可增加 JSON sidecar。
