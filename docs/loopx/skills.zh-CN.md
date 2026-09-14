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
| `spec` | 产品行为、兼容、数据、安全、迁移或架构决策需要记录，或已有设计需要评审。 | 带 `D-*` 锚点及复用、隔离、可维护性证据的设计文档，注明接受或待决状态。 |
| `plan2exec` | 用户明确要求实施计划，或审批、中断恢复、长期协调需要计划，或已有计划需要评审。 | 一份在 slices 中保留架构约束、依赖、验收与验证的 plan 文档。 |

普通工作可以完全不使用它们。只有执行一份 ready `plan2exec` 文档时才选择
`$exec`：实现交给 leaf subagent，顶层模型负责审查与集成。独立评审、验证与 Git
纪律继续服从 working agreement。

计划评审已并入 `plan2exec`。普通计划由作者核对后即可交付；用户要求评审，
或涉及破坏性变更、公开兼容性、安全、迁移顺序、共享资源等具体风险时，才需要
独立评审。格式和措辞不阻碍实施。首次评审后只核对修复和受影响的决定；代码已经
完成时，直接对照需求检查实现和验证结果，不再补跑开工前评审。

`clarify`、`spec` 已采用原 v2 实现，继续使用原名称。安装包现有 21 个 skill，
设计评审和计划评审不再单设入口。`code-darwin` 的重构检查和扫描工具并入
`refactor-plan`，按需使用；`verify` 的验证规则由工作约定和共享说明承担。

## 可选的 Plan 执行

| Skill | 使用时机 | 行为 |
|---|---|---|
| `exec` | 用户明确要求执行一份 ready `plan2exec` 文档。 | Leaf subagent 实现 slices；controller 先复核架构适配，再顺序审查与集成。只有代码与共享状态边界都独立的 slices 才可并行；可选的 `model`、`reasoning_effort` 和 `max_workers` 会传给宿主原生 subagent。 |

## 排查和修复

统一使用 `debug`：

```text
$debug 查一下这个失败的原因，先不要改代码。
$debug 修复这个回归问题，并运行必要检查。
$debug 继续 .loopx/issues/<ledger>.md 中已授权的修复。
```

它替代 `issue` 和 `fix` 两个入口，默认不创建台账。提供已有台账时，保留原有
范围、证据和恢复检查；台账状态本身不代表修复授权。继续中断的修复前，必须
核对当前完整改动与已保存的检查点一致。

## 设计产物和需求依据

`clarify` 优先更新已有需求来源，问答历史按需记录。新建需求材料时，由
`requirements.md` 维护验收要求和场景。`spec` 保留《概要设计》和《需求设计文档》：
前者讲整体方案、流程和模块关系，后者讲接口、字段和实现约束。涉及公开契约、
数据模型、状态机、跨系统或需要共同评审的设计，继续维护这两份文档；局部小改动
不用套完整模板。概要按需要简述选择理由；详细设计写当前采用的实现方案，
不要求方案比较和讨论记录。评审通过的修改直接更新设计，不再默认创建《设计提案》。已有概要中的独有决定和评审历史仍然有效，不能从详细设计重新生成后覆盖。

已批准的设计或重构方案，在用户授权实施后可以直接开发。计划只安排工作、
依赖和验证，不能重新定义需求。实施和最终验证都要回看原始需求；编号对应
不代表行为一致，延后必需的验收场景也须得到明确批准。

## Support Lenses

支持 skills 可以直接调用，也可与 canonical intents 组合：

| Skill | 关注点 |
|---|---|
| `codebase-spec` | 按指定范围整理现状，优先更新已有文档，不要求固定章节。 |
| `refactor-plan` | 按需检查重构机会或编写独立重构方案。只要求检查时交付发现；已批准方案可直接指导授权的实施。 |
| `tdd` | 失败测试先行的开发。 |
| `debug` | 排查原因，并完成已授权的修复。 |
| `using-git-worktrees` | 显式工作区隔离。 |
| `humanize-doc` | 文档可读性评估、改稿与去 AI 味，保留事实、决策状态和边界。 |
| `maintain-project-docs` | 仓库文档的当前权威、历史归档与检索隔离。 |
| `requirement-analyzer` | 需求缺口与就绪度。 |
| `go-style`、`kratos` | Go 工程 facade（风格、现代化、性能、并发）与 Go-Kratos 纪律。 |
| `api-designer`、`architecture-designer`、`sql-style`、`cli-developer` | 领域设计与评审 lenses。 |
| `generate-api-docs` | 默认按业务场景分别写接口文档，同一路径在不同场景中各自写用途、参数、完整字段与示例；仅在明确要求时生成 OpenAPI YAML。示例须先用真实参数实际调用验证；任一场景无法测试则直接阻断生成与交付。生成后依次用 `lancet` 精简、`humanize-doc` 去 AI 味，再做最终校验。 |
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
