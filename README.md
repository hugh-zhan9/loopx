<p align="center">
  <img src="./assets/logo.svg" alt="loopx logo" width="128" height="128">
</p>

<h1 align="center">loopx</h1>

<p align="center">
  Skill-first workflow suite for agentic coding assistants.
</p>

[中文文档](./README.zh-CN.md)

`loopx` installs a pragmatic v1 skill suite for Codex and Claude-style coding agents. It combines grill-me style clarification with superpowers-style planning, execution, review, and finishing workflows.

Recommended v1 flow:

```text
clarify -> spec? -> plan -> (subagent-exec | exec) -> final-review -> fix-review? -> finish
```

## Quick start

```bash
loopx install-skills --target all --yes
loopx init --slug my-feature
loopx clarify my-feature
loopx status my-feature
```

Human output is the default for first-use commands such as `loopx init`, `loopx doctor`, and `loopx install-skills`. Use `--json` when an agent or script needs the complete runtime payload:

```bash
loopx init --slug my-feature --json
loopx doctor --json
loopx install-skills --target all --json
```

The JSON flag also works on the default init path: `loopx init --json`.

`spec` is conditional. Use it when API, data, state, permission, migration, compatibility, product behavior, or architecture decisions must be fixed before planning. Skip it when the remaining work is local implementation choice.

## Skills

The installed and governed v1 skill surface is the list below. The repository may keep auxiliary or compatibility skill sources under `skills/`, but they are not installed by `loopx install-skills` unless they are in the bundled v1 set.

Core workflow skills:

- `clarify`: interview until scope, non-goals, constraints, and decision boundaries are clear.
- `spec`: write a design document or lightweight design note when design decisions are required.
- `plan`: write a bite-sized implementation plan in the superpowers `writing-plans` style.
- `subagent-exec`: execute an approved plan with fresh subagents and staged review.
- `exec`: execute an approved plan inline when subagents are unavailable or not desired.
- `review`: request independent code review against a git range and plan or requirements.
- `final-review`: review the completed feature for runtime, integration, and test-gap risk before finishing.
- `fix-review`: evaluate and implement code review feedback rigorously.
- `finish`: verify and choose merge, PR, keep, or discard.
- `refactor-plan`: interview and write a behavior-preserving refactor plan with tiny commits.

`review` and its matching `fix-review` run inside `subagent-exec` or `exec` as task/checkpoint review loops. `final-review` is the top-level whole-feature review before `finish`, and its feedback also goes through `fix-review`.

Support skills:

- `tdd`
- `debug`
- `verify`
- `go-style`
- `kratos`

## Artifacts

For the v1 skill-suite workflow, human-maintained artifacts live under `docs/loopx/`:

- `docs/loopx/design/`
- `docs/loopx/plans/`
- `docs/loopx/reviews/`
- `docs/loopx/refactors/`
- `docs/loopx/memory/`
- `docs/loopx/specs/`

`docs/loopx/memory/` stores git-tracked shared memory for lightweight project knowledge that should follow a user across machines but is not stable enough to become a spec.

`finish` may generate spec candidates in `docs/loopx/specs/` when completed work produces stable team rules. These candidates are repo-tracked and must remain visible in the git diff.

`finish` also writes a local audit ledger under `.loopx/finish/<audit-id>/`. `none` means the work was audited, but it did not produce a durable learning candidate. Choice recording lives in that local finish audit directory, while repo-tracked spec candidates stay in `docs/loopx/specs/`.

Public finish audit commands:

- `loopx finish-start`
- `loopx finish-audit`
- `loopx finish-record`

`loopx finish-start` records the starting commit for plan execution. `loopx finish-audit` uses that baseline to include committed `baseline..HEAD` evidence, changed files, and uncommitted status in `.loopx/finish/<audit-id>/finish-state.json` as `audit.change_window`, so finish learning/spec extraction still has input after the worktree is clean. It also writes draft `audit.extraction_candidates` for memory/spec review; agents must accept or reject those drafts before recording a done finish choice.

`finish` is the terminal completion step for one implementation decision. Rerun it only after keep-as-is, PR iteration, interruption before executing a choice, or new changes after review feedback. Do not rerun it after merge or discard.

### Archive compatibility

archive is not part of the public v1 finish flow. Older runtime state may still contain archive fields or a hidden `loopx archive <slug>` compatibility command, but normal users should complete work through `finish` and the public finish audit commands above.

Generated support state, hook diagnostics, installer metadata, HTML views, manifests, and runtime JSON remain under `.loopx/`.

Local agent memory lives under `.loopx/memory/`:

- `.loopx/memory/MEMORY.md`
- `.loopx/memory/index.jsonl`
- `.loopx/memory/entries/`
- `.loopx/memory/archive/`

`MEMORY.md` is a bounded curated project memory summary. `index.jsonl` is a curated active index for agent file-search, not an append-only log.

Shared agent memory lives under `docs/loopx/memory/`. It is repo-tracked for multi-machine continuity and should stay concise, evidence-backed, and below spec-level stability.

## Installation

Install globally:

```bash
npm install -g @ai-content-space/loopx
```

Postinstall installs user-level skills and hooks for Codex and Claude:

- Codex skills: `~/.agents/skills/`
- Claude skills: `~/.claude/skills/`
- Codex hook: `~/.codex/hooks/codex-workflow-hook.mjs`
- Claude hook: `~/.claude/hooks/loopx-workflow-hook.mjs`

To inspect without writing files:

```bash
loopx install-skills --target all --dry-run
```

The default target dry-run can also be invoked as `loopx install-skills --dry-run`.

To opt out during npm postinstall:

```bash
LOOPX_SKIP_POSTINSTALL=1 npm install -g @ai-content-space/loopx
LOOPX_POSTINSTALL=0 npm install -g @ai-content-space/loopx
```

To disable loopx hooks for one process:

```bash
LOOPX_HOOKS=0 codex
```

Repair an interrupted or conflicted install with:

```bash
loopx repair-install
loopx doctor
```

Run the installer manually or choose targets interactively:

```bash
loopx install-skills
loopx install-skills --target codex
loopx install-skills --target claude
loopx install-skills --target claude --project
loopx install-skills --target all --yes
```

Claude project install writes to the current repository's `.claude/skills/` and `.claude/settings.json`.

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

## CLI

The CLI supports installation, diagnostics, rendering, and runtime maintenance:

```bash
loopx --version
loopx install-skills [--target <codex|claude|all>] [--project] [--mode <copy|symlink>] [--dir <path>] [--yes] [--dry-run] [--json]
loopx init [--slug <slug>] [--enable-agent-delegation] [--auto-agent-delegation] [--agent-delegation-threshold <local|critic-only|parallel-review>] [--json]
loopx clarify <slug> [--standard|--deep]
loopx approve <slug> --from <stage> --to <stage>
loopx plan [slug] [--interactive] [--deliberate]
loopx build <slug> [--no-deslop]
loopx build --from-review <review-report-path> [--no-deslop]
loopx review <slug> [--reviewer <name>]
loopx autopilot <slug> [--reviewer <name>]
loopx finish-start [slug] [--source <path>] [--json]
loopx finish-audit [slug] [--baseline <git-ref>] [--json]
loopx finish-record <audit-id-or-path> --action <merge|pr|keep|discard> --status <pending|done|failed|aborted> [--summary <text>] [--url <url>]
loopx render [slug|--all]
loopx status [slug] [--json]
loopx setup-context
loopx doctor [--json]
loopx migrate
loopx repair-install
```

## Governance

The bundled skill resolver lives at:

```text
skills/RESOLVER.md
```

Run deterministic governance checks before release or when changing bundled skills:

```bash
node scripts/verify-skills.mjs
```

The verifier checks the bundled v1 skill frontmatter, plugin mirrors, resolver coverage, local references, package inclusion, version alignment, and public docs. It intentionally verifies the installed v1 skill set, not every auxiliary source directory that may exist under `skills/`.
