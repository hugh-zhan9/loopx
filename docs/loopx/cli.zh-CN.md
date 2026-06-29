# CLI 参考

CLI 是 loopx 的安装、诊断、上下文初始化和本地 runtime 支撑入口。主要产品表面仍然是
在 agent 中使用的 installed skill suite。

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

`loopx init`、`loopx clarify`、`loopx status` 和 `loopx next` 用来帮助 agent
和用户找到下一次 skill handoff。黄金路径仍然发生在 agent 中：

```text
clarify -> spec? -> plan-to-exec -> (exec | subagent-exec) -> review/final-review -> fix-review? -> finish
```

新的 `clarify` workflow 会在 `.loopx/intake/YYYY-MM-DD-<slug>/` 下写入本地 intake package，包含 `clarification.md`、`requirements.md` 和 `test-cases.md`。人类输出展示简洁路径；完整 state 字段使用 `--json`。

## 安装

postinstall 默认安装用户级 skills 和 hooks：

- Codex skills：`~/.agents/skills/`
- Claude skills：`~/.claude/skills/`
- Codex hook：`~/.codex/hooks/codex-workflow-hook.mjs`
- Claude hook：`~/.claude/hooks/loopx-workflow-hook.mjs`

先预览会写入哪些文件：

```bash
loopx install-skills --target all --dry-run
```

跳过 npm postinstall 阶段的自动安装：

```bash
LOOPX_SKIP_POSTINSTALL=1 npm install -g @ai-content-space/loopx
LOOPX_POSTINSTALL=0 npm install -g @ai-content-space/loopx
```

只在当前进程禁用 loopx hooks：

```bash
LOOPX_HOOKS=0 codex
```

控制 Codex-only 的 `lancet` 自动指引；它只用于实现和评审阶段：

```bash
loopx lancet status
loopx lancet off
loopx lancet on
LOOPX_LANCET=0 codex
```

`lancet` 状态保存在 `~/.loopx/lancet/`。`LOOPX_LANCET=0` 只禁用当前进程的
自动指引，不改写本地状态。

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

Agent guidance 是 opt-in。`--add-agent-guidance` 会写入 loopx managed block，
提示 agent 读取 repo specs 和 memory context。Managed block 之外的用户内容会保留。

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
