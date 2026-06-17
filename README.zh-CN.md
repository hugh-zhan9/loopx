<p align="center">
  <img src="./assets/logo.svg" alt="loopx logo" width="128" height="128">
</p>

<h1 align="center">loopx</h1>

<p align="center">
  面向 agentic coding assistants 的 skill-first 工作流套件。
</p>

[English](./README.md)

`loopx` 为 Codex 和 Claude 风格的 coding agent 安装并治理一组实用的 v1 skills。它适合把 agent 工作流固定成一条清楚的路径：先澄清范围，需要时写设计说明，再把决策拆成执行计划，经过评审，最后用明确验证收尾。

推荐 v1 流程：

```text
clarify -> spec? -> plan-to-exec -> (exec | subagent-exec) -> review/final-review -> fix-review? -> finish
```

## 安装

全局安装：

```bash
npm install -g @ai-content-space/loopx
```

安装 bundled skills 和 hooks：

```bash
loopx install-skills --target all --yes
loopx doctor
```

如果想先检查会写入哪些文件：

```bash
loopx install-skills --target all --dry-run
```

## 快速开始

创建工作流、澄清需求，然后让 loopx 提示下一步：

```bash
loopx init --slug my-feature
loopx clarify my-feature
loopx status my-feature
loopx next my-feature
```

`clarify` 之后，跟随提示的 skill 命令继续，通常是 `$plan-to-exec <slug>`。后续用 `loopx status <slug>` 或 `loopx next <slug>` 查看下一步，直到 `final-review` 和 `$finish` 完成收尾。

这就是首次使用的黄金路径。

默认输出面向人类。当 agent 或脚本需要完整 runtime payload 时使用 `--json`：

```bash
loopx init --slug my-feature --json
loopx clarify my-feature --json
loopx doctor --json
loopx install-skills --target all --json
```

默认 init 路径也支持 JSON 输出：`loopx init --json`。

## 工作流

`spec` 是条件设计门。涉及 API、数据、状态、权限、迁移、兼容、产品行为或架构决策时使用；只剩局部实现选择时可以跳过。

`clarify` 输出和 `spec` 设计文档都是 anchor sources。`plan-to-exec` 把这些来源转换成可执行任务时，必须保留需求覆盖关系。

核心工作流 skills：

| Skill | 作用 |
|---|---|
| `clarify` | 持续追问直到范围、非目标、约束和决策边界清楚。 |
| `spec` | 在需要设计决策时写设计文档或轻量 design note。 |
| `plan-to-exec` | 把已澄清的需求拆成小步执行计划。 |
| `subagent-exec` | 用 fresh subagents 和 staged review 执行已批准计划。 |
| `exec` | 没有 subagent 或用户选择 inline 时顺序执行计划。 |
| `review` | 基于 git range 和计划/需求发起独立代码评审。 |
| `final-review` | 收尾前对完整 feature 做运行时、集成和测试缺口风险评审。 |
| `fix-review` | 严谨评估并处理 code review feedback。 |
| `finish` | 验证完成后选择 merge、PR、保留或丢弃。 |
| `refactor-plan` | 访谈并写行为保持的 tiny-commit 重构计划。 |

`review` 和 `fix-review` 在 `subagent-exec` 或 `exec` 内部作为 task/checkpoint review loop 运行。`final-review` 是 `finish` 前的 whole-feature review，它的反馈也通过 `fix-review` 处理。

辅助 skills 是 lens，不是 workflow state：

- `tdd`
- `debug`
- `verify`
- `doc-readability`
- `requirement-analyzer`
- `go-style`
- `kratos`
- `api-designer`
- `architecture-designer`
- `sql-style`
- `cli-developer`

安装和治理意义上的 v1 skill surface 就是上面这组。仓库里可以保留辅助或兼容 skill 源文件，但 `loopx install-skills` 只安装 bundled v1 集合。

## CLI

常用命令：

```bash
loopx --version
loopx install-skills [--target <codex|claude|all>] [--project] [--mode <copy|symlink>] [--dir <path>] [--add-agent-guidance] [--yes] [--dry-run] [--json]
loopx init [--slug <slug>] [--enable-agent-delegation] [--auto-agent-delegation] [--agent-delegation-threshold <local|critic-only|parallel-review>] [--json]
loopx clarify <slug> [--standard|--deep] [--json]
loopx render [slug|--all]
loopx status [slug] [--json]
loopx next <slug> [--json]
loopx setup-context
loopx doctor [--json]
loopx repair-install
```

## 文件和上下文

人工维护的工作流产物放在 `docs/loopx/`：

- `docs/loopx/design/`
- `docs/loopx/plans/`
- `docs/loopx/reviews/`
- `docs/loopx/refactors/`
- `docs/loopx/memory/`
- `docs/loopx/specs/`

`docs/loopx/specs/` 保存长期有效、具有约束力的 repo context。工作流 skills 会在澄清、设计、计划、构建和评审前读取相关 specs。

`.loopx/memory/MEMORY.md` 是建议性的 curated memory。它帮助 agent 记住有用的项目知识，但不能覆盖当前用户指令、已批准的 source documents 或具有约束力的 specs。

`finish` 会在 `.loopx/finish/<audit-id>/` 下写入本地 audit ledger。`none` 表示已经完成审计，但没有产生可持久化的 learning candidate。

优先级顺序：当前用户指令、source document、repo specs、memory。

生成的支撑状态、hook 诊断、安装元数据、HTML views 和 runtime JSON 仍放在 `.loopx/` 下。

## 安装细节

postinstall 默认安装 Codex 和 Claude 用户级 skills 与 hooks：

- Codex skills：`~/.agents/skills/`
- Claude skills：`~/.claude/skills/`
- Codex hook：`~/.codex/hooks/codex-workflow-hook.mjs`
- Claude hook：`~/.claude/hooks/loopx-workflow-hook.mjs`

跳过 npm postinstall 阶段的自动安装：

```bash
LOOPX_SKIP_POSTINSTALL=1 npm install -g @ai-content-space/loopx
LOOPX_POSTINSTALL=0 npm install -g @ai-content-space/loopx
```

只在当前进程禁用 loopx hooks：

```bash
LOOPX_HOOKS=0 codex
```

修复中断或冲突的安装：

```bash
loopx repair-install
loopx doctor
```

手动选择安装目标：

```bash
loopx install-skills
loopx install-skills --target codex
loopx install-skills --target claude
loopx install-skills --target claude --project
loopx install-skills --target all --add-agent-guidance
loopx install-skills --target all --yes
```

Agent guidance 是 opt-in。`--add-agent-guidance` 会写入 loopx managed block，提示 agent 读取 repo specs 和 memory context。Managed block 之外的用户内容会保留。

Claude project install 会把 skills 和 settings 写入当前仓库的 `.claude/skills/` 和 `.claude/settings.json`。

如需移除 loopx 管理的用户级 artifacts，请查看 [Installation And CLI Onboarding Spec](./docs/loopx/specs/installation.md)。

## Codex Plugin

Codex plugin shell 位于：

```text
plugins/loopx/
```

插件安装脚本：

```bash
node plugins/loopx/scripts/plugin-install.mjs
```

插件镜像 `skills/` 中 canonical bundled v1 skills，并复用同一套 install/discovery core。

## 治理

bundled skill resolver 位于：

```text
skills/RESOLVER.md
```

发布前或修改 bundled skills 后运行确定性治理检查：

```bash
node scripts/verify-skills.mjs
```

治理脚本检查 bundled v1 skill frontmatter、plugin mirrors、resolver coverage、本地引用、发布包包含项、版本一致性和公开文档。它刻意验证可安装的 v1 skill 集合，而不是 `skills/` 下的每个辅助源目录。
