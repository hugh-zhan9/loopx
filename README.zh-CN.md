<p align="center">
  <img src="./assets/logo.svg" alt="loopx logo" width="128" height="128">
</p>

<h1 align="center">loopx</h1>

<p align="center">面向 agentic coding assistants 的 skill-first 工作流套件。</p>

[English](./README.md)

`loopx` 为 Codex 和 Claude 风格的 coding agent 安装受治理的 skills、host
guidance 和项目上下文。日常工作保持 prompt-first：清晰且边界明确的请求可以直接
实现并完成新鲜验证，不必为了经过固定阶段而创建 workflow artifacts。

六个 canonical workflow intents 是 `clarify`、`spec`、`plan`、`exec`、
`review` 和 `finish`。它们是按需使用的治理工具，不是固定路径。

- `clarify` 在修改前解决会影响结果的实质歧义。
- `spec` 固化长期有效的产品、兼容、数据、安全或架构决策。
- `plan` 只在明确要求计划、审批、恢复或持久协调时写 lean plan。
- `exec` 让强耦合工作保持顺序执行，并可隔离并发执行独立工作。
- `review` 只在明确要求或存在具体风险证据时进行独立评审。
- `finish` 在工作验证完成后处理用户明确要求的 Git disposition。

Issue-driven 工作流继续保留：`$issue` 诊断 bug 类报告并写入本地 ledger；
`$fix` 执行状态为 `ready_for_fix` 的 ledger。`tdd`、`debug`、`verify`、
`plan-reviewer`、`api-designer`、`architecture-designer`、`sql-style`、
`cli-developer` 和 `lancet` 等辅助 skills 仍然是 lens，不是 workflow state。

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

仅在请求或已观察到的风险需要治理时调用：

```text
$clarify <ambiguous-request>
$spec <decision-heavy-change>
$plan <approved-source-or-planning-request>
$exec <clear-request-or-plan>
$review <request-or-git-scope>
$finish <Git-disposition-request>
```

每次声称完成都需要新鲜验证。独立评审、持久计划、恢复状态、知识写入和 Git
disposition 都是条件触发。`finish` 不负责验证、评审或知识提取，也不会写本地
audit ledger。

## 显式兼容别名

在一个 release 周期内，五个旧名称作为 explicit-only compatibility aliases
保留，并从自动发现中排除：

| 别名 | Canonical intent |
|---|---|
| `plan-to-exec` | `plan` |
| `subagent-exec` | `exec` |
| `parallel-subagent-exec` | `exec` |
| `final-review` | `review` |
| `fix-review` | `review` |

每个别名原样转发输入，但不会恢复旧的详细计划、executor 选择、scheduler、强制
评审、feedback ledger 或 finish gate 协议。

## 上下文规则

`docs/loopx/specs/` 保存长期有效、具有约束力的 repo context。
`.loopx/memory/MEMORY.md` 是建议性的 curated memory。当前用户指令和已批准的
source documents 优先级更高。

只有顶层 controller 管理 agent 生命周期。所有被派发 worker 都是 leaf worker，
不得继续创建、委派或等待其他 agent。pre-v2 运行中 workflow state 不受支持，
必须重新开始。

完整 bundled surface 见 [loopx Skills 使用指南](./docs/loopx/skills.zh-CN.md)。

## 维护者说明

Normal install 和 plugin install 都读取 package-root 的 canonical `skills/`
source。发布前运行确定性治理检查：

```bash
node scripts/verify-skills.mjs
```

Package 和 plugin manifest version 跟 npm release 走。Skill `metadata.version`
独立管理；只给内容或行为契约变化过的 skill 升级版本。
