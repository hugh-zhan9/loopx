<p align="center">
  <img src="./assets/logo.svg" alt="loopx logo" width="128" height="128">
</p>

<h1 align="center">loopx</h1>

<p align="center">
  面向 agentic coding assistants 的 skill-first 工作流套件。
</p>

[English](./README.md)

`loopx` 的主要定位是给 Codex 和 Claude 风格的 coding agent 安装并治理一组
skills。CLI 负责安装 skills、hooks 和项目上下文；日常工作流在 agent 内通过
skill 调用完成。

```text
clarify -> spec? -> plan-to-exec -> (exec | subagent-exec) -> review/final-review -> fix-review? -> finish
```

loopx 有两条主流程：

- feature-driven 工作使用上面的路径，处理新的产品或代码变更。
- issue-driven 工作处理 bug 类问题：`$issue` 负责诊断并写入本地 ledger，`$fix` 只执行已经 ready for repair 的 ledger。

## 安装

```bash
npm install -g @ai-content-space/loopx
loopx install-skills --target all --yes
loopx doctor
```

先预览会写入哪些文件：

```bash
loopx install-skills --target all --dry-run
```

完整 CLI 和安装细节见 [CLI 参考](./docs/loopx/cli.zh-CN.md)。

## 在 agent 中使用

安装后，在 agent 里直接按名称调用对应 skill：

```text
$clarify <feature-or-problem>
$plan-to-exec <slug>
$subagent-exec <approved-plan>
$issue <bug-report-or-failing-output>
$fix .loopx/issues/<ledger>.md
$final-review
$finish
```

普通 feature 从 `$clarify` 开始。它的输出应该说明下一步是 `$spec` 还是
`$plan-to-exec`。沿着黄金路径继续，直到 `$finish` 完成验证并记录结果。

没有 subagent，或任务足够小的时候，用 `$exec` 代替 `$subagent-exec`。评审反馈
需要评估、反驳或修复时，用 `$fix-review`。

bug 类 issue 从 `$issue` 开始。只有 ledger 状态为 `ready_for_fix` 后，才进入 `$fix`。

## 核心 skills

| Skill | 什么时候用 |
|---|---|
| `clarify` | 范围、非目标、约束或决策边界仍不清楚。 |
| `spec` | API、数据、状态、权限、迁移、兼容、产品行为或架构决策必须先固定。 |
| `codebase-spec` | 已有仓库、模块或接口需要基于证据生成当前状态规格文档。 |
| `plan-to-exec` | 需求已经清楚，可以拆成小步执行任务。 |
| `subagent-exec` | 已批准计划需要 fresh subagents 和 combined task review 执行。 |
| `exec` | 已批准计划需要 inline 顺序执行。 |
| `review` | 具体 git range 需要独立代码评审。 |
| `final-review` | 完整 feature 已实现，需要在 finish 前检查集成、运行时和测试缺口风险。 |
| `fix-review` | review feedback 需要技术评估、反驳或实现。 |
| `finish` | 工作已验证，需要选择 merge、PR、保留或丢弃。 |
| `issue` | issue-driven bug 类 intake、诊断和 fix brief 创建。 |
| `fix` | 从 `.loopx/issues` 中 `ready_for_fix` 的 ledger 执行 issue-driven 修复。 |
| `refactor-plan` | 行为保持的重构需要限定范围、拆成 tiny commits。 |

辅助 skills 是 lens，不是 workflow state：`tdd`、`debug`、`verify`、
`doc-readability`、`requirement-analyzer`、`go-style`、`kratos`、
`api-designer`、`architecture-designer`、`sql-style` 和 `cli-developer`。

完整 bundled v1 skill surface 见 [loopx Skills 使用指南](./docs/loopx/skills.zh-CN.md)。

## 上下文规则

人工维护的工作流产物放在 `docs/loopx/`：`design/`、`plans/`、`reviews/`、
`refactors/`、`memory/` 和 `specs/`。

`docs/loopx/specs/` 保存长期有效、具有约束力的 repo context。工作流 skills 会在澄清、
设计、计划、执行和评审前读取相关 specs。

`.loopx/memory/MEMORY.md` 是建议性的 curated memory。它帮助 agent 记住有用的项目知识，
但不能覆盖当前用户指令、已批准的 source documents 或具有约束力的 specs。

优先级顺序：当前用户指令、source document、repo specs、memory。生成的支撑状态、
hook 诊断、安装元数据、HTML views 和 runtime JSON 仍放在 `.loopx/` 下。

## Finish audit

`finish` 会在 `.loopx/finish/<audit-id>/` 下写入本地 audit ledger。`none` 表示已经完成审计，
但没有产生可持久化的 learning candidate。

根据审计结果判断是否需要后续更新项目 memory 或 specs。`finish` 不应该把每个完成任务
都静默变成持久知识。

## 维护者说明

安装和治理意义上的 v1 skill surface 是 `skills/` 里的 bundled 集合。Codex plugin
shell 位于 `plugins/loopx/`，其中的 skill mirror 从 canonical bundled skills 生成。

只手动编辑 `skills/`。修改 bundled skills 后，重新生成 `plugins/loopx/skills/`：

```bash
npm run sync-plugin-skills
```

发布前或修改 bundled skills 后运行确定性治理检查：

```bash
node scripts/verify-skills.mjs
```

package 和 plugin manifest version 跟 npm release 走。Skill `metadata.version`
独立管理；只给内容或行为契约变化过的 skills 升级版本。
