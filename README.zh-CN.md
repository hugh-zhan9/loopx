<p align="center">
  <img src="./assets/logo.svg" alt="loopx fox logo" width="128" height="128">
</p>

<h1 align="center">loopx</h1>

<p align="center">
  面向 Codex 的 skill-first 工作流运行时。
</p>

[English](./README.md)

`loopx` 是一个面向 Codex 的 skill-first 工作流工具包。它把需求澄清、共识规划、持久执行、独立评审组织成一条可追踪的本地工作流，并通过 CLI 与 Codex Skill 两种方式暴露同一套运行时。

当前公开流程：

```text
clarify -> plan -> build -> review -> approve review->done -> archive
```

`done` 是通过 `loopx approve <slug> --from review --to done` 进入的运行时完成状态，不是单独的 Codex skill。

评审通过并进入 `done` 后，可以执行 archive，把本次被接受的 change delta 合并到长期 specs。

其中 `autopilot` 是端到端编排入口，会在内部复用这套公开阶段，而不是引入另一套流程真相。

## 特性

- 安装并公开 11 个 loopx Codex skills：工作流 skills `clarify`、`plan`、`build`、`review`、`archive`、`autopilot`，质量辅助 skills `debug`、`tdd`、`verify`，以及 Go 支持 skills `go-style`、`kratos`。
- 通过 `skills/RESOLVER.md` 明确 bundled skill 路由，并用确定性治理脚本检查 frontmatter、plugin 镜像、resolver 覆盖、本地引用、发布包包含项和版本一致性。
- 支持 npm 全局安装和 Codex plugin 安装，两种安装方式共享同一套 install/discovery 逻辑。
- 自动安装 loopx 管理的 Codex workflow hook，在 Codex 中提示当前 workflow 状态和安全下一步。
- 所有运行时状态和阶段产物都写入项目本地 `.loopx/`，便于审计、恢复和迁移。
- clarify 需求快照写入 `.loopx/intake/`，让 `.loopx/specs/` 只承载长期领域规格。
- init 时会把已有项目 AI 规则、既有 spec 来源和自动发现的验证命令记录到 `.loopx/config.json`，让 loopx 保留项目原有事实源，同时继续执行完整闭环。
- `plan` 默认采用 Planner -> Architect -> Critic 的共识规划循环。
- `plan` 会写入借鉴 OpenSpec 的 change artifacts：proposal、spec delta、design、tasks 和 artifact dependency graph。
- 提供项目级 agent context：`.loopx/agents/` 和 `.loopx/context/domain.md`，供 build/review 的 context manifest 消费。
- `build` 默认包含执行记录、验证证据、架构验收、deslop 清理和回归再验证。
- `review` 作为独立验收面，包含代码审查和内部 architecture-smell lane，并输出中文评审结论和 go/no-go 判断。
- 支持 `archive`，把已批准的 change delta 同步进长期 `.loopx/specs/` source of truth，并生成 ADR candidate。

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

同时也会把 loopx 管理的 Codex workflow hook 安装到：

```text
~/.codex/hooks/codex-workflow-hook.mjs
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

把已接受行为归档到长期 specs：

```text
$archive my-task
```

当 review 已批准并路由到 `done` 时，`$archive` 会先消费 pending 的 `review -> done` 完成态，再同步 specs。纯 CLI 操作者仍然可以显式执行 `loopx approve my-task --from review --to done`，再执行 `loopx archive my-task`。

查看状态：

```bash
loopx status my-task
loopx status my-task --json
```

plan 完成后会自动写入派生 HTML 阅读视图，方便直接审阅计划：

```text
.loopx/workflows/my-task/view/index.html
.loopx/workflows/my-task/view/plan.html
.loopx/views/index.html
```

需要时也可以重新生成派生 HTML 阅读视图：

```bash
loopx render my-task
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

CLI 主要用于运行时、调试、状态观察和维护。日常面向 Codex 的主入口是同名 skills，例如 `$clarify`、`$plan`、`$build`、`$review`、`$archive`、`$autopilot`、`$debug`、`$tdd`、`$verify`、`$go-style`、`$kratos`。

`loopx status` 仍然是 CLI/runtime 诊断命令，不作为单独 Codex skill 暴露。`loopx plan` 会自动为当前计划 workflow 和工作区首页写入给人阅读的 HTML 视图。`loopx render` 会基于现有运行时产物重新生成这些视图；不传 slug 时会渲染所有非 legacy workflow 和工作区首页。Markdown 和 JSON 仍然是机器可读、可编辑的事实源。

## Skill 路由与治理

bundled skill resolver 位于：

```text
skills/RESOLVER.md
```

它是 11 个 bundled skills 的可读路由表。修改任一 `skills/<name>/SKILL.md` 或镜像的 `plugins/loopx/skills/<name>/SKILL.md` 时，都要保持 resolver 同步。

skill 治理由下面的确定性脚本执行：

```bash
node scripts/verify-skills.mjs
```

该脚本会检查 bundled skill frontmatter 是否可触发且有排除边界、`metadata.version` 是否匹配 `package.json`、plugin skill 镜像是否与 canonical skills 一致、`skills/RESOLVER.md` 是否覆盖所有 bundled skills 且没有陈旧 bundled-skill 引用、本地 skill 引用是否存在、plugin manifest 版本是否匹配 package 版本，以及 verifier 本身是否进入 npm 发布包。

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
- `.loopx/changes/active/<change-id>/slices.json`
- `.loopx/changes/active/<change-id>/artifact-graph.json`
- `.loopx/workflows/<slug>/plan.md`
- `.loopx/workflows/<slug>/architecture.md`
- `.loopx/workflows/<slug>/development-plan.md`
- `.loopx/workflows/<slug>/test-plan.md`
- `.loopx/workflows/<slug>/requirement-traceability.md`
- `.loopx/workflows/<slug>/plan-delegation-decision.md`

plan 成功后，loopx 还会写入派生阅读视图：`.loopx/workflows/<slug>/view/index.html`、`.loopx/workflows/<slug>/view/plan.html` 和 `.loopx/views/index.html`。这些视图用于人工审阅；Markdown 和 JSON 仍然是可编辑事实源。

`requirement-traceability.md` 会把原始需求或 PRD 映射到生成的 plan package、change delta、vertical slices 和测试。若显式需求覆盖项或需求表格项没有被计划包覆盖，`plan` 会在 build approval 前保持 blocked。

`plan-delegation-decision.md` 会记录规划阶段应保持本地顺序审阅，还是需要更强的 critic/parallel-review 深度。决策依据包括风险、范围、状态/数据完整性、验证复杂度和架构取舍；缺少委派依据会阻塞 build handoff。

`spec-delta.md` 使用 requirement delta：`## ADDED Requirements`、`## MODIFIED Requirements`、`## REMOVED Requirements` 和 `## RENAMED Requirements`。ADDED / MODIFIED 必须是完整的 `### Requirement:` 块，包含 SHALL/MUST 约束和 `#### Scenario:` 场景，archive 才能把它们合并进长期 spec 当前状态。

### build

`build` 执行已批准的计划，并把执行过程、验证证据和限制记录到 canonical artifact：

```text
.loopx/workflows/<slug>/execution-record.md
```

`build` 内部保留结构化 runtime lanes，同时增加 Ralph-like owner loop：单一 owner 持续推进，可并行 delegation，但进入 review handoff 前必须满足 blocking delegation 已 drain，并通过 completion audit。相关运行态证据写入：

```text
.loopx/workflows/<slug>/build-support/delegation-ledger.json
.loopx/workflows/<slug>/build-support/completion-audit.json
```

这些仍然是 build 支撑证据，不替代 `execution-record.md`。

默认流程包含 deslop 清理；如果确实要跳过，可以使用：

```bash
loopx build <slug> --no-deslop
```

当 review 要求修实现问题时，Codex 侧的正常回路把 review artifact 作为本轮返工合同：

```text
$build --from-review .loopx/workflows/<slug>/review-report.md
```

已批准 PRD、test spec、上次 `execution-record.md` 和 workflow-local plan package 仍会作为支撑上下文加载，但不再让用户把 PRD 当成本轮返工的主参数。

### review

`review` 消费 build 输出的 `execution-record.md`，执行独立验收、代码评审和轻量 architecture-smell lane，并生成：

```text
.loopx/workflows/<slug>/review-report.md
```

最终用户可见评审结果要求使用中文。

如果评审通过并路由到 `done`，Codex 侧的正常下一步是 `$archive <slug>`；archive 会消费 pending 的完成态，然后同步 specs。纯 CLI 操作者仍然可以先显式执行 `loopx approve <slug> --from review --to done`，再执行 `loopx archive <slug>`。如果评审要求修实现问题，则运行 `$build --from-review .loopx/workflows/<slug>/review-report.md`。只有当 review 明确指出计划或需求本身错误时，才回到 `$plan <slug>` 或 `$clarify <slug>`。

architecture-smell lane 是 review 的一部分，不会增加新阶段。它会把发现记录到 `review-support/architecture-smell.json`，只有当模块边界、可测试性、领域词汇或计划架构假设存在实质性错误时才阻断。

### archive

`archive` 消费已完成工作流，或 review 已批准且唯一 pending route 是 `done` 的工作流，并把 `.loopx/changes/active/<change-id>/spec-delta.md` 合并进 `.loopx/specs/` 下的长期领域规格。归档后的 change 目录会移动到：

```text
.loopx/changes/archive/<change-id>/
```

Archive 还会在 `.loopx/decisions/adr-candidates/<change-id>.md` 写入建议性 ADR candidate，不会自动提升到 `docs/adr/`。

Archive 现在按语义应用 requirement delta，而不是追加每次 change 的历史块。ADDED 新增 requirement，MODIFIED 替换完整 requirement 块，REMOVED 删除 requirement，RENAMED 只修改 requirement 标题并保留正文。

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
  intake/
    clarify-<slug>-<timestamp>.md
  views/
    index.html
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
        slices.json
        artifact-graph.json
    archive/
      <change-id>/
  decisions/
    adr-candidates/
  plans/
  agents/
    issue-tracker.md
    domain.md
    triage-labels.md
  context/
    domain.md
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
      view/
        index.html
        intake.html
        plan.html
        build.html
        review.html
      plan-reviews/
      build-support/
      review-support/
  autopilot/
    <slug>/
      run.json
```

`config.json` 记录 loopx 产品契约和 init 时的项目发现结果：已有 AI 规则文件，例如 `AGENTS.md`、`CLAUDE.md`、Cursor / Copilot 规则；已有 spec 来源，例如 `docs/changes`、ADR/RFC 目录；以及自动发现的 install/test/lint/typecheck/build/E2E 命令。这不会引入轻量版 loopx；它只是让 `plan`、`build`、`review` 能看到项目事实，同时保持完整闭环。

`intake` 保存一次需求的 clarify 快照；`workflows` 保存当前任务的运行时工作副本；`changes` 保存本次需求对长期行为的 change delta；`specs` 只保存 archive 后的长期领域行为契约。

`views/` 和 `workflows/<slug>/view/` 是 plan 后写入、也可由 `loopx render` 重新生成的派生 HTML 阅读视图，只服务于人的浏览和评审；agent 和工具仍应读取、修改 Markdown 与 JSON 产物。

### 文档关注边界

用户日常需要关注的文档：

- `README.md` / `README.zh-CN.md`：产品用法、命令和目录约定。
- `.loopx/workflows/<slug>/spec.md`：当前需求工作副本。
- `.loopx/workflows/<slug>/plan.md`、`architecture.md`、`development-plan.md`、`test-plan.md`：当前任务的计划、架构和验证约定。
- `.loopx/workflows/<slug>/requirement-traceability.md`：plan、build、review 都会消费的原始需求覆盖门禁。
- `.loopx/workflows/<slug>/plan-delegation-decision.md`：记录 local / critic-only / parallel-review 规划委派依据。
- `.loopx/workflows/<slug>/execution-record.md`、`review-report.md`：执行证据和评审结论。
- `.loopx/views/index.html` 与 `.loopx/workflows/<slug>/view/index.html`：plan 后写入、也可由 `loopx render` 重新生成的阅读入口。

用户可以阅读和按流程修改的事实源文档：

- `.loopx/workflows/<slug>/*.md`：当前 workflow 的可编辑工作副本；修改后仍需通过对应阶段门禁。
- `.loopx/config.json`：workspace 配置、项目规则/spec 来源发现结果和默认验证命令；当仓库的 canonical 命令或规则文件变化时可以更新。
- `.loopx/context/domain.md` 和 `.loopx/agents/*.md`：项目级背景、术语和 agent 协作约定。
- `.loopx/changes/active/<change-id>/*.md`：plan 生成的 change proposal、design、tasks 和 spec delta；修改后应重新过 plan/build/review。
- `.loopx/specs/<domain>/spec.md`：archive 后的长期行为规格；通常由 `archive` 同步，人工改动需要保持和后续 change delta 一致。

工具运行依赖或派生的文档/数据：

- `.loopx/workflows/<slug>/state.json`、`build-context.jsonl`、`review-context.jsonl`：运行时状态和 context manifest，工具依赖，不建议手改。
- `.loopx/workflows/<slug>/plan-reviews/`、`build-support/`、`review-support/`：阶段证据和内部审查结果，供诊断和 review 使用。
- `.loopx/intake/clarify-*.md`：clarify 快照，用于审计和追溯；不要当作长期 specs 修改。
- `.loopx/changes/active/<change-id>/slices.json`、`artifact-graph.json`：计划结构化数据，build/review/archive 会消费。
- `.loopx/autopilot/<slug>/run.json`、`.loopx/build-active.json`：编排和 stop-hook 运行态。
- `.loopx/views/` 和 `.loopx/workflows/<slug>/view/`：HTML 派生视图，plan 后自动写入，可删除后用 `loopx render` 重新生成，不应作为事实源编辑。

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

检查 bundled skill 治理状态：

```bash
node scripts/verify-skills.mjs
```

## Codex Workflow Hook

`install-skills.mjs` 和 Codex plugin 安装脚本会自动把 `scripts/codex-workflow-hook.mjs` 安装到：

```text
~/.codex/hooks/codex-workflow-hook.mjs
```

该 hook 会读取最近的 `.loopx/workflows/<slug>/state.json`，为当前 workflow 输出建议性上下文：当前阶段、blockers、readiness、authorization、evidence 和安全下一步。它只提供提示；真正的运行时门禁仍以 loopx runtime 为准。

设置 `LOOPX_HOOKS=0` 可以关闭 workflow hook 输出。

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
- `LOOPX_HOOKS`：设置为 `0` 时关闭 workflow hook 输出。

## 开发

安装依赖后运行测试：

```bash
npm test
```

`npm test` 会先运行 bundled skill 治理检查，再运行 Node 测试套件：

```bash
node scripts/verify-skills.mjs
node --test test/*.test.mjs
```

也可以直接执行项目内的验证命令：

```bash
node scripts/verify-skills.mjs
node --test test/*.test.mjs
node scripts/install-skills.mjs --check
node --test plugins/loopx/scripts/plugin-install.test.mjs
node src/cli.mjs --help
node src/cli.mjs --version
node src/cli.mjs doctor
node src/cli.mjs status --json
```

## 发布内容

`package.json` 的 `files` 字段会发布以下内容：

- `README.md`
- `README.zh-CN.md`
- `package.json`
- `scripts/install-skills.mjs`
- `scripts/verify-skills.mjs`
- `scripts/codex-stop-hook.mjs`
- `scripts/codex-workflow-hook.mjs`
- `assets/logo.svg`
- `src/`
- `skills/`，包含公开 loopx skills 以及随包发布的兼容/内部 skill 源文件
- `templates/`
- `plugins/loopx/`

## 版本

当前 npm 包版本：`0.1.10`。
