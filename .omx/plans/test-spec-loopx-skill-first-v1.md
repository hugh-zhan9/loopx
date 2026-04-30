# Test Spec: LoopX Skill-First V1

## Purpose

Validate that `LoopX` behaves as a skill-first product rather than a renamed CLI-first runtime, while removing `team`, migrating runtime identity, and making bundled skills discoverable in Codex after project installation.

## Scope

- bundled skill discovery/install validation
- dual-distribution identity validation
- rename migration validation
- no-team contract enforcement
- runtime/debug CLI retention
- mode contract validation for clarify/plan/build/review/autopilot
- migration and repair behavior

## Unit Test Categories

### 1. Install/discovery bootstrap

- installing the project places or links LoopX-owned skills into the local user skill-discovery target
- install writes one LoopX-owned `local` registry row per installed skill
- each row includes:
  - `source=LoopX`
  - `sourceType=local`
  - `installationIdentity=loopx`
  - `distributionChannel=npm|plugin`
  - `sourceUrl=<shell/provenance-root>`
  - `skillPath=skills/<skill-name>/SKILL.md`
  - `installedPath=<absolute ~/.agents/skills/... path>`
  - `installMethod=symlink|copy`
  - `installedAt`
  - `updatedAt`
  - `skillFolderHash`
- install is triggered by `postinstall` through `node scripts/install-skills.mjs`
- plugin install reuses the same bootstrap core and does not register a second LoopX identity
- `loopx repair-install` reuses the same bootstrap entrypoint
- repeated install is idempotent
- failed bootstrap emits a deterministic repair signal

### 2. Rename surface migration

- package name is `loopx`
- CLI help and command examples use `loopx`
- user-facing docs do not present `codex-helper` as the current product name
- product runtime root is `.LoopX/...`
- orchestration/planning metadata under `.omx/...` is not incorrectly renamed into the product runtime

### 3. No-team contract enforcement

- bundled skills do not expose `team`
- primary workflow docs do not present `team` as an active release path
- runtime command surface rejects or omits public `team` entrypoints
- release tests do not require `team` happy paths

### 4. Skill-first usability contract

- bundled skill metadata plus installed user-skill directories are jointly sufficient for Codex discovery
- bundled skills are directly usable without asking the user to reconstruct the workflow through raw CLI primitives
- stage approvals or confirmations, if retained, are accessible through the skill-facing journey rather than requiring CLI-first manual operation
- npm-installed and plugin-installed LoopX must surface the same discoverable skill set

### 5. Runtime/debug CLI retention

- `loopx` CLI still exposes the bounded runtime/debug substrate
- public support/debug commands explicitly include `approve` and `status`
- public maintenance/debug commands explicitly include `doctor`, `migrate`, and `repair-install`
- public `team` command is absent
- runtime/debug commands remain deterministic and inspectable
- CLI is documented as supporting/runtime surface, not the primary user entry

### 6. Autopilot contract

- `autopilot` exists as a bundled skill surface
- `loopx autopilot` (or equivalent runtime entry) exists as a real backing path
- V1 autopilot is explicitly validated as a composition surface over clarify/plan/build/review
- autopilot internally records approval/control events instead of requiring the user to call `approve` mid-run
- autopilot emits `.LoopX/autopilot/<slug>/run.json`
- autopilot does not require `team`
- at least one end-to-end happy-path composition is testable

## Integration Test Categories

### 1. First-open discoverability

- in a controlled fresh-home/profile test environment:
  - pre-install state has no LoopX-owned skill directories
  - pre-install state has no LoopX-owned registry rows
  - project install via `postinstall` creates the expected LoopX-owned skill directories
  - project install via `postinstall` creates the expected LoopX-owned registry rows
  - Codex/agent discovery lookup shows the bundled LoopX skills without a second manual skill-install step
- the verified installed skill set includes:
  - `clarify`
  - `plan`
  - `build`
  - `review`
  - `autopilot`

### 1a. Dual-install convergence

- install via npm/global path
- then install via plugin lifecycle wrapper
- verify the resulting `~/.agents/skills/` entries are not duplicated
- verify the resulting `~/.agents/.skill-lock.json` rows still represent one `installationIdentity=loopx` per skill
- verify Codex discovery still exposes one LoopX skill set

### 1b. Plugin artifact layout

- plugin artifacts exist under `plugins/loopx/`
- plugin descriptor exists at `plugins/loopx/.codex-plugin/plugin.json`
- plugin-facing skills exist under `plugins/loopx/skills/`
- plugin install wrapper exists at `plugins/loopx/scripts/plugin-install.mjs`
- plugin artifact layout is validated as a real packaged shell, not just a conceptual wrapper

### 2. Skill-first happy path

- install project
- verify bundled LoopX skills are discoverable
- run `clarify`
- run `plan`
- run `build`
- run `review`

This path must show:

- skill-driven entry
- LoopX naming throughout
- no `team`
- no requirement for a second explicit skill install step

### 3. Autopilot happy path

- install project
- discover `autopilot`
- run one bounded happy-path automation flow over the retained LoopX runtime
- confirm the flow composes clarify/plan/build/review rather than depending on a separate heavyweight autopilot runtime family
- confirm the flow records internal approval/control events
- confirm the flow emits `.LoopX/autopilot/<slug>/run.json`
- verify outputs land under `.LoopX/...`

### 4. Migration behavior

- existing `.codex-helper/...` runtime state is migrated or rejected with a clear repair path
- no mixed user-facing runtime state remains active after migration
- migration is bounded and deterministic

### 5. Brownfield regression protection

- the retained deterministic runtime/debug substrate still works under the new LoopX name
- artifact/state inspection remains predictable after the rename
- skill bundling does not silently break core runtime flows

## Installer / Discovery Validation

- LoopX install targets the user-skill discovery surface rather than bundled/system-only skill directories
- skill registry metadata matches installed skill paths and ownership rules
- skill registry keys are written exactly as `skills["<skill-name>"]`
- install cleanup/refresh logic avoids duplicates
- plugin and npm shells converge on the same installed paths and registry rows
- plugin shell calls the same shared bootstrap interface with `distributionChannel=plugin`
- repair command can restore discoverability after a broken registry state
- repair does not mutate unrelated non-LoopX skills
- symlink fallback behavior is deterministic and observable

## Review Validation

- review remains part of the product contract
- review is still independent from build execution
- review artifacts and runtime messages use LoopX naming
- review happy path does not depend on `team`

## Negative / Absence Checks

- `team` skill is absent from installed LoopX skill bundle
- `team` command is absent from the public LoopX CLI help
- `team` is absent from product-mode selection docs
- `team` is absent from release-level acceptance criteria
- no user-facing command examples require `codex-helper`

## Manual Smoke Checks

1. Install the project into a fresh test home/profile.
2. Confirm no LoopX-owned rows exist in `~/.agents/.skill-lock.json` before install.
3. Run install and verify `postinstall` creates LoopX-owned skill directories plus LoopX-owned registry rows.
4. Install through the plugin lifecycle wrapper and confirm the same LoopX identity is reused rather than duplicated.
5. Validate the real plugin artifact layout under `plugins/loopx/`.
6. Open Codex/agent discovery and confirm bundled LoopX skills are visible immediately.
7. Confirm no second explicit skill-install command is needed.
8. Trigger one LoopX skill and confirm it uses LoopX naming and product runtime paths.
9. Confirm `team` is not offered as a release workflow option.
10. Run `loopx autopilot` (or the equivalent skill) and confirm it uses the bounded composition model, records internal approvals, and writes `.LoopX/autopilot/<slug>/run.json`.
11. Run CLI help and confirm `approve` / `status` / `doctor` / `migrate` / `repair-install` are present and `team` is absent.
12. Simulate a broken install/discovery registry and confirm `loopx repair-install` repairs it without touching unrelated skills.
13. Place a legacy `.codex-helper` runtime directory and confirm migration or explicit rejection behavior.

## Exit Criteria

- install/discovery bootstrap tests pass
- hermetic fresh-home/profile discovery tests pass
- dual-install convergence tests pass
- rename migration tests pass
- no-team contract tests pass
- bundled LoopX skills are discoverable after install
- runtime/debug CLI still works under the LoopX name
- bounded autopilot composition tests pass
- public LoopX CLI contract tests pass
- migration/repair behavior is proven

## Suggested Verification Commands

```bash
node --test test/*.test.mjs
node src/cli.mjs --help
node scripts/install-skills.mjs --check
node src/cli.mjs doctor
node src/cli.mjs repair-install
node src/cli.mjs status --json
```
