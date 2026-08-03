<p align="center">
  <img src="./assets/logo.svg" alt="loopx logo" width="128" height="128">
</p>

<h1 align="center">loopx</h1>

<p align="center">Docs-first engineering discipline for agentic coding assistants.</p>

[中文文档](./README.zh-CN.md)

`loopx` compiles engineering discipline into documents and proves they work.
Its primary deliverable is a short working agreement installed into host
guidance (`AGENTS.md` / `CLAUDE.md`), plus three document-producing skills.
Execution belongs to the model and its host runtime: loopx ships no execution
orchestrator, no review pipeline, and no per-turn hook.

Day-to-day work stays prompt-first under the working agreement: read first,
smallest correct change, boundary conditions, fresh verification, stop and ask
when a material decision is unspecified, no Git disposition without an
explicit request.

The three canonical workflow intents produce documents:

- `clarify` interviews one question at a time and produces a requirements
  contract with testable `AC-*` / `TC-*` anchors.
- `spec` fixes durable product, compatibility, data, security, or architecture
  decisions as a design document with `D-*` anchors.
- `plan2exec` writes one lean plan document for explicit planning, approval
  boundaries, interruption recovery, or durable coordination. The executing
  agent follows the plan itself.

Issue-driven workflows remain available: `$issue` diagnoses a bug-class report
and writes a local ledger; `$fix` executes a ledger marked `ready_for_fix`.
Support skills such as `tdd`, `debug`, `verify`, `plan-reviewer`,
`api-designer`, `architecture-designer`, `sql-style`, `cli-developer`, and
`lancet` remain lenses, not workflow states.

## Why docs-first

The four-arm benchmark behind this design (`evals/benchmark/RESULTS.md`)
showed that for a frontier model the working agreement alone matched the full
v0.7 governance runtime on stop-discipline (+65pp over bare) at one third of
the token cost, while the runtime added no capability uplift. loopx therefore
delivers the document and the evidence pipeline that keeps it honest:
`evals/drills/` pressure-tests every discipline clause, and
`evals/benchmark/` measures pass rates and token economy against bare and
docs-only controls.

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
$clarify <ambiguous-request>
$spec <decision-heavy-change>
$plan2exec <approved-source-or-planning-request>
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
