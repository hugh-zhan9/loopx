# loopx

[English](./README.md)

`loopx` 是一个面向 Codex 的 skill-first 工作流工具包。它把需求澄清、共识规划、持久执行、独立评审组织成一条可追踪的本地工作流，并通过 CLI 与 Codex Skill 两种方式暴露同一套运行时。

当前公开流程：

```text
clarify -> plan -> build -> review
```

评审通过并进入 `done` 后，可以执行 archive，把本次被接受的 change delta 合并到长期 specs。

其中 `autopilot` 是端到端编排入口，会在内部复用这套公开阶段，而不是引入另一套流程真相。

## 特性

- 安装并公开 11 个 loopx Codex skills：工作流 skills `clarify`、`plan`、`build`、`review`、`archive`、`autopilot`，质量辅助 skills `debug`、`tdd`、`verify`，以及 Go 支持 skills `go-style`、`kratos`。
- 支持 npm 全局安装和 Codex plugin 安装，两种安装方式共享同一套 install/discovery 逻辑。
- 所有运行时状态和阶段产物都写入项目本地 `.loopx/`，便于审计、恢复和迁移。
- `plan` 默认采用 Planner -> Architect -> Critic 的共识规划循环。
- `plan` 会写入借鉴 OpenSpec 的 change artifacts：proposal、spec delta、design、tasks 和 artifact dependency graph。
- `build` 默认包含执行记录、验证证据、架构验收、deslop 清理和回归再验证。
- `review` 作为独立验收面，输出中文评审结论和 go/no-go 判断。
- 支持 `archive`，把已批准的 change delta 同步进长期 `.loopx/specs/` source of truth。
- 支持从旧 `.codex-helper/` 运行时迁移到 `.loopx/`。

## 安装

### npm 全局安装

```bash
npm install -g @ai-content-space/loopx
```

安装后会自动运行：

```bash
node scripts/install-skills.mjs
```

该脚本会把 loopx 管理的 skills 安装到：

```text
~/.agents/skills/
```

并更新：

```text
~/.agents/.skill-lock.json
```

### Codex plugin 安装

插件入口位于：

```text
plugins/loopx/
```

插件安装脚本：

```bash
node plugins/loopx/scripts/plugin-install.mjs
```

npm 安装和 plugin 安装会收敛到同一个 `installationIdentity=loopx`，避免 Codex 里出现重复的 loopx skill 集合。

## 快速开始

初始化一个工作流：

```bash
loopx init --slug my-task
```

进入澄清阶段：

```bash
loopx clarify my-task
```

澄清完成后批准进入计划阶段：

```bash
loopx approve my-task --from clarify --to plan
loopx plan my-task
```

计划完成后批准执行：

```bash
loopx approve my-task --from plan --to build
loopx build my-task
```

执行完成后进入评审：

```bash
loopx approve my-task --from build --to review
loopx review my-task
```

评审通过后完成工作流：

```bash
loopx approve my-task --from review --to done
loopx review my-task
```

把已接受行为归档到长期 specs：

```text
$archive my-task
```

查看状态：

```bash
loopx status my-task
loopx status my-task --json
```

也可以让 loopx 根据一个现成 spec 直接创建规划工作流：

```bash
loopx plan --direct ./path/to/spec.md
```

## CLI 命令

```bash
loopx init [--slug <slug>]
loopx clarify <slug> [--standard|--deep]
loopx approve <slug> --from <stage> --to <stage>
loopx plan [slug] [--direct <spec-path>] [--interactive] [--deliberate]
loopx build <slug> [--no-deslop]
loopx review <slug> [--reviewer <name>]
loopx archive <slug>
loopx autopilot <slug> [--reviewer <name>]
loopx status [slug] [--json]
loopx doctor
loopx migrate
loopx repair-install
```

CLI 主要用于运行时、调试、状态观察和维护。日常面向 Codex 的主入口是同名 skills，例如 `$clarify`、`$plan`、`$build`、`$review`、`$archive`、`$autopilot`、`$debug`、`$tdd`、`$verify`、`$go-style`、`$kratos`。

`loopx status` 仍然是 CLI/runtime 诊断命令，不作为单独 Codex skill 暴露。

## Skill 说明

### clarify

`clarify` 用于把模糊请求转成可执行 spec。它会维护歧义分数、非目标、决策边界和压力测试结果。只有满足门禁后，才建议进入 `plan`。

默认 profile：

- `--standard`：目标歧义分数 `<= 0.20`，最多 `15` 轮。
- `--deep`：目标歧义分数 `<= 0.10`，最多 `25` 轮。

### plan

`plan` 把已批准的 clarify spec 或直接输入的 spec 转成计划包。默认包含 Planner、Architect、Critic 三段式评审循环，最多迭代到通过或达到上限。

主要产物：

- `.loopx/plans/prd-<slug>.md`
- `.loopx/plans/test-spec-<slug>.md`
- `.loopx/changes/active/<change-id>/proposal.md`
- `.loopx/changes/active/<change-id>/spec-delta.md`
- `.loopx/changes/active/<change-id>/design.md`
- `.loopx/changes/active/<change-id>/tasks.md`
- `.loopx/changes/active/<change-id>/artifact-graph.json`
- `.loopx/workflows/<slug>/plan.md`
- `.loopx/workflows/<slug>/architecture.md`
- `.loopx/workflows/<slug>/development-plan.md`
- `.loopx/workflows/<slug>/test-plan.md`

### build

`build` 执行已批准的计划，并把执行过程、验证证据和限制记录到 canonical artifact：

```text
.loopx/workflows/<slug>/execution-record.md
```

默认流程包含 deslop 清理；如果确实要跳过，可以使用：

```bash
loopx build <slug> --no-deslop
```

### review

`review` 消费 build 输出的 `execution-record.md`，执行独立验收和代码评审，并生成：

```text
.loopx/workflows/<slug>/review-report.md
```

最终用户可见评审结果要求使用中文。

如果评审通过，仍然需要显式批准 `review -> done`。如果评审要求修改，则批准 `review -> plan` 后再次运行 `loopx review <slug>` 来消费回退转换。

### archive

`archive` 消费已完成工作流，并把 `.loopx/changes/active/<change-id>/spec-delta.md` 合并进 `.loopx/specs/` 下的长期领域规格。归档后的 change 目录会移动到：

```text
.loopx/changes/archive/<change-id>/
```

### autopilot

`autopilot` 是端到端编排入口，会在内部组织 expansion、planning、execution、qa、validation 等阶段，但 canonical artifact 仍然来自公开的 `clarify -> plan -> build -> review` 流程。

自动编排 ledger 写入：

```text
.loopx/autopilot/<slug>/run.json
```

### debug

`debug` 是用于 bug、测试失败、回归和异常行为的质量辅助 skill。它要求先完成根因调查，再进入模式对比、假设验证和修复实现，避免直接猜测式打补丁。

### tdd

`tdd` 是用于功能开发和 bug 修复的质量辅助 skill。它要求先写失败测试，确认失败原因正确，再实现最小可通过改动。

### verify

`verify` 是用于最终完成声明前的质量辅助 skill。它要求在声称完成、修好、测试通过、可提交或可评审之前，先运行 fresh verification 并读取真实输出。

### go-style

`go-style` 是 Go 语言支持 skill。它用于指导 `.go` 文件编辑，强调 idiomatic Go、保留项目本地风格、清晰错误处理、小接口、表驱动测试，以及 `gofmt` 和 Go 验证。

### kratos

`kratos` 是 Go-Kratos 框架支持 skill。当项目出现 `buf.yaml`、proto API、`internal/service`、`internal/biz`、`internal/data` 或 `github.com/go-kratos/kratos/v2` 等信号时使用，并提供 proto 设计、分层架构、配置、中间件、认证、HTTP 定制和排错参考。

## 运行时目录

loopx 在当前项目下写入 `.loopx/`：

```text
.loopx/
  README.md
  config.json
  specs/
    <domain>/
      spec.md
  changes/
    active/
      <change-id>/
        proposal.md
        spec-delta.md
        design.md
        tasks.md
        artifact-graph.json
    archive/
      <change-id>/
  plans/
  context/
  workflows/
    <slug>/
      state.json
      spec.md
      plan.md
      architecture.md
      development-plan.md
      test-plan.md
      execution-record.md
      review-report.md
      plan-reviews/
      build-support/
  autopilot/
    <slug>/
      run.json
```

旧的 `.codex-helper/` 可通过 `loopx migrate` 迁移。`.omx/` 仍保留为外部编排/规划元数据，不属于 loopx 运行时命名空间。

## 安装诊断与修复

检查运行时和 skill 安装状态：

```bash
loopx doctor
```

修复 loopx 管理的 skill 安装：

```bash
loopx repair-install
```

只检查当前 skill discovery 状态：

```bash
node scripts/install-skills.mjs --check
```

## Codex Stop Hook

loopx 内置一个 Codex stop-hook 辅助脚本，用于防止活跃 build 在达到 review handoff 之前提前停止：

```bash
node scripts/codex-stop-hook.mjs
```

`loopx build` 运行期间会写入持久状态：

```text
.loopx/build-active.json
```

如果状态显示 build 仍处于 `starting`、`executing`、`verifying` 或 `fixing`，hook 会返回 `allow: false` 和继续执行提示。只有 build 已经 `review-ready`、被真实 blocker 阻塞、失败、取消或不活跃时，hook 才允许停止。

## 环境变量

安装和 discovery 逻辑支持以下环境变量：

- `LOOPX_HOME`：覆盖默认 home 目录。
- `LOOPX_AGENTS_ROOT`：覆盖 `.agents` 根目录。
- `LOOPX_SKILLS_ROOT`：覆盖已安装 skills 目录。
- `LOOPX_SKILL_LOCK_PATH`：覆盖 skill lock 文件路径。
- `LOOPX_PROJECT_ROOT`：覆盖 loopx 项目根目录。
- `LOOPX_SKILL_SOURCE_ROOT`：覆盖 skill 源目录。
- `LOOPX_DISTRIBUTION_CHANNEL`：设置安装渠道，默认 `npm`。
- `LOOPX_INSTALLATION_IDENTITY`：设置安装身份，默认 `loopx`。
- `LOOPX_SOURCE_URL`：设置安装来源。

## 开发

安装依赖后运行测试：

```bash
npm test
```

也可以直接执行项目内的验证命令：

```bash
node --test test/*.test.mjs
node scripts/install-skills.mjs --check
node --test plugins/loopx/scripts/plugin-install.test.mjs
node src/cli.mjs --help
node src/cli.mjs doctor
node src/cli.mjs status --json
```

## 发布内容

`package.json` 的 `files` 字段会发布以下内容：

- `README.md`
- `README.zh-CN.md`
- `package.json`
- `scripts/install-skills.mjs`
- `scripts/codex-stop-hook.mjs`
- `src/`
- `skills/`，包含公开 loopx skills 以及随包发布的兼容/内部 skill 源文件
- `templates/`
- `plugins/loopx/`

## 版本

当前 npm 包版本：`0.1.2`。
