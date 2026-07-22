<p align="center">
  <img src="./assets/logo.svg" alt="loopx logo" width="128" height="128">
</p>

<h1 align="center">loopx</h1>

<p align="center">Skill-first workflow suite for agentic coding assistants.</p>

[中文文档](./README.zh-CN.md)

`loopx` installs governed skills, host guidance, and project context for Codex
and Claude-style coding agents. Day-to-day work stays prompt-first: a clear,
bounded request is implemented and freshly verified without creating workflow
artifacts merely to move through stages.

The six canonical workflow intents are `clarify`, `spec`, `plan2exec`, `exec`,
`review`, and `finish`. They are optional governance tools, not a fixed path.

- `clarify` resolves material ambiguity before mutation.
- `spec` fixes durable product, compatibility, data, security, or architecture decisions.
- `plan2exec` writes a lean execution plan only for explicit planning, approval, recovery, or durable coordination. Its distinct name avoids confusion with an agent's built-in Plan mode.
- `exec` keeps small prompt-first work inline, delegates planned serial work to fresh workers, and schedules proved-independent work in isolated DAG waves.
- `review` performs proportional standalone review; delegated execution requires task review and final Spec plus Standards review.
- `finish` handles Git disposition only after explicit `$finish` invocation or for work completed by the active loopx `exec` or `fix` context; standalone Git requests remain ordinary Git work.

Issue-driven workflows remain available: `$issue` diagnoses a bug-class report
and writes a local ledger; `$fix` executes a ledger marked `ready_for_fix`.
Support skills such as `tdd`, `debug`, `verify`, `plan-reviewer`, `api-designer`,
`architecture-designer`, `sql-style`, `cli-developer`, and `lancet` remain lenses,
not workflow states.

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

Invoke governance only when the request or observed risk calls for it:

```text
$clarify <ambiguous-request>
$spec <decision-heavy-change>
$plan2exec <approved-source-or-planning-request>
$exec <clear-request-or-plan>
$review <request-or-git-scope>
$finish <Git-disposition-request>
```

Fresh verification is required for every completion claim. Persistent plans,
resumable state, knowledge writes, and Git disposition remain conditional.
Independent review is mandatory for delegated execution and proportional for
inline work. `finish` does not perform verification, review, or knowledge
extraction and does not write a local audit ledger.

## Execution Profiles

`exec` selects these profiles automatically. The delegated profiles may also be
invoked explicitly without creating separate execution engines:

| Profile skill | Behavior |
|---|---|
| `subagent-exec` | Fresh implementer per slice, serial dependency order, mandatory task and final review. |
| `parallel-subagent-exec` | Bounded isolated ready-frontier execution, mandatory review before integration. |

## Compatibility

For one release, two former names remain as explicit-only compatibility
aliases and are excluded from automatic discovery:

| Alias | Canonical intent |
|---|---|
| `final-review` | `review` |
| `fix-review` | `review` |

Each compatibility alias forwards the same input. It does not restore the old
feedback-ledger or finish-gate protocol.

## Context Rules

`docs/loopx/specs/` contains binding long-lived repository context.
`.loopx/memory/MEMORY.md` is advisory curated memory. Current user instructions
and approved source documents take priority over both.

Only the top-level controller owns agent lifecycle. Every dispatched worker is
a leaf worker and must not spawn, delegate to, or wait for other agents.
pre-v2 running workflow state is unsupported and must restart.

See [loopx Skills Guide](./docs/loopx/skills.md) for the complete bundled surface.

## Maintainers

Normal and plugin installs consume the same canonical package-root `skills/`
source. Run the deterministic governance gate before release:

```bash
node scripts/verify-skills.mjs
```

Package and plugin manifest versions follow npm releases. Skill
`metadata.version` is independent; bump only skills whose content or behavior
contract changed.
