# loopx

`loopx` is a skill-first workflow product for Codex. It supports two first-class distribution shells:

- npm/global install
- Codex plugin install

Both shells converge on one shared loopx core and one visible loopx skill set.

## Release Contract

The active loopx release flow is:

`clarify -> plan -> build -> review`

Bundled skill surfaces:

- `clarify`
- `plan`
- `build`
- `review`
- `autopilot`

There is no public `team` surface in this release.

## Product Positioning

- skill-first for normal use
- retained CLI/runtime/debug substrate for maintenance and inspection
- explicit local artifacts and state under `.loopx/`
- bounded migration from legacy `.codex-helper/`

## Runtime Namespace

loopx user-facing runtime state is stored under:

```text
.loopx/
```

Key subtrees:

- `.loopx/specs/`
- `.loopx/plans/`
- `.loopx/workflows/<slug>/`
- `.loopx/autopilot/<slug>/`

The `.omx/` tree remains orchestration/planning metadata and is not part of the loopx runtime rename.

## CLI Surface

Primary runtime/debug commands:

```bash
loopx init [--slug <slug>]
loopx clarify <slug>
loopx approve <slug> --from <stage> --to <stage>
loopx plan <slug>
loopx build <slug>
loopx review <slug> [--reviewer <name>]
loopx autopilot <slug> [--reviewer <name>]
loopx status [slug] [--json]
loopx doctor
loopx migrate
loopx repair-install
```

The CLI is supporting runtime/debug tooling. The intended user-facing product surface is the bundled loopx skills.

## Install and Discovery

loopx supports two install paths that both reuse the same shared install/discovery core:

- npm/global install:
  - `npm install -g @ai-content-space/loopx`
  - followed by `postinstall -> node scripts/install-skills.mjs`
- plugin install:
  - `plugins/loopx/scripts/plugin-install.mjs`

Bootstrap behavior:

- materializes loopx-owned skills under `~/.agents/skills/`
- updates loopx-owned `local` rows in `~/.agents/.skill-lock.json`
- keeps install idempotent
- supports repair through `loopx repair-install`
- converges npm and plugin installs onto one `installationIdentity=loopx`

Discovery is valid only when both are true:

- the installed loopx skill directory exists
- the matching loopx-owned registry row exists

If both npm and plugin installs are present, Codex should still expose one loopx skill set rather than duplicates.

## Legacy Migration

- legacy `.codex-helper/` runtime state is migrated through `loopx migrate`
- mixed `.loopx/` and `.codex-helper/` roots are treated as a repairable error
- public docs, package, CLI, and skill names use `loopx`

## Verification

```bash
node --test test/*.test.mjs
node scripts/install-skills.mjs --check
node --test plugins/loopx/scripts/plugin-install.test.mjs
node src/cli.mjs --help
node src/cli.mjs doctor
node src/cli.mjs status --json
```
