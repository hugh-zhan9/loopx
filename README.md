<p align="center">
  <img src="./assets/logo.svg" alt="loopx logo" width="128" height="128">
</p>

<h1 align="center">loopx</h1>

<p align="center">
  Skill-first workflow suite for agentic coding assistants.
</p>

[中文文档](./README.zh-CN.md)

`loopx` is primarily a governed skill suite for Codex and Claude-style coding
agents. The CLI installs the skills, hooks, and project context; the day-to-day
workflow happens by invoking skills inside the agent.

```text
clarify -> spec? -> plan-to-exec -> (exec | subagent-exec) -> review/final-review -> fix-review? -> finish
```

This is the v2 current contract. Running pre-v2 `.loopx` workflow state is not
migrated; restart it when the CLI reports `restart_required`. Only the top-level
controller owns subagent lifecycle. Every worker dispatched by a loopx skill is
a leaf worker and must not spawn, delegate to, or wait for other agents.

loopx has two main flows:

- feature-driven work follows the path above for new product or code changes.
- issue-driven work handles bug-class issues: `$issue` diagnoses and writes a local ledger, then `$fix` executes ledgers that are ready for repair.

## Install

```bash
npm install -g @ai-content-space/loopx
loopx install-skills --target all --yes
loopx doctor
```

Preview installed files first:

```bash
loopx install-skills --target all --dry-run
```

Full CLI and installation details live in [CLI Reference](./docs/loopx/cli.md).

## Use In An Agent

After installation, ask the agent to use the relevant skill by name:

```text
$clarify <feature-or-problem>
$plan-to-exec <slug>
$subagent-exec <approved-plan>
$issue <bug-report-or-failing-output>
$fix .loopx/issues/<ledger>.md
$final-review
$finish
```

For a normal feature, start with `$clarify`. The output should tell you whether
the next step is `$spec` or `$plan-to-exec`, and may hand off an intake package
directory or a detailed design doc. Continue the Golden path until `$finish`
completes verification and records the outcome.

Use `$exec` instead of `$subagent-exec` when subagents are unavailable or the
work is small enough to run inline. Use `$fix-review` whenever review feedback
needs to be evaluated and applied.

For a bug-class issue, start with `$issue`. Continue with `$fix` only after the
ledger status is `ready_for_fix`.

### Manual Experimental Parallel Execution

`parallel-subagent-exec` is a bundled manual experimental executor, not part of
the normal automatic route. It accepts only a complete single plan or package
with strict machine-readable parallel metadata:

```text
$parallel-subagent-exec <plan-or-package> [--max-parallel N]
```

The worker limit defaults to `4`. A direct numbered child plan is excluded.
Missing/legacy metadata or direct child input stops with
`$subagent-exec <same-input-path>`; it does not silently run another executor.
If native create plus observe-or-wait capability is unavailable, it exits with
exit `5` and no fallback.

## Core Skills

| Skill | Use it when |
|---|---|
| `clarify` | Scope, non-goals, constraints, or decision boundaries are still unclear; produces `.loopx/intake/YYYY-MM-DD-<slug>/` with canonical `requirements.md` and supporting `clarification.md`. |
| `spec` | API, data, state, permission, migration, compatibility, product behavior, or architecture decisions must be fixed before planning. |
| `codebase-spec` | An existing repository, module, or interface needs an evidence-backed current-state specification. |
| `plan-to-exec` | Requirements are clear enough to become small executable tasks. |
| `subagent-exec` | An approved plan should be executed with fresh subagents and combined task review. |
| `exec` | An approved plan should be executed inline. |
| `review` | Completed task evidence, checkpoint work, or a feature git range needs independent code review. |
| `final-review` | The whole feature is implemented and needs integration, runtime, and test-gap review before finishing. |
| `fix-review` | Review feedback needs technical evaluation, pushback, or implementation. |
| `finish` | Work is verified and needs a merge, PR, keep, or discard decision. |
| `issue` | Issue-driven bug-class intake, diagnosis, and fix brief creation. |
| `fix` | Issue-driven repair from `.loopx/issues` ledgers marked `ready_for_fix`. |
| `refactor-plan` | A behavior-preserving refactor needs a scoped plan and tiny commits. |

Support skills are lenses, not workflow states: `tdd`, `debug`, `verify`,
`doc-readability`, `requirement-analyzer`, `plan-reviewer`, `go-style`, `kratos`,
`api-designer`, `architecture-designer`, `sql-style`, `cli-developer`, and
`lancet`.

`plan-reviewer` is used internally by `plan-to-exec` to audit draft plan
coverage before the normal execution handoff.

`lancet` is a Codex-only automatic support lens for implementation and review
work. Use `loopx lancet on`, `loopx lancet off`, or `loopx lancet status` to
control local automatic guidance under `~/.loopx/lancet/`.

See [loopx Skills Guide](./docs/loopx/skills.md) for the full bundled v1 skill
surface.

## Context Rules

Human-maintained workflow artifacts live under `docs/loopx/`: `design/`,
`plans/`, `reviews/`, `refactors/`, `memory/`, and `specs/`.

`docs/loopx/specs/` contains binding long-lived repo context. Workflow skills
read relevant specs before clarification, design, planning, execution, and
review work.

`.loopx/memory/MEMORY.md` is advisory curated memory. It helps agents remember
useful project knowledge, but it must not override current user instructions,
approved source documents, or binding specs.

Priority order: current user instruction, source document, repo specs, memory.
Generated support state, hook diagnostics, installer metadata, HTML views, and
runtime JSON remain under `.loopx/`.

## Finish Audit

`finish` writes a local audit ledger under `.loopx/finish/<audit-id>/`.
`none` means the work was audited, but it did not produce a durable learning
candidate.

Use the audit result to decide whether project memory or specs need a follow-up
update. `finish` should not silently turn every completed task into durable
knowledge.

## Maintainers

The installed and governed v1 skill surface is the bundled set in `skills/`.
The Codex plugin shell lives at `plugins/loopx/`, but normal and plugin installs
both consume the canonical package-root `skills/` source.

Only edit `skills/` by hand when changing bundled skills.

Run deterministic governance checks before release or after changing bundled
skills:

```bash
node scripts/verify-skills.mjs
```

Package and plugin manifest versions follow npm releases. Skill
`metadata.version` is independent; bump only the skills whose content or
behavior contract changed.
