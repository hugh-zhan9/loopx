# loopx Skills 使用指南

[English](./skills.md)

这份文档介绍 loopx v1 已安装 skills 的用途，以及它们如何组合使用。这里覆盖的是 `loopx install-skills` 安装的 bundled skills，不包括仓库里可能存在的其他辅助源目录。

## 心智模型

loopx skills 分成两类：

- 核心工作流 skills 推动一次功能工作的生命周期：澄清、必要时设计、计划、执行、评审、处理反馈、收尾。
- 辅助 skills 给特定活动增加纪律，例如测试、调试、文档可读性、API 设计、SQL、Go 或 CLI 行为。它们是 lens，不是 workflow state。

普通产品或代码变更使用核心工作流。任务有专门风险时，再叠加对应的辅助 skill。

推荐流程：

```text
clarify -> spec? -> plan-to-exec -> (exec | subagent-exec) -> review/final-review -> fix-review? -> finish
```

## 核心工作流 Skills

| Skill | 什么时候用 | 产出 |
|---|---|---|
| `clarify` | 请求含糊、范围不清，或缺少决策/非目标。 | 已回答的问题，以及进入 `spec` 或 `plan-to-exec` 的路线。 |
| `spec` | 产品行为、API、数据、状态、权限、迁移、兼容或架构决策需要先固定。 | `docs/loopx/design/` 下的设计 spec 或轻量 design note。 |
| `plan-to-exec` | 需求或 spec 已批准，需要拆成可执行任务。 | `docs/loopx/plans/` 下的小步实施计划。 |
| `subagent-exec` | 已批准计划包含独立任务，并且可以使用 subagents。 | 带 staged review checkpoints 的任务执行结果。 |
| `exec` | 已批准计划需要 inline 执行，或不能/不想使用 subagents。 | 带验证和评审 checkpoint 的顺序实现。 |
| `review` | 已完成的任务、checkpoint 或重要改动需要独立代码评审。 | 绑定 git range 和需求的 review findings。 |
| `final-review` | 整个 feature 已实现，需要在收尾前检查集成、运行时和测试缺口风险。 | `finish` 前的最终风险评审。 |
| `fix-review` | 已经有具体 review feedback，需要技术评估或实现。 | 逐条处理反馈、必要时 pushback，并完成验证。 |
| `finish` | 实现和验证已完成，需要决定 merge、PR、保留或丢弃。 | 完成决策和本地 finish audit 记录。 |
| `refactor-plan` | 用户想要行为保持的重构计划，并且希望用小提交推进。 | 有边界的 refactor plan；不是立即实现。 |

## 辅助 Skills

| Skill | 什么时候用 | 说明 |
|---|---|---|
| `tdd` | feature 或 bugfix 应该先写失败测试。 | 行为可测试时，在生产代码之前使用。 |
| `debug` | bug、失败测试、构建失败、回归或异常行为需要 root-cause investigation。 | 先诊断，再改代码。 |
| `verify` | agent 准备声称完成、修复、测试通过、可评审或可提交。 | 必须有新鲜命令输出作为证据。 |
| `doc-readability` | 文档、PRD、spec、会议纪要或知识库文章不清楚、臃肿或 AI 味重。 | 在把文档当成 source material 前，先评估或重写。 |
| `requirement-analyzer` | 现有需求需要检查歧义、缺口、可行性、追踪关系或开发就绪度。 | 输出 gap report；不推进 workflow state。 |
| `go-style` | 编辑或评审 Go 代码。 | 覆盖 Go 风格、错误处理、context、命名、测试和 interface 边界。 |
| `kratos` | 处理 Go-Kratos 服务、proto/buf API、service/biz/data 层、middleware、auth 或 config。 | 同时有框架和 Go 代码问题时，可与 `go-style` 一起用。 |
| `api-designer` | 设计 REST、GraphQL、OpenAPI、resources、pagination、versioning、compatibility 或 error models。 | 在 `spec`、实现或 review 中增加 API discipline。 |
| `architecture-designer` | 决策涉及边界、ADR、NFR、可扩展性、failure modes、operability 或技术取舍。 | 用于设计阶段和 final review 的系统级风险判断。 |
| `sql-style` | 修改 SQL、schema、index、migration、方言行为或性能敏感的数据访问。 | schema 或 migration 决策建议配合 `spec` 使用。 |
| `cli-developer` | 设计 CLI commands、flags、人类/JSON 输出、错误、交互、help text、shell 行为或跨平台 UX。 | 用于 CLI 产品表面变更。 |

## 如何选择下一个 Skill

按这条规则路由：

1. 工作还不清楚，用 `clarify`。
2. 计划前需要固定决策，用 `spec`。
3. 设计已定，需要拆任务，用 `plan-to-exec`。
4. 已有批准计划，独立任务用 `subagent-exec`，inline 执行用 `exec`。
5. 实现完成但还没评审，用 `review` 或 `final-review`。
6. 已有反馈，用 `fix-review`。
7. 测试和最终评审都完成后，用 `finish`。

辅助 skills 可以叠加到这条路径上。例如：

- 数据库 feature 可以走 `clarify -> spec`，在 `spec` 中叠加 `sql-style`，然后进入 `plan-to-exec`。
- 公共 API 变更可以在 `spec` 和 `review` 中使用 `api-designer`。
- 失败测试应该先走 `debug`；新行为可以在实现前使用 `tdd`。
- PRD 或 source document 可以先用 `doc-readability` 或 `requirement-analyzer` 检查，再进入 `clarify`。

## 常见例子

含糊的功能请求：

```text
$clarify add team-level usage limits
```

设计较重的变更：

```text
$spec billing-state-transitions
```

已批准的实现计划：

```text
$plan-to-exec billing-state-transitions
$subagent-exec billing-state-transitions
```

inline 执行：

```text
$exec billing-state-transitions
```

Bug 调查：

```text
$debug failing renewal invoice test
```

文档评审：

```text
$doc-readability docs/product/usage-limits-prd.md
```

收尾：

```text
$final-review billing-state-transitions
$finish
```

## Guardrails

- 范围、非目标或决策边界未解决时，不要跳过 `clarify`。
- 不要用 `plan-to-exec` 发明缺失的产品或架构决策。
- 不要把辅助 skills 当作 workflow states。
- 没有 `verify` 风格的新鲜证据，不要声称工作完成。
- 实现、评审和验证没有真正完成前，不要运行 `finish`。
