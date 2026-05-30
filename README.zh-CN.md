<p align="center">
  <img src="./assets/logo.svg" alt="loopx logo" width="128" height="128">
</p>

<h1 align="center">loopx</h1>

<p align="center">
  面向 agentic coding assistants 的 skill-first 工作流套件。
</p>

[English](./README.md)

`loopx` 为 Codex 和 Claude 风格的 coding agent 打包一组实用 skills。它把 grill-me 式需求澄清和 superpowers 式计划、执行、评审、收尾流程组合成一套可安装、可治理的技能套件。

推荐 v1 流程：

```text
clarify -> spec? -> plan -> subagent-exec | exec -> review -> fix-review? -> finish
```

`spec` 是条件设计门。涉及 API、数据、状态、权限、迁移、兼容、产品行为或架构决策时使用；只剩局部实现选择时可以跳过，直接进入 `plan`。

## Skills

核心工作流 skills：

- `clarify`：持续追问直到范围、非目标、约束和决策边界清楚。
- `spec`：在需要设计决策时写设计文档或轻量 design note。
- `plan`：按 superpowers `writing-plans` 风格写小步实施计划。
- `subagent-exec`：用 fresh subagents 和 staged review 执行已批准计划。
- `exec`：没有 subagent 或用户选择 inline 时顺序执行计划。
- `review`：基于 git range 和计划/需求发起独立代码评审。
- `fix-review`：严谨评估并处理 code review feedback。
- `finish`：验证完成后选择 merge、PR、保留或丢弃。
- `refactor-plan`：访谈并写行为保持的 tiny-commit 重构计划。

辅助 skills：

- `tdd`
- `debug`
- `verify`
- `go-style`
- `kratos`

## 产物

人工维护的长期产物放在 `docs/loopx/`：

- `docs/loopx/design/`
- `docs/loopx/plans/`
- `docs/loopx/reviews/`
- `docs/loopx/refactors/`

`.loopx/` 用于本地支撑状态、hook 诊断、安装元数据和 legacy runtime workflows。

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

插件镜像 canonical `skills/` 目录，并复用同一套 install/discovery core。

## CLI

CLI 用于安装、诊断、渲染和 legacy runtime 兼容：

```bash
loopx install-skills [--target <codex|claude|all>] [--project] [--mode <copy|symlink>] [--dir <path>] [--yes]
loopx init [--slug <slug>] [--enable-agent-delegation] [--auto-agent-delegation] [--agent-delegation-threshold <local|critic-only|parallel-review>]
loopx clarify <slug> [--standard|--deep]
loopx approve <slug> --from <stage> --to <stage>
loopx plan [slug] [--direct <spec-path>] [--interactive] [--deliberate]
loopx build <slug> [--no-deslop]
loopx build --from-review <review-report-path> [--no-deslop]
loopx review <slug> [--reviewer <name>]
loopx archive <slug>
loopx autopilot <slug> [--reviewer <name>]
loopx render [slug|--all]
loopx status [slug] [--json]
loopx setup-context
loopx doctor
loopx migrate
loopx repair-install
```

Legacy `.loopx/workflows/` 命令仍保留兼容，但不是 v1 skill-suite workflow。

## 治理

bundled skill resolver 位于：

```text
skills/RESOLVER.md
```

发布前或修改 bundled skills 后运行确定性治理检查：

```bash
node scripts/verify-skills.mjs
```

治理脚本检查 bundled skill frontmatter、plugin mirrors、resolver coverage、本地引用、发布包包含项、版本一致性和公开文档。
