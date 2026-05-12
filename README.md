# loopx

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
- Supports npm global install and Codex plugin install through the same install/discovery core.
- Stores runtime state and stage artifacts locally under `.loopx/` for auditability, recovery, and migration.
- Runs `plan` with a Planner -> Architect -> Critic consensus loop by default.
- Writes OpenSpec-inspired change artifacts during `plan`: proposal, spec delta, design, vertical slices, tasks, and an artifact dependency graph.
- Provides per-repo agent context under `.loopx/agents/` and `.loopx/context/domain.md`, consumed by build/review context manifests.
- Runs `build` with execution records, verification evidence, architect validation, deslop cleanup, and regression re-verification.
- Keeps `review` as an independent acceptance surface with code review plus an internal architecture-smell lane.
- Supports `archive` to sync approved change deltas into long-lived `.loopx/specs/` source-of-truth files and emit ADR candidates.
- Supports migration from the legacy `.codex-helper/` runtime namespace to `.loopx/`.

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

Complete an approved review:

```bash
loopx approve my-task --from review --to done
loopx review my-task
```

Archive accepted behavior into long-lived specs:

```text
$archive my-task
```

Check status:

```bash
loopx status my-task
loopx status my-task --json
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
loopx status [slug] [--json]
loopx setup-context
loopx doctor
loopx migrate
loopx repair-install
```

The CLI is primarily for runtime, debugging, status inspection, and maintenance. The normal Codex-facing product surface is the bundled skill set, for example `$clarify`, `$plan`, `$build`, `$review`, `$archive`, `$autopilot`, `$debug`, `$tdd`, `$verify`, `$go-style`, and `$kratos`.

`loopx status` remains a CLI/runtime diagnostic command rather than a Codex skill.

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

If review approves the run, the workflow still requires an explicit `review -> done` approval. If review requests implementation changes, run `$build --from-review .loopx/workflows/<slug>/review-report.md`. Plan and clarify rollbacks still use `$plan <slug>` or `$clarify <slug>` when the review finding says the plan or requirements are wrong.

The architecture-smell lane is part of review; it does not add a new stage. It records findings under `review-support/architecture-smell.json` and only blocks when module seams, testability, domain vocabulary, or plan architecture assumptions are materially wrong.

### archive

`archive` consumes a completed workflow and syncs the approved `.loopx/changes/active/<change-id>/spec-delta.md` into long-lived domain specs under `.loopx/specs/`. The change folder is moved to:

```text
.loopx/changes/archive/<change-id>/
```

Archive also writes an advisory ADR candidate under `.loopx/decisions/adr-candidates/<change-id>.md`. It is not promoted to `docs/adr/` automatically.

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
      plan-reviews/
      build-support/
  autopilot/
    <slug>/
      run.json
```

Legacy `.codex-helper/` state can be migrated with `loopx migrate`. The `.omx/` tree remains external orchestration/planning metadata and is not part of the loopx runtime namespace.

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

## Development

Run tests:

```bash
npm test
```

Useful verification commands:

```bash
node --test test/*.test.mjs
node scripts/install-skills.mjs --check
node --test plugins/loopx/scripts/plugin-install.test.mjs
node src/cli.mjs --help
node src/cli.mjs doctor
node src/cli.mjs status --json
```

## Published Files

`package.json` publishes:

- `README.md`
- `README.zh-CN.md`
- `package.json`
- `scripts/install-skills.mjs`
- `scripts/codex-stop-hook.mjs`
- `src/`
- `skills/`, including public loopx skills plus compatibility/internal skill sources shipped with the package
- `templates/`
- `plugins/loopx/`

## Version

Current npm package version: `0.1.2`.
