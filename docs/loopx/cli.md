# CLI Reference

The CLI is the installer, diagnostics, context setup, and local runtime support
surface for loopx. The primary product surface remains the installed skill
suite used inside the agent.

## Current Workflow State Contract

New clarify workflows use workflow schema v2 and persist `handoff_decision` as
`needs_spec`, `direct_to_plan`, or `blocked`. `loopx status` and `loopx next`
route from that decision; readiness alone never implies planning. Pre-v2
running workflow state is unsupported and is not migrated or deleted. Start a
new current-contract workflow when the CLI reports
`unsupported_workflow_schema:<version>:restart_required`.

Only the top-level controller owns agent lifecycle. Workers dispatched by
loopx skills are leaf workers and must not create or wait for other agents.

## Quick start

```bash
npm install -g @ai-content-space/loopx
loopx install-skills --target all --yes
loopx doctor
```

Human output is the default for first-use commands. Use `--json` when an agent
or script needs the full runtime payload:

```bash
loopx init --slug my-feature --json
loopx clarify my-feature --json
loopx doctor --json
loopx install-skills --target all --json
```

The JSON flag also works on the default init path: `loopx init --json`.

## Commands

```bash
loopx --version
loopx install-skills [--target <codex|claude|all>] [--project] [--mode <copy|symlink>] [--dir <path>] [--add-agent-guidance] [--yes] [--dry-run] [--json]
loopx init [--slug <slug>] [--enable-agent-delegation] [--auto-agent-delegation] [--agent-delegation-threshold <local|critic-only|parallel-review>] [--json]
loopx clarify <slug> [--standard|--deep] [--json]
loopx render [slug|--all]
loopx status [slug] [--json]
loopx next <slug> [--json]
loopx setup-context
loopx lancet <on|off|status> [--json]
loopx doctor [--json]
loopx repair-install
```

`loopx init`, `loopx clarify`, `loopx status`, and `loopx next` exist to help an
agent and user find the next skill handoff. The Golden path still happens in
the agent:

```text
clarify -> spec? -> plan-to-exec -> (exec | subagent-exec) -> review/final-review -> fix-review? -> finish
```

New `clarify` workflows write a local intake package under `.loopx/intake/YYYY-MM-DD-<slug>/` with canonical `requirements.md` and supporting `clarification.md`. Human output shows concise paths; use `--json` for full state fields.

## Installation

Postinstall installs user-level skills and hooks:

- Codex skills: `~/.agents/skills/`
- Claude skills: `~/.claude/skills/`
- Codex hook: `~/.codex/hooks/codex-workflow-hook.mjs`
- Claude hook: `~/.claude/hooks/loopx-workflow-hook.mjs`

Preview installed files first:

```bash
loopx install-skills --target all --dry-run
```

Skip automatic postinstall setup:

```bash
LOOPX_SKIP_POSTINSTALL=1 npm install -g @ai-content-space/loopx
LOOPX_POSTINSTALL=0 npm install -g @ai-content-space/loopx
```

Disable loopx hooks for one process:

```bash
LOOPX_HOOKS=0 codex
```

Control Codex-only automatic `lancet` guidance for implementation and review
work:

```bash
loopx lancet status
loopx lancet off
loopx lancet on
LOOPX_LANCET=0 codex
```

`lancet` state lives under `~/.loopx/lancet/`. `LOOPX_LANCET=0` disables
automatic guidance for the current process without rewriting local state.

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

Prompt-first routing guidance is installed automatically for both hosts.
`--add-agent-guidance` adds a separate loopx managed block that tells agents to
read repo specs and memory context. User content outside managed blocks is
preserved.

Claude project install writes skills and settings to the current repository's
`.claude/skills/` and `.claude/settings.json`.

To remove loopx-managed user-level artifacts, see
[Installation And CLI Onboarding Spec](./specs/installation.md).

## Maintainer Commands

Normal and plugin installs both consume bundled skills from the canonical
package-root `skills/` source. Only edit `skills/` by hand when changing bundled
skills.

Run deterministic governance checks before release or after changing bundled
skills:

```bash
node scripts/verify-skills.mjs
```

Package and plugin manifest versions follow npm releases. Skill
`metadata.version` is independent; bump only the skills whose content or
behavior contract changed.
