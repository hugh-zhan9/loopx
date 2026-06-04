# loopx Skill Suite v1 Design

## Context

loopx is moving from a CLI-runtime-first workflow into a skill-first suite for agentic coding assistants. Codex and Claude are supported targets. The CLI remains as installer, governance, diagnostics, rendering, and runtime maintenance.

## Decision

The v1 product surface is the installed and governed bundled skill suite:

- `clarify`
- `spec`
- `plan`
- `subagent-exec`
- `exec`
- `review`
- `final-review`
- `fix-review`
- `finish`
- `refactor-plan`
- `tdd`
- `debug`
- `verify`
- `go-style`
- `kratos`

Runtime-only skills are not installed as Codex or Claude skills in v1.

The repository may retain auxiliary or compatibility skill source directories for development history or adjacent workflows. They are not part of the v1 product surface unless they are listed in the bundled install set and mirrored into the plugin skill set.

## Workflow

Recommended flow:

```text
clarify -> spec? -> plan -> (subagent-exec | exec) -> final-review -> fix-review? -> finish
```

`spec` is a conditional design gate. `clarify` may route directly to `plan` when the remaining questions are local implementation choices. It routes to `spec` when product behavior, APIs, state, data, permissions, migration, compatibility, or architecture decisions need to be fixed before implementation planning.

`plan` is the superpowers `writing-plans` workflow under the loopx name. It writes executable plans and offers two execution options: `subagent-exec` recommended, or `exec` inline.

`review` is the task or checkpoint code review workflow inside `subagent-exec` or `exec`. `final-review` is the top-level whole-feature runtime, integration, and test-gap review before completion. `fix-review` handles feedback from either review layer.

`finish` verifies completion, extracts local memory, proposes repo-tracked spec candidates when stable team rules emerged, then presents merge, PR, keep, or discard options. It is the terminal completion step for one implementation decision; rerun it only after keep-as-is, PR iteration, interruption before choice execution, or new changes after review feedback. Do not rerun it after merge or discard.

## Artifacts

Human-maintained v1 skill-suite artifacts use `docs/loopx/`:

- `docs/loopx/design/`
- `docs/loopx/plans/`
- `docs/loopx/reviews/`
- `docs/loopx/refactors/`
- `docs/loopx/specs/`

Runtime state, hook diagnostics, installer metadata, manifests, generated HTML views, and runtime JSON use `.loopx/`.

Local agent memory uses `.loopx/memory/`. `.loopx/memory/MEMORY.md` is bounded curated project memory. `.loopx/memory/index.jsonl` is a curated active index for agent file-search. Stable shared rules belong in `docs/loopx/specs/<domain>.md`, with `docs/loopx/specs/inbox.md` as the fallback domain.

## Installer

Default installation writes user-level skills and hooks for both supported targets:

- Codex skills: `~/.agents/skills/`
- Claude skills: `~/.claude/skills/`
- Codex hook: existing loopx workflow hook
- Claude hook: non-blocking prompt hook

Project-level Claude installation and custom directories are explicit installer choices.

## Claude Hook

The Claude hook is advisory only. It must not block tools, mutate workflow state, or enforce git safety. It emits next-action context when loopx support context exists.

## Non-Goals

- No alias skills in the v1 bundled install surface for renamed superpowers skills.
- No automatic project-level `.claude/skills` writes in postinstall.
- No new mandatory CLI state machine for the v1 skill suite.
- No blocking Claude hook in v1.
