<p align="center">
  <img src="./assets/logo.svg" alt="loopx fox logo" width="128" height="128">
</p>

<h1 align="center">loopx</h1>

<p align="center">
  Skill-first workflow runtime for Codex.
</p>

[中文文档](./README.zh-CN.md)

`loopx` is a skill-first workflow toolkit for Codex. It organizes clarification, consensus planning, persistent execution, and independent review into a local, auditable workflow exposed through both a CLI and Codex Skills.

Current public flow:

```text
clarify -> plan -> build -> review -> approve review->done -> archive
```

`done` is a runtime completion state reached by `loopx approve <slug> --from review --to done`, not a separate Codex skill.

`autopilot` is the end-to-end orchestration entrypoint. Internally it reuses the public flow instead of creating a second source of workflow truth.

## Features

- Installs and exposes eleven bundled loopx Codex skills: workflow skills `clarify`, `plan`, `build`, `review`, `archive`, and `autopilot`; quality support skills `debug`, `tdd`, and `verify`; and Go support skills `go-style` and `kratos`.
- Keeps bundled skill routing explicit in `skills/RESOLVER.md`, with deterministic governance checks for frontmatter, plugin mirrors, resolver coverage, local references, package inclusion, and version alignment.
- Supports npm global install and Codex plugin install through the same install/discovery core.
- Installs a managed Codex workflow hook that surfaces loopx workflow state and safe next-action hints inside Codex.
- Stores runtime state and stage artifacts locally under `.loopx/` for auditability, recovery, and migration.
- Stores clarify intake snapshots under `.loopx/intake/` so `.loopx/specs/` stays reserved for long-lived domain specs.
- Records existing project AI rule files, existing spec sources, and detected verification commands in `.loopx/config.json` during init so loopx can preserve local sources of truth while still running the full workflow.
- Runs `plan` with a Planner -> Architect -> Critic consensus loop by default.
- Writes OpenSpec-inspired change artifacts during `plan`: proposal, spec delta, design, vertical slices, tasks, and an artifact dependency graph.
- Provides per-repo agent context under `.loopx/agents/` and `.loopx/context/domain.md`, consumed by build/review context manifests.
- Runs `build` with execution records, verification evidence, architect validation, deslop cleanup, and regression re-verification.
- Keeps `review` as an independent acceptance surface with code review plus an internal architecture-smell lane.
- Supports `archive` to sync approved change deltas into long-lived `.loopx/specs/` source-of-truth files and emit ADR candidates.

## Installation

### npm Global Install

```bash
npm install -g @ai-content-space/loopx
```

Installation automatically runs:

```bash
node scripts/install-skills.mjs
```

The script materializes loopx-owned skills under:

```text
~/.agents/skills/
```

It also installs the loopx-managed Codex workflow hook at:

```text
~/.codex/hooks/codex-workflow-hook.mjs
```

and updates:

```text
~/.agents/.skill-lock.json
```

### Codex Plugin Install

The plugin shell lives at:

```text
plugins/loopx/
```

Plugin install script:

```bash
node plugins/loopx/scripts/plugin-install.mjs
```

npm and plugin installs converge on the same `installationIdentity=loopx`, so Codex should expose one loopx skill set rather than duplicates.

## Quick Start

Initialize a workflow:

```bash
loopx init --slug my-task
```

Run clarification:

```bash
loopx clarify my-task
```

Approve and run planning:

```bash
loopx approve my-task --from clarify --to plan
loopx plan my-task
```

Approve and run execution:

```bash
loopx approve my-task --from plan --to build
loopx build my-task
```

Approve and run review:

```bash
loopx approve my-task --from build --to review
loopx review my-task
```

Archive accepted behavior into long-lived specs:

```text
$archive my-task
```

When review has approved the workflow and routed it to `done`, `$archive` consumes the pending `review -> done` completion transition before syncing specs. CLI-only operators can still run `loopx approve my-task --from review --to done` followed by `loopx archive my-task` explicitly.

Check status:

```bash
loopx status my-task
loopx status my-task --json
```

Planning also writes derived HTML reading views so the plan can be reviewed without another command:

```text
.loopx/workflows/my-task/view/index.html
.loopx/workflows/my-task/view/plan.html
.loopx/views/index.html
```

Regenerate derived HTML reading views at any time:

```bash
loopx render my-task
```

You can also create a planning workflow directly from an existing spec:

```bash
loopx plan --direct ./path/to/spec.md
```

## CLI Commands

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

The CLI is primarily for runtime, debugging, status inspection, and maintenance. The normal Codex-facing product surface is the bundled skill set, for example `$clarify`, `$plan`, `$build`, `$review`, `$archive`, `$autopilot`, `$debug`, `$tdd`, `$verify`, `$go-style`, and `$kratos`.

`loopx status` remains a CLI/runtime diagnostic command rather than a Codex skill. `loopx plan` automatically writes human-readable HTML views for the planned workflow and workspace index. `loopx render` regenerates those views from existing runtime artifacts; without a slug it renders every non-legacy workflow plus the workspace index. Markdown and JSON remain the canonical machine-readable and editable sources.

## Skill Routing and Governance

The bundled skill resolver lives at:

```text
skills/RESOLVER.md
```

It is the human-readable routing map for the eleven bundled skills. Keep it aligned with each `skills/<name>/SKILL.md` and mirrored `plugins/loopx/skills/<name>/SKILL.md`.

Skill governance is enforced by:

```bash
node scripts/verify-skills.mjs
```

The verifier checks that bundled skill frontmatter is triggerable and bounded, `metadata.version` matches `package.json`, plugin skill mirrors match the canonical skills, `skills/RESOLVER.md` covers every bundled skill without stale bundled-skill references, local skill references exist, the plugin manifest version matches the package version, and the verifier itself is included in the npm package.

## Skills

### clarify

`clarify` turns an ambiguous request into an execution-ready spec. It tracks ambiguity score, non-goals, decision boundaries, and pressure-pass completion. It only recommends handoff to `plan` after the runtime gates are satisfied.

Profiles:

- `--standard`: target ambiguity score `<= 0.20`, up to `15` rounds.
- `--deep`: target ambiguity score `<= 0.10`, up to `25` rounds.

### plan

`plan` turns an approved clarify spec, or a directly supplied spec, into a reviewed plan package. By default it runs the Planner, Architect, and Critic review loop until approval or the iteration cap is reached.

Main artifacts:

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

After a successful plan run, loopx also writes derived reading views at `.loopx/workflows/<slug>/view/index.html`, `.loopx/workflows/<slug>/view/plan.html`, and `.loopx/views/index.html`. Use these for human review; keep Markdown and JSON as the editable sources of truth.

`requirement-traceability.md` maps the original source requirements or PRD to the generated plan package, change delta, vertical slices, and tests. If explicit source coverage items or source requirement tables are not covered by the plan package, `plan` stays blocked before build approval.

`spec-delta.md` uses requirement deltas: `## ADDED Requirements`, `## MODIFIED Requirements`, `## REMOVED Requirements`, and `## RENAMED Requirements`. ADDED and MODIFIED entries are full `### Requirement:` blocks with SHALL/MUST language and `#### Scenario:` examples, so archive can merge them into the current long-lived spec state.

### build

`build` executes an approved plan and records changes, evidence, and limitations in the canonical artifact:

```text
.loopx/workflows/<slug>/execution-record.md
```

Deslop cleanup is enabled by default. To skip it explicitly:

```bash
loopx build <slug> --no-deslop
```

When review requests implementation changes, the normal Codex-facing handoff uses the review artifact as the direct rework contract:

```text
$build --from-review .loopx/workflows/<slug>/review-report.md
```

The approved PRD, test spec, previous execution record, and workflow-local plan package remain supporting context.

### review

`review` consumes the build `execution-record.md`, runs independent acceptance, code review, and a lightweight architecture-smell lane, and generates:

```text
.loopx/workflows/<slug>/review-report.md
```

The user-facing review result is expected to be written in Chinese.

If review approves the run and routes it to `done`, the normal Codex-facing next step is `$archive <slug>`; archive consumes the pending completion transition and then syncs specs. CLI-only operators may still explicitly run `loopx approve <slug> --from review --to done` before `loopx archive <slug>`. If review requests implementation changes, run `$build --from-review .loopx/workflows/<slug>/review-report.md`. Plan and clarify rollbacks still use `$plan <slug>` or `$clarify <slug>` when the review finding says the plan or requirements are wrong.

The architecture-smell lane is part of review; it does not add a new stage. It records findings under `review-support/architecture-smell.json` and only blocks when module seams, testability, domain vocabulary, or plan architecture assumptions are materially wrong.

### archive

`archive` consumes a completed workflow, or a review-approved workflow whose only pending route is `done`, and syncs the approved `.loopx/changes/active/<change-id>/spec-delta.md` into long-lived domain specs under `.loopx/specs/`. The change folder is moved to:

```text
.loopx/changes/archive/<change-id>/
```

Archive also writes an advisory ADR candidate under `.loopx/decisions/adr-candidates/<change-id>.md`. It is not promoted to `docs/adr/` automatically.

Archive applies requirement deltas semantically instead of appending per-change history blocks. ADDED creates requirements, MODIFIED replaces a full existing requirement block, REMOVED deletes a requirement, and RENAMED changes the requirement title while preserving its body.

### autopilot

`autopilot` is the end-to-end orchestration entrypoint. It may run internal phases such as expansion, planning, execution, QA, and validation, but canonical artifacts still come from the public `clarify -> plan -> build -> review` flow.

The orchestration ledger is written to:

```text
.loopx/autopilot/<slug>/run.json
```

### debug

`debug` is a quality support skill for bugs, failures, regressions, and unexpected behavior. It requires root-cause investigation before proposing fixes, then moves through pattern analysis, hypothesis testing, and implementation.

### tdd

`tdd` is a quality support skill for feature work and bug fixes. It requires writing a failing test first, confirming the failure is meaningful, then implementing the smallest change needed to pass.

### verify

`verify` is a quality support skill for final claims. It requires fresh verification evidence before saying work is complete, fixed, passing, ready to commit, or ready for review.

### go-style

`go-style` is a Go language support skill. It guides `.go` edits toward idiomatic structure, local project conventions, clear error handling, small interfaces, table-driven tests, and `gofmt`/Go verification.

### kratos

`kratos` is a Go-Kratos framework support skill. It applies when a project uses Kratos signals such as `buf.yaml`, proto APIs, `internal/service`, `internal/biz`, `internal/data`, or `github.com/go-kratos/kratos/v2`, and includes focused references for proto design, layered architecture, config, middleware, auth, HTTP customization, and troubleshooting.

## Runtime Layout

loopx writes runtime state under `.loopx/` in the current project:

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

`config.json` records the loopx product contract plus init-time project discovery: existing AI rules such as `AGENTS.md` / `CLAUDE.md` / Cursor / Copilot files, existing spec sources such as `docs/changes` or ADR/RFC folders, and detected install/test/lint/typecheck/build/E2E commands. This does not create a lighter loopx mode; it keeps project facts available to `plan`, `build`, and `review` while preserving loopx's full closed workflow.

`intake` contains immutable clarify snapshots for a specific request. `workflows` contains the active runtime working set. `changes` contains the proposed change delta for the current request. `specs` contains accepted long-lived behavior after archive.

`views/` and `workflows/<slug>/view/` are derived HTML reading views written after `plan` and regenerated by `loopx render`. They are for human review only and are safe to regenerate; agents and tooling should continue to read and update the Markdown and JSON artifacts.

### Document Boundaries

Documents users normally need to watch:

- `README.md` / `README.zh-CN.md`: product usage, commands, and runtime layout.
- `.loopx/workflows/<slug>/spec.md`: the current requirement working copy.
- `.loopx/workflows/<slug>/plan.md`, `architecture.md`, `development-plan.md`, and `test-plan.md`: the current task's plan, architecture, execution, and verification contract.
- `.loopx/workflows/<slug>/requirement-traceability.md`: original requirement coverage gate used by plan, build, and review.
- `.loopx/workflows/<slug>/execution-record.md` and `review-report.md`: execution evidence and review result.
- `.loopx/views/index.html` and `.loopx/workflows/<slug>/view/index.html`: reading entrypoints written after `plan` and regenerated by `loopx render`.

Documents users may read and modify as workflow fact sources:

- `.loopx/workflows/<slug>/*.md`: editable working-copy artifacts for the active workflow; changes still need to pass the relevant stage gates.
- `.loopx/config.json`: workspace configuration, project-rule/spec-source discovery, and default verification commands; update it if the repository's canonical commands or project-rule files change.
- `.loopx/context/domain.md` and `.loopx/agents/*.md`: project context, domain vocabulary, and agent collaboration guidance.
- `.loopx/changes/active/<change-id>/*.md`: plan-generated change proposal, design, tasks, and spec delta; edits should be followed by plan/build/review validation.
- `.loopx/specs/<domain>/spec.md`: long-lived archived behavior specs; normally synced by `archive`, and manual edits should stay consistent with later change deltas.

Documents and data the tools depend on, or generate as derived evidence:

- `.loopx/workflows/<slug>/state.json`, `build-context.jsonl`, and `review-context.jsonl`: runtime state and context manifests; tools depend on these and manual edits are discouraged.
- `.loopx/workflows/<slug>/plan-reviews/`, `build-support/`, and `review-support/`: stage evidence and internal review outputs for diagnostics and review.
- `.loopx/intake/clarify-*.md`: immutable clarify snapshots for audit and traceability; do not treat them as long-lived specs.
- `.loopx/changes/active/<change-id>/slices.json` and `artifact-graph.json`: structured planning data consumed by build/review/archive.
- `.loopx/autopilot/<slug>/run.json` and `.loopx/build-active.json`: orchestration and stop-hook runtime state.
- `.loopx/views/` and `.loopx/workflows/<slug>/view/`: derived HTML views; they are written after `plan`, can be deleted and regenerated with `loopx render`, and should not be edited as fact sources.

## Diagnostics and Repair

Inspect runtime and skill installation state:

```bash
loopx doctor
```

Repair loopx-owned skill installation:

```bash
loopx repair-install
```

Check skill discovery state only:

```bash
node scripts/install-skills.mjs --check
```

Verify bundled skill governance:

```bash
node scripts/verify-skills.mjs
```

## Codex Workflow Hook

`install-skills.mjs` and the Codex plugin installer automatically install `scripts/codex-workflow-hook.mjs` to:

```text
~/.codex/hooks/codex-workflow-hook.mjs
```

The hook reads the nearest `.loopx/workflows/<slug>/state.json` and emits advisory context for the active workflow: current stage, blockers, readiness, authorization, evidence, and the next safe loopx action. It is advisory only; runtime gates remain authoritative.

Set `LOOPX_HOOKS=0` to disable the workflow hook output.

## Codex Stop Hook

loopx includes a Codex stop-hook helper that prevents an active build from stopping before review handoff readiness:

```bash
node scripts/codex-stop-hook.mjs
```

During `loopx build`, runtime state is written to:

```text
.loopx/build-active.json
```

If that state says build is still `starting`, `executing`, `verifying`, or `fixing`, the hook returns `allow: false` and a continuation message. Once build is `review-ready`, blocked by a real blocker, failed, cancelled, or inactive, the hook allows the stop.

## Environment Variables

Install and discovery logic supports these environment variables:

- `LOOPX_HOME`: override the default home directory.
- `LOOPX_AGENTS_ROOT`: override the `.agents` root.
- `LOOPX_SKILLS_ROOT`: override the installed skills directory.
- `LOOPX_SKILL_LOCK_PATH`: override the skill lock path.
- `LOOPX_PROJECT_ROOT`: override the loopx project root.
- `LOOPX_SKILL_SOURCE_ROOT`: override the skill source directory.
- `LOOPX_DISTRIBUTION_CHANNEL`: set the install channel, default `npm`.
- `LOOPX_INSTALLATION_IDENTITY`: set the install identity, default `loopx`.
- `LOOPX_SOURCE_URL`: set the install source.
- `LOOPX_HOOKS`: set to `0` to disable workflow hook output.

## Development

Run tests:

```bash
npm test
```

`npm test` runs bundled skill governance first, then the Node test suites:

```bash
node scripts/verify-skills.mjs
node --test test/*.test.mjs
```

Useful verification commands:

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

## Published Files

`package.json` publishes:

- `README.md`
- `README.zh-CN.md`
- `package.json`
- `scripts/install-skills.mjs`
- `scripts/verify-skills.mjs`
- `scripts/codex-stop-hook.mjs`
- `scripts/codex-workflow-hook.mjs`
- `assets/logo.svg`
- `src/`
- `skills/`, including public loopx skills plus compatibility/internal skill sources shipped with the package
- `templates/`
- `plugins/loopx/`

## Version

Current npm package version: `0.1.9`.
