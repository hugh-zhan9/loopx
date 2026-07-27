# CLI 参考

CLI 负责安装 loopx、检查安装结果、准备仓库上下文，以及创建本地文档集。主要产品
表面是 working agreement 和文档型 skills。

## 快速开始

```bash
npm install -g @ai-content-space/loopx
loopx install-skills --target all --yes
loopx doctor
```

## 命令

```bash
loopx --version
loopx install-skills [--target <codex|claude|all>] [--project] [--mode <copy|symlink>] [--dir <path>] [--add-agent-guidance] [--yes] [--dry-run] [--json]
loopx init [--slug <slug>] [--json]
loopx clarify <slug> [--json]
loopx render [slug|--all]
loopx status [slug] [--json]
loopx setup-context
loopx doctor [--json]
loopx repair-install
```

`loopx clarify` 在 `.loopx/` 下创建文档集：一份 working copy，以及
`clarification.md` 和 `requirements.md`。文档索引只记录路径，不包含工作流阶段、
ready 门禁、下一 skill 路由、评审结论或执行策略。`loopx status` 只报告文档是否
存在，不指导模型下一步怎么做。

三个 canonical workflow intents 是 `clarify`、`spec` 和 `plan2exec`。它们定义
目标、决策、边界和证据。实现、评审、恢复、委派与 Git 处置属于宿主原生模型工作，
并遵循安装后的 working agreement。

默认输出面向人类。安装、诊断和文档路径需要机器读取时使用 `--json`。

## 安装

postinstall 默认安装用户级 skills 和 working agreement：

- Codex skills：`~/.agents/skills/`
- Claude skills：`~/.claude/skills/`
- Codex guidance：`~/.codex/AGENTS.md` 中的 managed block
- Claude guidance：`~/.claude/CLAUDE.md` 中的 managed block

预览写入内容：

```bash
loopx install-skills --target all --dry-run
```

跳过自动 postinstall：

```bash
LOOPX_SKIP_POSTINSTALL=1 npm install -g @ai-content-space/loopx
LOOPX_POSTINSTALL=0 npm install -g @ai-content-space/loopx
```

修复中断或冲突的安装：

```bash
loopx repair-install
loopx doctor
```

如需移除 loopx 管理的用户级 artifacts，请查看
[Installation And CLI Onboarding Spec](./specs/installation.md)。

## 维护命令

benchmark 与 drill 证据保留在源码仓库中，不进入 npm runtime 包。发布前运行确定性
治理门：

```bash
node scripts/verify-skills.mjs
```
