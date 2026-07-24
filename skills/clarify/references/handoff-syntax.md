# Handoff Invocation Syntax

Name the canonical skill and arguments first, then render the invocation in the
current agent's native format. Do not present Codex `$...` syntax as the only
handoff unless the current agent is Codex.

- Codex: `$<skill> <args>`
- Claude Code: `/<skill> <args>`
- Cursor Agent Skills: `/<skill> <args>`
- Generic: `Use the <skill> skill with <args>`

## needs_spec

Hand off to `spec` with the intake package directory as the source:

```text
skill: spec
args: .loopx/intake/YYYY-MM-DD-<slug>/
```

`spec` writes a dated design package under
`docs/loopx/design/YYYY-MM-DD-<kebab-slug>/`, including
`需求设计文档.md`. Then stop before implementation planning and report the
follow-up handoff:

```text
skill: plan2exec
args: docs/loopx/design/YYYY-MM-DD-<kebab-slug>/需求设计文档.md
```

## direct_to_plan

Hand off to `plan2exec` with the intake package directory as the source:

```text
skill: plan2exec
args: .loopx/intake/YYYY-MM-DD-<slug>/
```

`plan2exec` writes one execution plan to
`docs/loopx/plans/YYYY-MM-DD-<feature-slug>.md`.

## blocked

No handoff invocation. Report the concrete unresolved blocker and keep the
intake package `blocked`.
