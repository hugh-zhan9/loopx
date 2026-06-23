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
$final-review
$finish
```

For a normal feature, start with `$clarify`. The output should tell you whether
the next step is `$spec` or `$plan-to-exec`. Continue the Golden path until
`$finish` completes verification and records the outcome.

Use `$exec` instead of `$subagent-exec` when subagents are unavailable or the
work is small enough to run inline. Use `$fix-review` whenever review feedback
needs to be evaluated and applied.

## Core Skills

| Skill | Use it when |
|---|---|
| `clarify` | Scope, non-goals, constraints, or decision boundaries are still unclear. |
| `spec` | API, data, state, permission, migration, compatibility, product behavior, or architecture decisions must be fixed before planning. |
| `plan-to-exec` | Requirements are clear enough to become small executable tasks. |
| `subagent-exec` | An approved plan should be executed with fresh subagents and combined task review. |
| `exec` | An approved plan should be executed inline. |
| `review` | A concrete git range needs independent code review. |
| `final-review` | The whole feature is implemented and needs integration, runtime, and test-gap review before finishing. |
| `fix-review` | Review feedback needs technical evaluation, pushback, or implementation. |
| `finish` | Work is verified and needs a merge, PR, keep, or discard decision. |
| `refactor-plan` | A behavior-preserving refactor needs a scoped plan and tiny commits. |

Support skills are lenses, not workflow states: `tdd`, `debug`, `verify`,
`doc-readability`, `requirement-analyzer`, `go-style`, `kratos`,
`api-designer`, `architecture-designer`, `sql-style`, and `cli-developer`.

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
The Codex plugin shell lives at `plugins/loopx/`, and its skill mirror is
generated from the canonical bundled skills.

Only edit `skills/` by hand. Regenerate `plugins/loopx/skills/` after changing
bundled skills:

```bash
npm run sync-plugin-skills
```

Run deterministic governance checks before release or after changing bundled
skills:

```bash
node scripts/verify-skills.mjs
```

Package and plugin manifest versions follow npm releases. Skill
`metadata.version` is independent; bump only the skills whose content or
behavior contract changed.
