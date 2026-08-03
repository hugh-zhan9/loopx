# loopx Skills 使用指南

[English](./skills.md)

安装后的产品采用 docs-first。核心交付物是安装进 host guidance 的 working
agreement；执行属于模型和宿主运行时。清晰且边界明确的工作在该 agreement 之下
直接实现并完成新鲜验证。下面这些产出文档的 skills 只在歧义、持久决策或协调
需要时才引入治理。

## Canonical Workflow Intents

三个 canonical workflow intents 都是可选的、产出文档，且不构成固定顺序。

| Skill | 使用时机 | 输出 |
|---|---|---|
| `clarify` | 意图、范围、验收、权限、密钥或破坏性选择未解决。 | 已解决的 intake package 或具体阻塞项。 |
| `spec` | 产品行为、兼容、数据、安全、迁移或架构决策需要持久共识。 | 带 `D-*` 锚点的已接受设计文档。 |
| `plan2exec` | 用户明确要求实施计划，或审批、中断恢复、持久协调需要计划。 | 一份含一致 slices、依赖、验收与验证的 plan 文档，由 agent 自己执行。 |

普通工作可以完全不使用它们。执行、高风险 diff 的独立评审、验证与 Git 纪律
都是 working agreement 的条款，不是 skills。

## Issue Workflows

`issue` 与 `fix` 继续可用，且不加入固定的 feature 路径：

```text
$issue <bug-report-or-failing-output>
$fix .loopx/issues/<ready-ledger>.md
```

只有 ledger 状态为 `ready_for_fix` 时才使用 `fix`。Feature 请求回到
prompt-first 工作或有充分理由的 canonical intent。

## Support Lenses

支持 skills 可以直接调用，也可与 canonical intents 组合：

| Skill | 关注点 |
|---|---|
| `codebase-spec` | 现状行为的证据化文档。 |
| `refactor-plan` | 行为保持型重构规划。 |
| `tdd` | 失败测试先行的开发。 |
| `debug` | 根因诊断。 |
| `verify` | 完成声明前的新鲜证据。 |
| `using-git-worktrees` | 显式工作区隔离。 |
| `doc-readability` | 文档清晰度与重写。 |
| `humanize-doc` | AI 生成文档的改稿纪律（说人话、定案、不臆造）。 |
| `maintain-project-docs` | 仓库文档的当前权威、历史归档与检索隔离。 |
| `requirement-analyzer` | 需求缺口与就绪度。 |
| `plan-reviewer` | 对照来源审查 plan 文档。 |
| `go-style`、`kratos` | Go 与 Go-Kratos 纪律。 |
| `api-designer`、`architecture-designer`、`sql-style`、`cli-developer` | 领域设计与评审 lenses。 |
| `lancet` | 实现与评审的最小化纪律。 |

Support lenses 不创建 workflow 状态，也不替代 `clarify`、`spec` 或
`plan2exec`。

## 示例

```text
$clarify add team-level usage limits
$spec billing-state-transitions
$plan2exec docs/loopx/design/2026-07-20-billing/requirements.md
```

每条完成路径都需要 working agreement 之下的新鲜任务相关验证。Prompt-first
工作不创建 plan、review 报告或其他 workflow artifacts，除非具体触发条件要求。
