<p align="center">
  <img src="./assets/logo.svg" alt="loopx logo" width="128" height="128">
</p>

<h1 align="center">loopx</h1>

<p align="center">
  面向 agentic coding assistants 的 skill-first 工作流套件。
</p>

[English](./README.md)

`loopx` 为 Codex 和 Claude 风格的 coding agent 安装一组实用的 v1 skills。它把 grill-me 式需求澄清和 superpowers 式计划、执行、评审、收尾流程组合成一套可安装、可治理的技能套件。

推荐 v1 流程：

```text
clarify -> spec? -> plan-to-exec -> (subagent-exec | exec) -> final-review -> fix-review? -> finish
```

## 快速开始

```bash
loopx install-skills --target all --yes
loopx init --slug my-feature
loopx clarify my-feature
loopx status my-feature
```

工作流存在后，如果只想看下一步命令：

```bash
loopx next my-feature
```

默认输出面向人类，例如 `loopx init`、`loopx clarify`、`loopx status`、`loopx doctor` 和 `loopx install-skills`。当 agent 或脚本需要完整 runtime payload 时使用 `--json`：

```bash
loopx init --slug my-feature --json
loopx clarify my-feature --json
loopx doctor --json
loopx install-skills --target all --json
```

默认 init 路径也可以使用 JSON 输出：`loopx init --json`。

`spec` 是条件设计门。涉及 API、数据、状态、权限、迁移、兼容、产品行为或架构决策时使用；只剩局部实现选择时可以跳过，直接进入 `plan-to-exec`。

## Skills

安装和治理意义上的 v1 skill surface 是下面这组。仓库里可以保留辅助或兼容 skill 源文件，但除非它们属于 bundled v1 集合，否则 `loopx install-skills` 不会安装它们。

核心工作流 skills：

- `clarify`：持续追问直到范围、非目标、约束和决策边界清楚。
- `spec`：在需要设计决策时写设计文档或轻量 design note。
- `plan-to-exec`：按 superpowers `writing-plans` 风格写小步实施计划。
- `subagent-exec`：用 fresh subagents 和 staged review 执行已批准计划。
- `exec`：没有 subagent 或用户选择 inline 时顺序执行计划。
- `review`：基于 git range 和计划/需求发起独立代码评审。
- `final-review`：在收尾前对完整 feature 做运行时、集成和测试缺口风险评审。
- `fix-review`：严谨评估并处理 code review feedback。
- `finish`：验证完成后选择 merge、PR、保留或丢弃。
- `refactor-plan`：访谈并写行为保持的 tiny-commit 重构计划。

`review` 和对应的 `fix-review` 在 `subagent-exec` 或 `exec` 内部作为 task/checkpoint review loop 运行。`final-review` 是 `finish` 前的顶层 whole-feature review，它的反馈也通过 `fix-review` 处理。

辅助 skills：

- `tdd`
- `debug`
- `verify`
- `go-style`
- `kratos`

## 产物

v1 skill-suite 工作流的人工维护长期产物放在 `docs/loopx/`：

- `docs/loopx/design/`
- `docs/loopx/plans/`
- `docs/loopx/reviews/`
- `docs/loopx/refactors/`
- `docs/loopx/memory/`
- `docs/loopx/specs/`

`docs/loopx/memory/` 用于保存纳入 git 的 shared memory，适合需要跟随用户跨机器同步、但还没有稳定到 spec 级别的轻量项目知识。

### Repo Specs And Memory

`docs/loopx/specs/` 是 binding long-lived repo context。工作流 skills 会在澄清、设计、计划、构建和评审前读取相关 specs。Specs 定义持久 repo rules 和 constraints；它们优先于本地 memory，并应通过经过评审的工作流变更来更新。

Summary: docs/loopx/specs/ is binding long-lived repo context; .loopx/memory/MEMORY.md is advisory curated memory.

`docs/loopx/specs/index.md` 是可选的。存在时，agent 只把它当作 retrieval 和 prioritization map；即使没有 index，这个目录仍然有效。

`.loopx/memory/MEMORY.md` 是 advisory curated memory。它总结有用的项目知识，但不能覆盖当前用户指令、已批准的 source documents 或 binding specs。`.loopx/memory/index.jsonl` 也是可选且 retrieval-only：它帮助 agent 找到相关 active memory cards，不是 append-only log。

当完成的工作产生稳定团队规则时，`finish` 可以在 `docs/loopx/specs/` 生成 spec candidates。这些候选是 repo-tracked，必须保留在 git diff 中供审阅。

`finish` 还会在 `.loopx/finish/<audit-id>/` 下写入本地 audit ledger。`none` 表示已经完成审计，但没有产生可持久化的 learning candidate。choice recording 也放在这个本地 finish audit 目录里，而 repo-tracked 的 spec candidates 仍然保留在 `docs/loopx/specs/`。

Finish runtime 命令是给 agent、hooks 和兼容路径使用的高级 plumbing，不是普通用户主路径。`finish-start` 会记录计划执行开始时的提交，`finish-audit` 使用这个基线把已提交的 `baseline..HEAD` 证据、变更文件和未提交状态写入 `.loopx/finish/<audit-id>/finish-state.json` 的 `audit.change_window`，因此即使执行过程中已经 commit、当前工作区是 clean，finish 的记忆/spec 提取仍有稳定输入。它还会写入用于记忆/spec 审核的草稿 `audit.extraction_candidates`；agent 必须接受或拒绝这些草稿后，才能把 finish choice 记录为 done。

`finish` 是一次 implementation decision 的终端完成步骤。只有在上次选择保留、PR 迭代、执行选择前中断，或 review feedback 后出现新变更时才重新执行；merge 或 discard 后不要重复执行。

### Archive 兼容性

archive 不属于公开 v1 finish 流程。旧 runtime state 仍可能包含 archive 字段，也可能通过隐藏的 `loopx archive <slug>` 兼容命令处理历史状态，但普通用户应通过 `finish` 完成工作。

生成的支撑状态、hook 诊断、安装元数据、HTML views、manifests 和 runtime JSON 仍放在 `.loopx/` 下。

本地 advisory agent memory 放在 `.loopx/memory/`：

- `.loopx/memory/MEMORY.md`
- `.loopx/memory/index.jsonl`
- `.loopx/memory/entries/`
- `.loopx/memory/archive/`

`MEMORY.md` 是有上限的 curated project memory summary。`index.jsonl` 是用于 agent 文件检索的 curated active index，不是 append-only log。

shared agent memory 放在 `docs/loopx/memory/`。它会纳入 repo，用于多机器连续性；内容应简短、有证据，并且还没有稳定到 spec 级别。

## 安装

全局安装：

```bash
npm install -g @ai-content-space/loopx
```

postinstall 默认安装 Codex 和 Claude 用户级 skills 与 hooks：

- Codex skills：`~/.agents/skills/`
- Claude skills：`~/.claude/skills/`
- Codex hook：`~/.codex/hooks/codex-workflow-hook.mjs`
- Claude hook：`~/.claude/hooks/loopx-workflow-hook.mjs`

只检查、不写文件：

```bash
loopx install-skills --target all --dry-run
```

dry-run 检查使用显式 target，避免命令进入交互选择。

安装成功后的输出会列出 targets 和安装到的 skill roots。`loopx install-skills --json` 会输出完整 inspection payload，供脚本和排查使用。

npm postinstall 阶段跳过自动安装：

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

撤销已安装文件，移除 loopx 管理的用户级 artifacts：

```bash
rm -rf ~/.agents/skills/{clarify,spec,plan-to-exec,subagent-exec,exec,review,final-review,fix-review,finish,refactor-plan,tdd,debug,verify,go-style,kratos}
rm -rf ~/.claude/skills/{clarify,spec,plan-to-exec,subagent-exec,exec,review,final-review,fix-review,finish,refactor-plan,tdd,debug,verify,go-style,kratos}
rm -f ~/.codex/hooks/codex-workflow-hook.mjs ~/.claude/hooks/loopx-workflow-hook.mjs
```

也可以手动运行安装器或交互式选择目标：

```bash
loopx install-skills
loopx install-skills --target codex
loopx install-skills --target claude
loopx install-skills --target claude --project
loopx install-skills --target all --add-agent-guidance
loopx install-skills --target all --yes
```

Agent guidance 是 opt-in。`--add-agent-guidance` 会写入 loopx managed block，提示 agent 读取 Repo Specs And Memory context。Codex user install 写入 `~/.codex/AGENTS.md`；Claude user install 写入 `~/.claude/CLAUDE.md`；Claude project install 写入当前 repo 的 `CLAUDE.md`。Managed block 之外的用户内容会保留。

Claude project install 会把 skills 和 settings 写入当前仓库的 `.claude/skills/` 和 `.claude/settings.json`。

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

## CLI

CLI 用于安装、诊断、渲染和 runtime 维护：

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
loopx migrate
loopx repair-install
```

高级 runtime 命令：

```bash
loopx help advanced
```

这些命令保留给 skills、hooks 和兼容路径。普通用户应跟随 `loopx status`、`loopx next` 和提示的 skill 命令。

## 黄金路径

最小完整首次使用路径：

```bash
loopx install-skills --target all --dry-run
loopx install-skills --target all --yes
loopx doctor
loopx init --slug my-feature
loopx clarify my-feature
loopx status my-feature
loopx next my-feature
```

`clarify` 之后，把控制权交给提示的 skill 命令，通常是 `$plan-to-exec <slug>`。后续继续跟随 `loopx status <slug>` 或 `loopx next <slug>`，直到 `final-review` 和 `$finish` 完成收尾。

## 治理

bundled skill resolver 位于：

```text
skills/RESOLVER.md
```

发布前或修改 bundled skills 后运行确定性治理检查：

```bash
node scripts/verify-skills.mjs
```

治理脚本检查 bundled v1 skill frontmatter、plugin mirrors、resolver coverage、本地引用、发布包包含项、版本一致性和公开文档。它刻意验证安装意义上的 v1 skill 集合，而不是 `skills/` 下可能存在的每个辅助源目录。
