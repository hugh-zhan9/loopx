# CLI 参考

CLI 是 loopx 的安装、诊断、上下文初始化和本地 intake 支撑入口。主要产品表面是
安装进 agent host 的 working agreement 和文档型 skills。

## 当前工作流状态合同

新的 clarify 工作流使用 schema v2，并将 `handoff_decision` 持久化为
`needs_spec`、`direct_to_plan` 或 `blocked`。`loopx status` 与 `loopx next`
只根据该决策路由，ready 本身不再代表可以直接规划。pre-v2 运行状态不受
支持，CLI 不会迁移或删除旧文件；出现
`unsupported_workflow_schema:<version>:restart_required` 时应创建新的当前合同工作流。

## 快速开始

```bash
npm install -g @ai-content-space/loopx
loopx install-skills --target all --yes
loopx doctor
```

默认输出面向人类。当 agent 或脚本需要完整 runtime payload 时使用 `--json`：

```bash
loopx init --slug my-feature --json
loopx clarify my-feature --json
loopx doctor --json
loopx install-skills --target all --json
```

默认 init 路径也支持 JSON 输出：`loopx init --json`。

## 命令

```bash
loopx --version
loopx install-skills [--target <codex|claude|all>] [--project] [--mode <copy|symlink>] [--dir <path>] [--add-agent-guidance] [--yes] [--dry-run] [--json]
loopx init [--slug <slug>] [--enable-agent-delegation] [--auto-agent-delegation] [--agent-delegation-threshold <local|critic-only|parallel-review>] [--json]
loopx clarify <slug> [--standard|--deep] [--json]
loopx render [slug|--all]
loopx status [slug] [--json]
loopx next <slug> [--json]
loopx setup-context
loopx lancet <on|off|status> [--json]
loopx doctor [--json]
loopx repair-install
```

`loopx init`、`loopx clarify`、`loopx status` 和 `loopx next` 支撑本地 intake
和 handoff state。安装后的产品在其他情况下保持 prompt-first。三个 canonical
workflow intents 是 `clarify`、`spec` 和 `plan2exec`，它们只产出文档；实现、
评审和 Git 处置由宿主原生模型能力完成，并遵循安装后的 working agreement。

新的 `clarify` workflow 会在 `.loopx/intake/YYYY-MM-DD-<slug>/` 下写入本地 intake package，包含 canonical `requirements.md` 和 supporting `clarification.md`。人类输出展示简洁路径；完整 state 字段使用 `--json`。

## 安装

postinstall 默认安装用户级 skills 和 working agreement：

- Codex skills：`~/.agents/skills/`
- Claude skills：`~/.claude/skills/`
- Codex guidance：`~/.codex/AGENTS.md` 中的 managed block
- Claude guidance：`~/.claude/CLAUDE.md` 中的 managed block

先预览会写入哪些文件：

```bash
loopx install-skills --target all --dry-run
```

跳过 npm postinstall 阶段的自动安装：

```bash
LOOPX_SKIP_POSTINSTALL=1 npm install -g @ai-content-space/loopx
LOOPX_POSTINSTALL=0 npm install -g @ai-content-space/loopx
```

管理保留的 `lancet` preference：

```bash
loopx lancet status
loopx lancet off
loopx lancet on
LOOPX_LANCET=0 codex
```

`lancet` 状态保存在 `~/.loopx/lancet/`。v0.8 不安装每轮 hook；该 preference
保留给兼容的宿主工具读取。

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

Prompt-first routing guidance 会自动安装到两个 host。`--add-agent-guidance`
会额外写入一个 loopx managed block，提示 agent 读取 repo specs 和 memory context。
Managed block 之外的用户内容会保留。

Claude project install 会把 skills 和 settings 写入当前仓库的 `.claude/skills/` 和
`.claude/settings.json`。

如需移除 loopx 管理的用户级 artifacts，请查看
[Installation And CLI Onboarding Spec](./specs/installation.md)。

## 维护命令

Normal install 和 plugin install 都从 package-root 的 canonical `skills/` source
读取 bundled skills。修改 bundled skills 时，只手动编辑 `skills/`。

发布前或修改 bundled skills 后运行确定性治理检查：

```bash
node scripts/verify-skills.mjs
```

package 和 plugin manifest version 跟 npm release 走。Skill `metadata.version`
独立管理；只给内容或行为契约变化过的 skills 升级版本。
