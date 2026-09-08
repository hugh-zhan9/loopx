# loopx Skills 使用指南

[English](./skills.md)

安装后的产品采用 docs-first。核心交付物是安装进 host guidance 的 working
agreement；执行属于模型和宿主运行时。清晰且边界明确的工作在该 agreement 之下
直接实现并完成新鲜验证。可选的 `exec` 是消费 ready plan 的宿主原生 subagent
playbook，不是 loopx runtime。

## Canonical Workflow Intents

三个 canonical workflow intents 都是可选的、产出文档，且不构成固定顺序。

| Skill | 使用时机 | 输出 |
|---|---|---|
| `clarify` | 意图、范围、验收、权限、密钥或破坏性选择未解决。 | 已解决的 intake package 或具体阻塞项。 |
| `spec` | 产品行为、兼容、数据、安全、迁移或架构决策需要持久共识。 | 带 `D-*` 锚点及复用、隔离、可维护性证据的已接受设计文档。 |
| `plan2exec` | 用户明确要求实施计划，或审批、中断恢复、持久协调需要计划。 | 一份在 slices 中保留架构约束、依赖、验收与验证的 plan 文档。 |

普通工作可以完全不使用它们。只有执行一份 ready `plan2exec` 文档时才选择
`$exec`：实现交给 leaf subagent，顶层模型负责审查与集成。独立评审、验证与 Git
纪律继续服从 working agreement。

选用 `plan2exec` 后，计划必须经过宿主原生独立 `plan-reviewer` 评审才能 ready。
评审证据留在计划内，计划或来源发生实质修改后重新评审；无法委派时保持 blocked。
普通 prompt-first 工作不受此门槛影响。设计、计划、评审和 SQL 共用数据库并发契约。

## 可选的 Plan 执行

| Skill | 使用时机 | 行为 |
|---|---|---|
| `exec` | 用户明确要求执行一份 ready `plan2exec` 文档。 | Leaf subagent 实现 slices；controller 先复核架构适配，再顺序审查与集成。只有代码与共享状态边界都独立的 slices 才可并行；可选的 `model`、`reasoning_effort` 和 `max_workers` 会传给宿主原生 subagent。 |

## Issue Workflows

`issue` 与 `fix` 继续可用，且不加入固定的 feature 路径：

```text
$issue <bug-report-or-failing-output>
$fix .loopx/issues/<ready-ledger>.md
```

首次修复从 `ready_for_fix` ledger 开始；恢复有记录的 `in_progress` 修复时，必须先核对检查点与当前完整改动一致。Feature 请求回到
prompt-first 工作或有充分理由的 canonical intent。

`spec` 创建并维护相互链接的概要设计与详细设计；`design-review` 原地更新概要设计，保留其独有决定和评审历史。计划和评审通过详细设计索引读取概要设计拥有的决定。

## Support Lenses

支持 skills 可以直接调用，也可与 canonical intents 组合：

| Skill | 关注点 |
|---|---|
| `codebase-spec` | 现状行为的证据化文档。 |
| `refactor-plan` | 行为保持型重构 RFC，经 `plan2exec` 转换后再执行。 |
| `code-darwin` | 证据化的代码腐化/坏味道审计，并产出可优先处理的重构 backlog。 |
| `tdd` | 失败测试先行的开发。 |
| `debug` | 根因诊断。 |
| `verify` | 完成声明前的新鲜证据。 |
| `using-git-worktrees` | 显式工作区隔离。 |
| `humanize-doc` | 文档可读性评估、改稿与去 AI 味，保留事实、决策状态和边界。 |
| `maintain-project-docs` | 仓库文档的当前权威、历史归档与检索隔离。 |
| `requirement-analyzer` | 需求缺口与就绪度。 |
| `plan-reviewer` | 对照来源审查 plan 文档。 |
| `go-style`、`kratos` | Go 工程 facade（风格、现代化、性能、并发）与 Go-Kratos 纪律。 |
| `api-designer`、`architecture-designer`、`sql-style`、`cli-developer` | 领域设计与评审 lenses。 |
| `generate-api-docs` | 为现有 HTTP API 生成字段级 Markdown 与可导入 Apifox 的 OpenAPI YAML。 |
| `lancet` | 实现与评审的最小化纪律。 |
| `prompt-lint` | 只读检查提示词的目标、上下文、边界、验证证据与信号质量。 |

Support lenses 不创建 workflow 状态，也不替代 `clarify`、`spec` 或
`plan2exec`。

## 示例

```text
$clarify add team-level usage limits
$spec billing-state-transitions
$plan2exec docs/loopx/design/2026-07-20-billing/requirements.md
$exec docs/loopx/plans/2026-07-20-billing.md model=gpt-5.6-sol reasoning_effort=high max_workers=4
$prompt-lint "修复最后一个不完整批次被遗漏的问题，并添加回归测试。"
```

每条完成路径都需要 working agreement 之下的新鲜任务相关验证。Prompt-first
工作不创建 plan、review 报告或其他 workflow artifacts，除非具体触发条件要求。
