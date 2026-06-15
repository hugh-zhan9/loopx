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
clarify -> spec? -> plan-to-exec -> (subagent-exec | exec) -> final-review -> fix-review? -> finish
```

## Quick start

```bash
loopx install-skills --target all --yes
loopx init --slug my-feature
loopx clarify my-feature
loopx status my-feature
```

For the shortest next-step prompt after a workflow exists, run:

```bash
loopx next my-feature
```

Human output is the default for first-use commands such as `loopx init`, `loopx clarify`, `loopx status`, `loopx doctor`, and `loopx install-skills`. Use `--json` when an agent or script needs the complete runtime payload:

```bash
loopx init --slug my-feature --json
loopx clarify my-feature --json
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
- `plan-to-exec`: write a bite-sized implementation plan in the superpowers `writing-plans` style.
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
- `doc-readability`
- `requirement-analyzer`
- `go-style`
- `kratos`
- `api-designer`
- `architecture-designer`
- `sql-style`
- `cli-developer`

Support skills are lenses, not workflow states. They can be invoked directly by users, or applied by workflow skills when relevant. `requirement-analyzer` and `doc-readability` assess source documents; `api-designer`, `architecture-designer`, `sql-style`, `cli-developer`, `go-style`, and `kratos` add domain discipline during design, execution, and review without changing the core flow.

## Artifacts

For the v1 skill-suite workflow, human-maintained artifacts live under `docs/loopx/`:

- `docs/loopx/design/`
- `docs/loopx/plans/`
- `docs/loopx/reviews/`
- `docs/loopx/refactors/`
- `docs/loopx/memory/`
- `docs/loopx/specs/`

`docs/loopx/memory/` stores git-tracked shared memory for lightweight project knowledge that should follow a user across machines but is not stable enough to become a spec.

### Repo Specs And Memory

`docs/loopx/specs/` is binding long-lived repo context. Workflow skills read relevant specs before clarification, design, planning, build, and review work. Specs define durable repo rules and constraints; they are stronger than local memory and should be updated through reviewed workflow changes.

Summary: docs/loopx/specs/ is binding long-lived repo context; .loopx/memory/MEMORY.md is advisory curated memory.

`docs/loopx/specs/index.md` is optional. When present, agents use it only as a map for retrieval and prioritization; the directory remains valid without an index.

`.loopx/memory/MEMORY.md` is advisory curated memory. It summarizes useful project knowledge, but must not override current user instructions, approved source documents, or binding specs. `.loopx/memory/index.jsonl` is optional and retrieval-only: it helps agents find relevant active memory cards and is not an append-only log.

`finish` may generate spec candidates in `docs/loopx/specs/` when completed work produces stable team rules. These candidates are repo-tracked and must remain visible in the git diff.

`finish` also writes a local audit ledger under `.loopx/finish/<audit-id>/`. `none` means the work was audited, but it did not produce a durable learning candidate. Choice recording lives in that local finish audit directory, while repo-tracked spec candidates stay in `docs/loopx/specs/`.

Finish runtime commands are advanced agent/runtime plumbing, not the normal user path. `finish-start` records the starting commit for plan execution, and `finish-audit` uses that baseline to include committed `baseline..HEAD` evidence, changed files, and uncommitted status in `.loopx/finish/<audit-id>/finish-state.json` as `audit.change_window`, so finish learning/spec extraction still has input after the worktree is clean. It also writes draft `audit.extraction_candidates` for memory/spec review; agents must accept or reject those drafts before recording a done finish choice.

`finish` is the terminal completion step for one implementation decision. Rerun it only after keep-as-is, PR iteration, interruption before executing a choice, or new changes after review feedback. Do not rerun it after merge or discard.

Generated support state, hook diagnostics, installer metadata, HTML views, manifests, and runtime JSON remain under `.loopx/`.

Local advisory agent memory lives under `.loopx/memory/`:

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

Use the explicit target form for dry-run checks so the command stays non-interactive.

Successful install output lists the targets and installed skill roots. `loopx install-skills --json` includes the full inspection payload for scripts and support cases.

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

Undo installed files when you want to remove loopx-managed user-level artifacts:

```bash
rm -rf ~/.agents/skills/{clarify,spec,plan-to-exec,subagent-exec,exec,review,final-review,fix-review,finish,refactor-plan,tdd,debug,verify,doc-readability,requirement-analyzer,go-style,kratos,api-designer,architecture-designer,sql-style,cli-developer}
rm -rf ~/.claude/skills/{clarify,spec,plan-to-exec,subagent-exec,exec,review,final-review,fix-review,finish,refactor-plan,tdd,debug,verify,doc-readability,requirement-analyzer,go-style,kratos,api-designer,architecture-designer,sql-style,cli-developer}
rm -f ~/.codex/hooks/codex-workflow-hook.mjs ~/.claude/hooks/loopx-workflow-hook.mjs
```

Run the installer manually or choose targets interactively:

```bash
loopx install-skills
loopx install-skills --target codex
loopx install-skills --target claude
loopx install-skills --target claude --project
loopx install-skills --target all --add-agent-guidance
loopx install-skills --target all --yes
```

Agent guidance is opt-in. `--add-agent-guidance` writes a loopx managed block that tells agents to read Repo Specs And Memory context. For Codex user installs it writes to `~/.codex/AGENTS.md`; for Claude user installs it writes to `~/.claude/CLAUDE.md`; for Claude project installs it writes to the current repo's `CLAUDE.md`. User content outside the managed block is preserved.

Claude project install writes skills and settings to the current repository's `.claude/skills/` and `.claude/settings.json`.

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
loopx install-skills [--target <codex|claude|all>] [--project] [--mode <copy|symlink>] [--dir <path>] [--add-agent-guidance] [--yes] [--dry-run] [--json]
loopx init [--slug <slug>] [--enable-agent-delegation] [--auto-agent-delegation] [--agent-delegation-threshold <local|critic-only|parallel-review>] [--json]
loopx clarify <slug> [--standard|--deep] [--json]
loopx render [slug|--all]
loopx status [slug] [--json]
loopx next <slug> [--json]
loopx setup-context
loopx doctor [--json]
loopx migrate
loopx repair-install
```

Advanced runtime commands:

```bash
loopx help advanced
```

These commands are kept for skills, hooks, and compatibility paths. Normal users should follow `loopx status`, `loopx next`, and the suggested skill commands.

## Golden path

This is the smallest complete first-run loop:

```bash
loopx install-skills --target all --dry-run
loopx install-skills --target all --yes
loopx doctor
loopx init --slug my-feature
loopx clarify my-feature
loopx status my-feature
loopx next my-feature
```

After `clarify`, hand control to the suggested skill command, usually `$plan-to-exec <slug>`. Continue following `loopx status <slug>` or `loopx next <slug>` until `final-review` and `$finish` complete the work.

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
