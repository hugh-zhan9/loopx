# loopx

[中文文档](./README.zh-CN.md)

`loopx` is a skill-first workflow toolkit for Codex. It organizes clarification, consensus planning, persistent execution, and independent review into a local, auditable workflow exposed through both a CLI and Codex Skills.

Current public flow:

```text
clarify -> plan -> build -> review
```

`autopilot` is the end-to-end orchestration entrypoint. Internally it reuses the public flow instead of creating a second source of workflow truth.

## Features

- Installs and exposes five public loopx Codex skills: `clarify`, `plan`, `build`, `review`, and `autopilot`.
- Supports npm global install and Codex plugin install through the same install/discovery core.
- Stores runtime state and stage artifacts locally under `.loopx/` for auditability, recovery, and migration.
- Runs `plan` with a Planner -> Architect -> Critic consensus loop by default.
- Runs `build` with execution records, verification evidence, architect validation, deslop cleanup, and regression re-verification.
- Keeps `review` as an independent acceptance surface with go/no-go verdicts.
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
loopx review <slug> [--reviewer <name>]
loopx autopilot <slug> [--reviewer <name>]
loopx status [slug] [--json]
loopx doctor
loopx migrate
loopx repair-install
```

The CLI is primarily for runtime, debugging, and maintenance. The normal Codex-facing product surface is the bundled skill set, for example `$clarify`, `$plan`, `$build`, `$review`, and `$autopilot`.

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

### review

`review` consumes the build `execution-record.md`, runs independent acceptance and code review, and generates:

```text
.loopx/workflows/<slug>/review-report.md
```

The user-facing review result is expected to be written in Chinese.

If review approves the run, the workflow still requires an explicit `review -> done` approval. If review requests changes, approve `review -> plan` and run `loopx review <slug>` again to consume the rollback transition.

### autopilot

`autopilot` is the end-to-end orchestration entrypoint. It may run internal phases such as expansion, planning, execution, QA, and validation, but canonical artifacts still come from the public `clarify -> plan -> build -> review` flow.

The orchestration ledger is written to:

```text
.loopx/autopilot/<slug>/run.json
```

## Runtime Layout

loopx writes runtime state under `.loopx/` in the current project:

```text
.loopx/
  README.md
  config.json
  specs/
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
- `src/`
- `skills/`, including public loopx skills plus compatibility/internal skill sources shipped with the package
- `templates/`
- `plugins/loopx/`

## Version

Current npm package version: `0.1.2`.
