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
clarify -> spec? -> plan -> (subagent-exec | exec) -> final-review -> fix-review? -> finish
```

`spec` 是条件设计门。涉及 API、数据、状态、权限、迁移、兼容、产品行为或架构决策时使用；只剩局部实现选择时可以跳过，直接进入 `plan`。

## Skills

安装和治理意义上的 v1 skill surface 是下面这组。仓库里可以保留辅助或兼容 skill 源文件，但除非它们属于 bundled v1 集合，否则 `loopx install-skills` 不会安装它们。

核心工作流 skills：

- `clarify`：持续追问直到范围、非目标、约束和决策边界清楚。
- `spec`：在需要设计决策时写设计文档或轻量 design note。
- `plan`：按 superpowers `writing-plans` 风格写小步实施计划。
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
- `docs/loopx/specs/`

当完成的工作产生稳定团队规则时，`finish` 可以在 `docs/loopx/specs/` 生成 spec candidates。这些候选是 repo-tracked，必须保留在 git diff 中供审阅。

`finish` 还会在 `.loopx/finish/<audit-id>/` 下写入本地 audit ledger。`none` 表示已经完成审计，但没有产生可持久化的 learning candidate。choice recording 也放在这个本地 finish audit 目录里，而 repo-tracked 的 spec candidates 仍然保留在 `docs/loopx/specs/`。

公开的 finish audit 命令：

- `loopx finish-audit`
- `loopx finish-record`

`finish` 是一次 implementation decision 的终端完成步骤。只有在上次选择保留、PR 迭代、执行选择前中断，或 review feedback 后出现新变更时才重新执行；merge 或 discard 后不要重复执行。

生成的支撑状态、hook 诊断、安装元数据、HTML views、manifests 和 runtime JSON 仍放在 `.loopx/` 下。

本地 agent memory 放在 `.loopx/memory/`：

- `.loopx/memory/MEMORY.md`
- `.loopx/memory/index.jsonl`
- `.loopx/memory/entries/`
- `.loopx/memory/archive/`

`MEMORY.md` 是有上限的 curated project memory summary。`index.jsonl` 是用于 agent 文件检索的 curated active index，不是 append-only log。

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

也可以手动运行安装器或交互式选择目标：

```bash
loopx install-skills
loopx install-skills --target codex
loopx install-skills --target claude
loopx install-skills --target claude --project
loopx install-skills --target all --yes
```

Claude project install 会写入当前仓库的 `.claude/skills/` 和 `.claude/settings.json`。

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
loopx install-skills [--target <codex|claude|all>] [--project] [--mode <copy|symlink>] [--dir <path>] [--yes]
loopx init [--slug <slug>] [--enable-agent-delegation] [--auto-agent-delegation] [--agent-delegation-threshold <local|critic-only|parallel-review>]
loopx clarify <slug> [--standard|--deep]
loopx approve <slug> --from <stage> --to <stage>
loopx plan [slug] [--interactive] [--deliberate]
loopx build <slug> [--no-deslop]
loopx build --from-review <review-report-path> [--no-deslop]
loopx review <slug> [--reviewer <name>]
loopx autopilot <slug> [--reviewer <name>]
loopx render [slug|--all]
loopx status [slug] [--json]
loopx setup-context
loopx doctor
loopx migrate
loopx repair-install
loopx finish-audit
loopx finish-record
```

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
