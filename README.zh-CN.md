<p align="center">
  <img src="./assets/logo.svg" alt="loopx logo" width="128" height="128">
</p>

<h1 align="center">loopx</h1>

<p align="center">面向 agentic coding assistants 的 docs-first 工程纪律。</p>

[English](./README.md)

`loopx` 把工程纪律编译成文档，并用证据证明它们有效。核心交付物是一份安装进
host guidance（`AGENTS.md` / `CLAUDE.md`）的简短 working agreement，加上三个
产出文档的 skills。执行属于模型和宿主运行时：loopx 不再提供执行编排器、评审
流水线或每轮 hook。

日常工作在 working agreement 之下保持 prompt-first：先读后改、最小正确改动、
显式边界条件、新鲜验证、遇到未指明的实质决策就停下来问、没有明确请求绝不做
Git 处置。

三个 canonical workflow intents 都产出文档：

- `clarify` 一次一问地访谈，产出带可测试 `AC-*` / `TC-*` 锚点的需求契约。
- `spec` 把长期有效的产品、兼容、数据、安全或架构决策固化为带 `D-*` 锚点的
  设计文档。
- `plan2exec` 只在明确要求计划、审批边界、中断恢复或持久协调时写一份 lean
  plan 文档，由执行 agent 自己按文档执行。该名称与 agent 内建 Plan 模式明确
  区分。

Issue-driven workflows 继续可用：`$issue` 诊断 bug 类报告并写本地 ledger；
`$fix` 执行标记为 `ready_for_fix` 的 ledger。`tdd`、`debug`、`verify`、
`plan-reviewer`、`api-designer`、`architecture-designer`、`sql-style`、
`cli-developer`、`lancet` 等支持 skills 仍是 lenses，不是 workflow 状态。

## 为什么 docs-first

支撑这个设计的四臂 benchmark（`evals/benchmark/RESULTS.md`）表明：对前沿模型，
仅 working agreement 一份文档就在停下纪律上与完整的 v0.7 治理运行时打平
（相对裸模型 +65pp），token 成本只有三分之一；而运行时没有带来能力增益。
所以 loopx 交付文档本身，以及让文档保持诚实的证据流水线：`evals/drills/`
对每条纪律条款做压力测试，`evals/benchmark/` 对照裸模型与 docs-only 对照组
度量通过率与 token 经济。

## 安装

```bash
npm install -g @ai-content-space/loopx
loopx install-skills --target all --yes
loopx doctor
```

先预览将要安装的文件：

```bash
loopx install-skills --target all --dry-run
```

完整 CLI 与安装细节见 [CLI Reference](./docs/loopx/cli.zh-CN.md)。

## 在 Agent 中使用

```text
$clarify <ambiguous-request>
$spec <decision-heavy-change>
$plan2exec <approved-source-or-planning-request>
```

其余一切都是 working agreement 之下的普通模型工作。每次完成声明都需要新鲜
验证；高风险 diff 的独立评审是 working agreement 的条款，由宿主原生 subagent
执行。

## 上下文规则

`docs/loopx/specs/` 保存长期有效、具有约束力的 repo context。
`docs/loopx/decisions/docs-first-pivot.md` 记录当前架构决策。
`docs/archive/` 只保存历史，不属于当前权威，并从默认检索中排除。
`.loopx/memory/MEMORY.md` 是建议性的 curated memory。当前用户指令和已批准的
source documents 优先级更高。

## 维护者

发布前运行确定性治理门：

```bash
node scripts/verify-skills.mjs
```

Package 与 plugin manifest 版本跟随 npm 发布。Skill `metadata.version` 独立，
只在内容或行为契约变化的 skill 上递增。
