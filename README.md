<p align="center">
  <img src="./assets/logo.svg" alt="loopx logo" width="128" height="128">
</p>

<h1 align="center">loopx</h1>

<p align="center">Docs-first engineering discipline for agentic coding assistants.</p>

[中文文档](./README.zh-CN.md)

`loopx` compiles engineering discipline into documents and proves they work.
Its primary deliverable is a short working agreement installed into host
guidance (`AGENTS.md` / `CLAUDE.md`), plus four document-producing skills.
Execution belongs to the model and its host runtime: loopx ships no execution
runtime, review pipeline, or per-turn hook. The optional `$exec` skill is a thin
host-native subagent playbook for an already-ready `plan2exec` document.

Day-to-day work stays prompt-first under the working agreement: inspect the
request and relevant code, identify missing material decisions, and settle them
before the implementation that depends on them. Clear bounded requests need no
extra confirmation. Make the smallest correct change, check boundary conditions,
verify it freshly, and perform no Git disposition without an explicit request.

The four canonical workflow intents produce documents:

- `task-split` divides broad work into bounded assignments with focused context and
  handoffs, including serial tasks; small clear work stays prompt-first.
- `clarify` finds requirement gaps before implementation, asks independent
  decisions together, and follows up on dependent questions after their
  prerequisites are answered. It produces a requirements contract with testable
  `AC-*` / `TC-*` anchors.
- `spec` fixes durable product, compatibility, data, security, or architecture
  decisions as a design document with `D-*` anchors.
- `plan2exec` writes one lean plan document for explicit planning, approval
  boundaries, interruption recovery, or durable coordination. The executing
  agent follows the plan itself.
- `exec` optionally executes one ready plan through leaf subagents while the
  top-level model owns review, sequential integration, conflicts, and verification.

`debug` uses a tight red-loop discipline to diagnose and fix failures by default;
explicit diagnosis-only or read-only requests stop at findings without editing
any files. Model-invoked disciplines are kept minimal (`debug`, `tdd`,
`go-kratos`) to minimize always-on context load; workflow, review, and
specialized skills (`task-split`, `clarify`, `spec`, `plan2exec`, `exec`,
`code-review`, `refactor-plan`, `release-readiness`, `generate-api-docs`,
`humanize-doc`, `codebase-spec`, and the `/ask-loopx` router) are user-invoked
(`0` context load until explicitly triggered). Deterministic scripts validate `loopx-plan/v1`
plans (`skills/plan2exec/scripts/validate-plan.mjs`) and check diffs for
prohibited DB locks, floating-point money, and leftover debug logs
(`skills/code-review/scripts/check-guardrails.mjs`).

`release-readiness` maintains a release runbook with branch scope, environment
prerequisites, ordered operations, acceptance, and rollback conditions. The model
follows it for authorized rollout and records evidence. See
[Release Preparation And Execution](./docs/loopx/skills.md#release-preparation-and-execution).

## Why docs-first

The four-arm benchmark behind this design (`evals/benchmark/RESULTS.md`)
showed that for a frontier model the working agreement alone matched the full
v0.7 governance runtime on stop-discipline (+65pp over bare) at one third of
the token cost, while the runtime added no capability uplift. loopx therefore
delivers the document and the evidence pipeline that keeps it honest:
`evals/drills/` pressure-tests discipline clauses, `evals/benchmark/` measures
core benchmark pass rates, and `evals/skill-ab/` runs real end-to-end A/B
evaluations (direct for `debug`, two-stage blind downstream implementation for
`spec` and `plan2exec`) against bare, slim `AGENTS.md`, and prior loopx baselines.

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

```text
$task-split <broad-requirement-or-existing-task-breakdown>
$clarify <ambiguous-request>
$spec <decision-heavy-change>
$plan2exec <approved-source-or-planning-request>
$exec <ready-plan> [model=<id>] [reasoning_effort=<level>] [max_workers=<n>]
```

Everything else is ordinary model work under the installed working agreement.
Fresh verification is required for every completion claim. Independent review
is a working-agreement clause for high-risk diffs, dispatched through the
host's native subagents.

## Context Rules

`docs/loopx/specs/` contains binding long-lived repository context.
`docs/loopx/decisions/docs-first-pivot.md` records the current architecture
decision. `docs/archive/` is preserved history, not current authority, and is
excluded from default retrieval.
`.loopx/memory/MEMORY.md` is advisory curated memory. Current user instructions
and approved source documents take priority over both.

## Maintainers

Run the deterministic governance gate before release:

```bash
node scripts/verify-skills.mjs
```

Package and plugin manifest versions follow npm releases. Skill
`metadata.version` is independent; bump only skills whose content or behavior
contract changed.
