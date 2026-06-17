<p align="center">
  <img src="./assets/logo.svg" alt="loopx logo" width="128" height="128">
</p>

<h1 align="center">loopx</h1>

<p align="center">
  Skill-first workflow suite for agentic coding assistants.
</p>

[中文文档](./README.zh-CN.md)

`loopx` installs and governs a practical v1 skill suite for Codex and Claude-style coding agents. Use it when you want an agent workflow that clarifies scope, writes a design note when needed, turns decisions into an execution plan, reviews the work, and finishes with explicit verification.

Recommended v1 flow:

```text
clarify -> spec? -> plan-to-exec -> (exec | subagent-exec) -> review/final-review -> fix-review? -> finish
```

## Install

Install globally:

```bash
npm install -g @ai-content-space/loopx
```

Install the bundled skills and hooks:

```bash
loopx install-skills --target all --yes
loopx doctor
```

To inspect what would be written first:

```bash
loopx install-skills --target all --dry-run
```

## Quick start

Create a workflow, clarify it, and ask loopx for the next step:

```bash
loopx init --slug my-feature
loopx clarify my-feature
loopx status my-feature
loopx next my-feature
```

After `clarify`, follow the suggested skill command, usually `$plan-to-exec <slug>`. Continue with `loopx status <slug>` or `loopx next <slug>` until `final-review` and `$finish` complete the work.

This is the Golden path for a first run.

Human output is the default for first-use commands. Use `--json` when an agent or script needs the full runtime payload:

```bash
loopx init --slug my-feature --json
loopx clarify my-feature --json
loopx doctor --json
loopx install-skills --target all --json
```

The JSON flag also works on the default init path: `loopx init --json`.

## Workflow

`spec` is conditional. Use it when API, data, state, permission, migration, compatibility, product behavior, or architecture decisions must be fixed before planning. Skip it when the remaining work is local implementation choice.

`clarify` outputs and `spec` design documents are anchor sources. `plan-to-exec` must preserve anchor coverage when it turns those sources into executable tasks.

Core workflow skills:

| Skill | Role |
|---|---|
| `clarify` | Interview until scope, non-goals, constraints, and decision boundaries are clear. |
| `spec` | Write a design document or lightweight design note when design decisions are required. |
| `plan-to-exec` | Turn clarified requirements into a bite-sized implementation plan. |
| `subagent-exec` | Execute an approved plan with fresh subagents and staged review. |
| `exec` | Execute an approved plan inline when subagents are unavailable or not desired. |
| `review` | Request independent code review against a git range and plan or requirements. |
| `final-review` | Review the completed feature for runtime, integration, and test-gap risk before finishing. |
| `fix-review` | Evaluate and implement code review feedback rigorously. |
| `finish` | Verify and choose merge, PR, keep, or discard. |
| `refactor-plan` | Interview and write a behavior-preserving refactor plan with tiny commits. |

`review` and `fix-review` run inside `subagent-exec` or `exec` as task/checkpoint review loops. `final-review` is the whole-feature review before `finish`; its feedback also goes through `fix-review`.

Support skills are lenses, not workflow states:

- `tdd`
- `debug`
- `verify`
- `doc-readability`
- `requirement-analyzer`
- `go-style`
- `kratos`
- `api-designer`
- `architecture-designer`
- `sql-style`
- `cli-developer`

The installed and governed v1 skill surface is this list. The repository may keep auxiliary or compatibility skill sources under `skills/`, but `loopx install-skills` installs only the bundled v1 set.

For a fuller usage guide, see [loopx Skills Guide](./docs/loopx/skills.md).

## CLI

Common commands:

```bash
loopx --version
loopx install-skills [--target <codex|claude|all>] [--project] [--mode <copy|symlink>] [--dir <path>] [--add-agent-guidance] [--yes] [--dry-run] [--json]
loopx init [--slug <slug>] [--enable-agent-delegation] [--auto-agent-delegation] [--agent-delegation-threshold <local|critic-only|parallel-review>] [--json]
loopx clarify <slug> [--standard|--deep] [--json]
loopx render [slug|--all]
loopx status [slug] [--json]
loopx next <slug> [--json]
loopx setup-context
loopx doctor [--json]
loopx repair-install
```

## Files And Context

Human-maintained workflow artifacts live under `docs/loopx/`:

- `docs/loopx/design/`
- `docs/loopx/plans/`
- `docs/loopx/reviews/`
- `docs/loopx/refactors/`
- `docs/loopx/memory/`
- `docs/loopx/specs/`

`docs/loopx/specs/` contains binding long-lived repo context. Workflow skills read relevant specs before clarification, design, planning, build, and review work.

`.loopx/memory/MEMORY.md` is advisory curated memory. It helps agents remember useful project knowledge, but it must not override current user instructions, approved source documents, or binding specs.

`finish` writes a local audit ledger under `.loopx/finish/<audit-id>/`. `none` means the work was audited, but it did not produce a durable learning candidate.

Priority order: current user instruction, source document, repo specs, memory.

Generated support state, hook diagnostics, installer metadata, HTML views, and runtime JSON remain under `.loopx/`.

## Installation Details

Postinstall installs user-level skills and hooks for Codex and Claude:

- Codex skills: `~/.agents/skills/`
- Claude skills: `~/.claude/skills/`
- Codex hook: `~/.codex/hooks/codex-workflow-hook.mjs`
- Claude hook: `~/.claude/hooks/loopx-workflow-hook.mjs`

To skip automatic postinstall setup:

```bash
LOOPX_SKIP_POSTINSTALL=1 npm install -g @ai-content-space/loopx
LOOPX_POSTINSTALL=0 npm install -g @ai-content-space/loopx
```

To disable loopx hooks for one process:

```bash
LOOPX_HOOKS=0 codex
```

Repair an interrupted or conflicted install:

```bash
loopx repair-install
loopx doctor
```

Choose install targets manually:

```bash
loopx install-skills
loopx install-skills --target codex
loopx install-skills --target claude
loopx install-skills --target claude --project
loopx install-skills --target all --add-agent-guidance
loopx install-skills --target all --yes
```

Agent guidance is opt-in. `--add-agent-guidance` writes a loopx managed block that tells agents to read repo specs and memory context. User content outside the managed block is preserved.

Claude project install writes skills and settings to the current repository's `.claude/skills/` and `.claude/settings.json`.

To remove loopx-managed user-level artifacts, see [Installation And CLI Onboarding Spec](./docs/loopx/specs/installation.md).

## Codex Plugin

The Codex plugin shell lives at:

```text
plugins/loopx/
```

Plugin install script:

```bash
node plugins/loopx/scripts/plugin-install.mjs
```

The plugin mirrors the canonical bundled v1 skills from `skills/` and uses the same install/discovery core.

## Governance

The bundled skill resolver lives at:

```text
skills/RESOLVER.md
```

Run deterministic governance checks before release or when changing bundled skills:

```bash
node scripts/verify-skills.mjs
```

The governance script checks bundled v1 skill frontmatter, plugin mirrors, resolver coverage, local references, package contents, version consistency, and public docs. It intentionally verifies the installable v1 skill set, not every auxiliary source directory under `skills/`.
