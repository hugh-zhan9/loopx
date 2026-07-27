# CLI Reference

The CLI installs loopx, checks the installation, prepares repository context,
and creates local document sets. The working agreement and document-producing
skills are the primary product surface.

## Quick start

```bash
npm install -g @ai-content-space/loopx
loopx install-skills --target all --yes
loopx doctor
```

## Commands

```bash
loopx --version
loopx install-skills [--target <codex|claude|all>] [--project] [--mode <copy|symlink>] [--dir <path>] [--add-agent-guidance] [--yes] [--dry-run] [--json]
loopx init [--slug <slug>] [--json]
loopx clarify <slug> [--json]
loopx render [slug|--all]
loopx status [slug] [--json]
loopx setup-context
loopx doctor [--json]
loopx repair-install
```

`loopx clarify` creates a document set under `.loopx/`: a working copy plus
`clarification.md` and `requirements.md`. The document index records paths only.
It has no workflow stage, readiness gate, next-skill route, review verdict, or
execution policy. `loopx status` reports document presence without telling the
model what to do next.

The three canonical workflow intents are `clarify`, `spec`, and `plan2exec`.
They define goals, decisions, boundaries, and evidence. Implementation, review,
recovery, delegation, and Git disposition remain host-native model work governed
by the installed working agreement.

Human output is the default. Use `--json` for machine-readable installation,
diagnostic, and document-path payloads.

## Installation

Postinstall installs user-level skills and the working agreement:

- Codex skills: `~/.agents/skills/`
- Claude skills: `~/.claude/skills/`
- Codex guidance: managed block in `~/.codex/AGENTS.md`
- Claude guidance: managed block in `~/.claude/CLAUDE.md`

Preview writes:

```bash
loopx install-skills --target all --dry-run
```

Skip automatic postinstall setup:

```bash
LOOPX_SKIP_POSTINSTALL=1 npm install -g @ai-content-space/loopx
LOOPX_POSTINSTALL=0 npm install -g @ai-content-space/loopx
```

Repair an interrupted or conflicted install:

```bash
loopx repair-install
loopx doctor
```

To remove loopx-managed user-level artifacts, see
[Installation And CLI Onboarding Spec](./specs/installation.md).

## Maintainer Commands

Benchmark and drill evidence remains in the source repository and is not shipped
in the npm runtime package. Run the deterministic governance gate before release:

```bash
node scripts/verify-skills.mjs
```
