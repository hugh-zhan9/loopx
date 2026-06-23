# CLI Reference

The CLI is the installer, diagnostics, context setup, and local runtime support
surface for loopx. The primary product surface remains the installed skill
suite used inside the agent.

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
loopx doctor [--json]
loopx repair-install
```

`loopx init`, `loopx clarify`, `loopx status`, and `loopx next` exist to help an
agent and user find the next skill handoff. The Golden path still happens in
the agent:

```text
clarify -> spec? -> plan-to-exec -> (exec | subagent-exec) -> review/final-review -> fix-review? -> finish
```

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

Agent guidance is opt-in. `--add-agent-guidance` writes a loopx managed block
that tells agents to read repo specs and memory context. User content outside
the managed block is preserved.

Claude project install writes skills and settings to the current repository's
`.claude/skills/` and `.claude/settings.json`.

To remove loopx-managed user-level artifacts, see
[Installation And CLI Onboarding Spec](./specs/installation.md).

## Maintainer Commands

Regenerate plugin skill mirrors after changing bundled skills:

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
