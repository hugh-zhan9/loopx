# loopx Skills 使用指南

[English](./skills.md)

安装后的产品采用 prompt-first。清晰且边界明确的工作可以直接实现并完成新鲜验证。
只有在歧义、风险、恢复、协调或明确用户意图需要时，workflow skills 才增加治理。

## Canonical Workflow Intents

六个 canonical workflow intents 都是可选的，不构成必须依次经过的流程。

| Skill | 什么时候用 | 产出 |
|---|---|---|
| `clarify` | 意图、范围、验收、权限、secret 或 destructive choice 尚未解决。 | 已解决的 intake package 或明确 blocker。 |
| `spec` | 产品行为、兼容、数据、安全、迁移或架构决策需要长期一致。 | 已接受的 design contract。 |
| `plan2exec` | 用户明确要求实施计划，或审批、中断恢复、持久协调需要计划。 | 包含 coherent slices、权威 DAG、结构性 profile、acceptance、verification 和 review focus 的 execution plan。 |
| `exec` | 清晰请求或 plan 需要 adaptive execution。 | Inline、强制评审的 delegated serial，或强制评审的 parallel strict 实现。 |
| `review` | 用户明确要求评审，或安全、破坏性行为、公共兼容、跨任务交互、冲突合并需要独立性。 | 有证据的 findings，以及 blocking issue 的闭环。 |
| `finish` | 用户显式调用 `$finish`，或要求处置当前 loopx `exec`/`fix` 上下文已完成工作的 Git 结果。 | 用户要求的 Git disposition。 |

普通工作可以不调用任何 canonical intent。`finish` 不是完成仪式，不负责验证、独立
评审或知识提取。独立的 branch、commit、merge、push、pull-request 和 worktree
请求不会仅因属于 Git 操作而选择 `finish`。

## Execution Profiles

`exec` 自动选择 profile。以下显式 profile skill 进入同一个 exec-owned implementation：

| Profile skill | 行为 |
|---|---|
| `subagent-exec` | 每个 slice 使用 fresh implementer，按图顺序执行，强制 task review、独立 fixer 和最终双轴 review。 |
| `parallel-subagent-exec` | 对 ready frontier 做有界隔离并发；task review clean 后才能集成并解锁下游。 |

## 显式评审意图入口

以下永久的 explicit-only review intent entries 继续安装，但不参与自动路由：

| 入口 | 意图 |
|---|---|
| `final-review` | 全部任务完成后，经 `review` 做整体终审。 |
| `fix-review` | 经 `review` 主动修复既有评审发现，可派一波独立 fixer。 |

入口转发进 canonical `review` workflow 并保留显式意图，但不会恢复旧的
feedback ledger 或 finish gate。

## Issue Workflows

`issue` 和 `fix` 作为 bug 类问题工作流继续保留，但不加入固定 feature 路径：

```text
$issue <bug-report-or-failing-output>
$fix .loopx/issues/<ready-ledger>.md
```

只有 ledger 为 `ready_for_fix` 时才使用 `fix`。Feature request 回到 prompt-first
工作，或进入有具体理由的 canonical intent。

## 辅助 Lenses

辅助 skills 仍可直接调用，也可与 canonical intents 组合：

| Skill | 关注点 |
|---|---|
| `codebase-spec` | 基于证据记录当前行为。 |
| `refactor-plan` | 行为保持的重构计划。 |
| `tdd` | 先写失败测试。 |
| `debug` | 根因诊断。 |
| `verify` | 声称完成前取得新鲜证据。 |
| `using-git-worktrees` | 显式工作区隔离。 |
| `doc-readability` | 文档清晰度和重写。 |
| `requirement-analyzer` | 需求缺口和就绪度。 |
| `plan-reviewer` | 对照 source 临时审核 lean plan。 |
| `go-style`、`kratos` | Go 和 Go-Kratos discipline。 |
| `api-designer`、`architecture-designer`、`sql-style`、`cli-developer` | 特定领域的设计和评审 lens。 |
| `lancet` | 实现和评审阶段的简化。 |

辅助 lens 不创建 workflow state，也不替代 `clarify`、`spec`、`plan2exec`、`exec`、
`review` 或 `finish`。

## 示例

```text
$clarify add team-level usage limits
$spec billing-state-transitions
$plan2exec docs/loopx/design/2026-07-20-billing/requirements.md
$exec docs/loopx/plans/2026-07-20-billing.md
$review HEAD~1
$finish commit this change
```

每条完成路径都需要新鲜、与任务相关的验证。只有顶层 controller 管理 agent
生命周期；implementer、reviewer 和 fixer 都是 leaf worker。Prompt-first 工作不会
创建 plan、review report、finish record 或其他 workflow artifact，除非存在具体触发条件。
