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
| `plan` | 用户明确要求计划，或审批、中断恢复、持久协调需要计划。 | 包含 outcomes、boundaries、dependencies、acceptance 和 verification 的 lean plan。 |
| `exec` | 清晰请求或 lean plan 需要 adaptive execution。 | 顺序或隔离并发的实现，以及新鲜验证。 |
| `review` | 用户明确要求评审，或安全、破坏性行为、公共兼容、跨任务交互、冲突合并需要独立性。 | 有证据的 findings，以及 blocking issue 的闭环。 |
| `finish` | 用户明确要求 commit 或 branch placement、merge、pull request、keep、cleanup 或 discard。 | 用户要求的 Git disposition。 |

普通工作可以不调用任何 canonical intent。`finish` 不是完成仪式，不负责验证、独立
评审或知识提取。

## 显式兼容别名

在一个 release 周期内，以下 explicit-only compatibility aliases 继续安装，但不参与
自动路由：

| 别名 | 转发到 |
|---|---|
| `plan-to-exec` | `plan` |
| `subagent-exec` | `exec` |
| `parallel-subagent-exec` | `exec` |
| `final-review` | `review` |
| `fix-review` | `review` |

别名原样保留输入和显式意图，但不会恢复旧的 plan schema、execution-mode 选择、
scheduler state、强制 review report、feedback ledger 或 finish gate。

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

辅助 lens 不创建 workflow state，也不替代 `clarify`、`spec`、`plan`、`exec`、
`review` 或 `finish`。

## 示例

```text
$clarify add team-level usage limits
$spec billing-state-transitions
$plan docs/loopx/design/2026-07-20-billing/requirements.md
$exec docs/loopx/plans/2026-07-20-billing.md
$review HEAD~1
$finish commit this change
```

每条完成路径都需要新鲜、与任务相关的验证。只有顶层 controller 管理 agent
生命周期；implementer、reviewer 和 fixer 都是 leaf worker。Prompt-first 工作不会
创建 plan、review report、finish record 或其他 workflow artifact，除非存在具体触发条件。
