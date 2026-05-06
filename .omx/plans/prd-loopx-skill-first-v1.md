# PRD: loopx Skill-First V1

## Supersession Notice

This plan supersedes the previous `codex-helper` product plan for this repo:

- `.omx/plans/prd-codex-helper-product-v1.md`
- `.omx/plans/test-spec-codex-helper-product-v1.md`

Those artifacts assumed `team` was mandatory in V1 and that the product was primarily a repo-local CLI/runtime. Both assumptions are now explicitly invalidated by the clarified `loopx` direction.

## Requirements Summary

`loopx` is a skill-first workflow product for Codex users.

The product goal for this phase is:

- install the project once
- open Codex
- immediately discover and use built-in `loopx` skills
- support both npm install and plugin install as equal first-class distribution surfaces
- keep those two distribution surfaces on one shared loopx core and one shared installation identity

The product contract for this phase is:

`clarify -> plan -> build -> review`

with:

- `autopilot` included as a top-level bundled skill surface
- `team` removed from the release contract
- CLI retained only as a supporting runtime/debug substrate
- runtime-facing names migrated from `codex-helper` to `loopx`
- npm and plugin treated as equal distribution shells over the same loopx runtime/skill core

This plan is grounded in:

- clarified requirements: `.omx/specs/deep-interview-loopx-product-pivot.md`
- context snapshot: `.omx/context/loopx-product-pivot-20260429T100856Z.md`
- current workflow framing draft: `workflow-reference.md`
- current runtime surface: `src/cli.mjs`
- current deterministic engine: `src/workflow.mjs`
- current install/discovery core: `src/install-discovery.mjs`
- current runtime maintenance layer: `src/runtime-maintenance.mjs`
- current stage skill surface: `skills/*/SKILL.md`
- current docs/runtime identity: `README.md`, `package.json`
- current local skill-discovery evidence:
  - `~/.agents/.skill-lock.json`
  - `~/.agents/skills/`
  - `~/.codex/skills/`

## Current Brownfield Facts

- The current repo implementation has already pivoted to `loopx` in package/runtime/docs/skills, but the active planning question is now dual-distribution convergence rather than basic rename.
- The current runtime persists user-facing state under `.loopx/...`.
- The current runtime has already removed public `team` from the active release surface.
- The repo already has the bundled loopx skill surface under `skills/loopx-*`.
- The current repo already has an npm/global install bootstrap via:
  - `postinstall`
  - `scripts/install-skills.mjs`
- The current repo does **not** yet have a concrete plugin shell/descriptor lifecycle in the codebase, so plugin remains a planning-specified but not yet implemented distribution surface.
- The observed local skill-discovery model on this machine includes:
  - user-installed skill registry metadata in `~/.agents/.skill-lock.json`
  - user-installed skill folders in `~/.agents/skills/`
  - bundled/system skills in `~/.codex/skills/`
- The current repo already has a bounded `autopilot` runtime and skill surface.
- `workflow-reference.md` remains directional rather than literal contract truth.

## Acceptance Criteria

### Product identity

- The product presents itself as `loopx`, not `codex-helper`, across:
  - README and user docs
  - package name
  - CLI name
  - skill names
  - product runtime directories
- User-facing product runtime state/artifacts move to `.loopx/...`.
- `.omx/...` remains orchestration/planning metadata rather than product runtime naming, and is not treated as a rename target for the user-facing product.

### Product surface

- The primary user-facing surface is a built-in `loopx` skill bundle discoverable inside Codex after installing the project.
- Users do not need to run a second explicit skill-install command after installing the project.
- CLI remains available only as a supporting runtime/debug surface.
- The skill-first surface must be sufficient for normal use; CLI-first usage is not the happy path.

### Workflow contract

- `team` is removed from the current release contract and bundled skill surface.
- The canonical release flow is:
  - `clarify`
  - `plan`
  - `build`
  - `review`
- `autopilot` is included as a bundled top-level skill surface for this phase.
- Stage entry and human confirmations may be skill-driven; low-level CLI approval/control paths may still exist for debugging and automation, but they are not the primary user experience.

### Installation / discovery contract

- Installing the project is sufficient to place/register `loopx` skills into Codex-discoverable locations.
- Plugin installation is also sufficient to place/register the same `loopx` skills into Codex-discoverable locations.
- Install is idempotent: repeated installs do not duplicate or corrupt skill registrations.
- Install either creates or refreshes the local user-skill registration state required for discovery.
- If discovery installation fails, the product emits a concrete repair path rather than silently succeeding.
- If both npm and plugin install paths are used, they collapse into one loopx installation identity and one visible loopx skill set.

### Runtime / migration contract

- The current `codex-helper` runtime/storage identity migrates to `loopx`.
- Old `.codex-helper` runtime data must either:
  - be migrated explicitly into `.loopx`, or
  - be rejected with a clear migration/recovery path.
- No indefinite split state is allowed where user-facing runtime identity remains partly `codex-helper` and partly `loopx`.

## RALPLAN-DR Summary

### Principles

1. Make `loopx` skill-first in actual install/use behavior, not only in docs.
2. Keep the runtime substrate explicit and deterministic, but demote it below the bundled skill surface.
3. Remove `team` cleanly from the release contract rather than leaving half-removed codepaths and docs.
4. Prefer bounded migration and install mechanics over long-lived dual identity.
5. Keep `workflow-reference.md` as directional truth, but translate it into a right-sized V1 contract grounded in the existing repo.

### Decision Drivers

1. The user’s success criterion is first-open Codex discoverability of built-in `loopx` skills.
2. The release contract must remove `team`, not merely hide it.
3. The current repo already has reusable runtime/skill scaffolding that can be renamed and re-bundled faster than a total rewrite.
4. npm and plugin must not fork into separate implementations or duplicate installation identities.

### Viable Options

#### Option A: Reuse the current runtime substrate, convert it into a loopx skill bundle with install-time discovery bootstrap

Pros:

- Reuses working deterministic engine, skill folders, tests, and docs scaffolding.
- Fits the current Node/package layout and the observed local skill-discovery model.
- Minimizes rewrite cost while still allowing a product-level rename and surface inversion.
- Can support both npm and plugin as packaging/distribution shells over the same core.

Cons:

- Requires install/bootstrap work that the repo does not currently have.
- Requires removing `team` from runtime, tests, docs, and bundled skills without leaving contract drift.
- Requires a non-trivial rename/migration pass across runtime paths and identifiers.
- Requires deduplication rules when npm and plugin are both present.

#### Option B: Rebuild loopx as a plugin/marketplace-first distribution, treating the current repo runtime as disposable

Pros:

- Aligns strongly with “built-in skill” product language.
- Could provide a more packaged distribution story long-term.

Cons:

- Weakly grounded in the current repo.
- Adds packaging/distribution unknowns before the core runtime/skill contract is settled.
- High risk of spending the phase on packaging mechanics instead of a usable loopx contract.

#### Option C: Keep the current CLI/runtime product and only add thin loopx skill wrappers

Pros:

- Lowest implementation cost.
- Reuses almost everything immediately.

Cons:

- Violates the clarified success criteria.
- Leaves users in a CLI-first or shell-wrapper flow.
- Fails the explicit non-goal of “skill shell over raw CLI primitives”.

### Option Decision

Choose **Option A**.

Why:

- It is the only option that is both grounded in the current repo and aligned with the clarified “install once, open Codex, use built-in loopx skills” requirement.
- It avoids the product failure mode of shipping loopx as a renamed wrapper around a still-primary CLI.
- It keeps the scope focused on contract migration, skill bundling, and install/bootstrap rather than expanding into a full plugin-distribution rewrite.

Rejected alternatives:

- Option B is invalidated for this phase because it optimizes packaging/distribution form before the renamed runtime and bundled-skill contract are made reliable.
- Option C is invalidated because it directly violates the user’s stated success criteria and non-goals.

## ADR

### Decision

Convert the current `codex-helper` repo into `loopx` by reusing the deterministic runtime substrate, removing `team`, renaming runtime identifiers, bundling loopx-first skills, and adding one shared install/discovery core that can be invoked from both npm and plugin distribution shells.

### Drivers

- Skill-first install/use is mandatory.
- `team` is explicitly removed from this phase.
- Current runtime and skill scaffolding are reusable.
- Both distribution surfaces must converge on one shared identity.

### Alternatives considered

- Plugin/marketplace-first rebuild
- Thin loopx wrappers over the current CLI-first product

### Why chosen

This path is the smallest implementation that still satisfies the clarified user outcome and removes the old product-shape contradictions.

### Consequences

- Runtime identifiers and storage directories become breaking changes.
- `team` code/tests/docs will be removed or retired from the active release surface.
- A local skill installation/bootstrap mechanism becomes a first-class part of the product.
- A plugin wrapper/descriptor becomes a peer distribution shell, not a separate implementation.
- `autopilot` must exist as a bundled surface even if its first implementation is thinner than the long-horizon reference vision.

### Follow-ups

- Define the exact bundled skill set and naming.
- Define install/bootstrap write targets and failure handling.
- Define migration behavior from `.codex-helper` to `.loopx`.
- Define how `workflow-reference.md` is translated into V1 docs without over-committing to every future mode behavior.

## Canonical Product Surface

### Bundled loopx skills

The bundled user-facing skill set for this phase is:

- `clarify`
- `plan`
- `build`
- `review`
- `autopilot`

`team` is not a bundled skill in this release contract.

### Equal distribution surfaces

loopx V1 supports exactly two first-class distribution surfaces:

- npm/global install
- Codex plugin install

These are equal external entrypoints over one shared loopx core.

### CLI/runtime substrate

The supporting runtime/debug CLI surface is:

- `loopx init`
- `loopx clarify`
- `loopx plan`
- `loopx build`
- `loopx review`
- `loopx autopilot`
- bounded maintenance/debug commands as needed:
  - `loopx approve`
  - `loopx status`
  - `loopx doctor`
  - `loopx migrate`
  - `loopx repair-install`

The CLI may expose lower-level debugging/repair paths, but the default product journey is through bundled skills.

### Public CLI contract freeze

For this phase, the public loopx CLI is classified as:

- primary runtime/debug commands:
  - `loopx init`
  - `loopx clarify`
  - `loopx plan`
  - `loopx build`
  - `loopx review`
  - `loopx autopilot`
- public support/debug commands:
  - `loopx approve`
  - `loopx status`
  - `loopx doctor`
  - `loopx migrate`
  - `loopx repair-install`
- removed public commands:
  - `loopx team`

`approve` and `status` remain public in V1 as support/debug commands because the retained deterministic runtime still uses explicit gate inspection and transition control.

## Canonical Runtime Namespace

### Product runtime root

The user-facing product runtime root becomes:

- `.loopx/`

Required subtrees:

- `.loopx/context/`
- `.loopx/specs/`
- `.loopx/plans/`
- `.loopx/workflows/<slug>/`

### Naming boundary

- `.loopx/...` is the product runtime namespace.
- `.omx/...` remains orchestration/planning metadata for the agent workflow and is not part of the loopx user-facing rename surface.

## Install and Discovery Contract

### Canonical install behavior

Install must perform all steps needed for Codex discovery of the bundled loopx skills without a second explicit skill-install command.

Chosen baseline:

- repo-owned bundled skill source remains inside this project under `skills/`
- install/bootstrap writes or links loopx-owned skill entries into the local user skill-discovery area
- install/bootstrap updates the local user skill registry metadata required for discoverability

### Grounded local target

Based on current local evidence, the primary target for project-installed skills is:

- `~/.agents/skills/`

with corresponding registry metadata in:

- `~/.agents/.skill-lock.json`

`~/.codex/skills/` is treated as bundled/system territory and is not the preferred writable target for loopx project installation.

### Install / discovery ADR

#### Decision

loopx V1 uses a **shared-core dual-shell install model**:

- repo-owned canonical skill sources live in `<project-root>/skills/`
- repo-owned canonical runtime/debug substrate lives in the same project
- npm install and plugin install both invoke the same install/discovery core
- install materializes loopx-owned user-discoverable skill directories under:
  - `~/.agents/skills/clarify/`
  - `~/.agents/skills/plan/`
  - `~/.agents/skills/build/`
  - `~/.agents/skills/review/`
  - `~/.agents/skills/autopilot/`
- each installed skill directory is created as a symlink to the repo-owned source by default
- if symlink creation is not possible, install may fall back to a copied directory, but it must record that fallback explicitly
- install updates `~/.agents/.skill-lock.json` with one loopx-owned row per installed skill
- no install path is allowed to create a second parallel loopx identity

#### Merged installation identity

All loopx-owned rows must carry one shared identity field:

- `installationIdentity`: `loopx`

This field is the canonical identity key for deduplication and convergence across npm and plugin shells.

Rules:

- npm-installed and plugin-installed loopx rows with the same `installationIdentity=loopx` are the same product identity
- `sourceUrl` is provenance only, not identity
- `distributionChannel` may differ between shells without creating a second loopx identity
- repair, refresh, and convergence logic key first on `installationIdentity`, then on loopx-owned skill path/installed path rules

#### Trigger selection

The canonical install/bootstrap trigger for this phase is:

- package-manager lifecycle hook: `postinstall`
- plugin-install lifecycle hook: plugin bootstrap entry

Canonical implementation shape:

- `package.json` invokes a single bootstrap entrypoint:
  - `node scripts/install-skills.mjs`
- plugin install delegates to that same bootstrap core rather than re-implementing registration logic
- plugin shell lifecycle passes `distributionChannel=plugin` into the shared bootstrap core
- the same bootstrap entrypoint is reused by:
  - `loopx repair-install`
  - fresh-home/profile integration tests

Rejected trigger models:

- bootstrap only on first `loopx init`
- bootstrap only on first skill invocation
- bootstrap only by a second explicit “install skills” command

#### Required registry row shape

Each loopx-owned row in `~/.agents/.skill-lock.json` must contain:

- `source`: `loopx`
- `sourceType`: `local`
- `installationIdentity`: `loopx`
- `distributionChannel`: `npm` or `plugin`
- `sourceUrl`: absolute shell/provenance root
- `skillPath`: `skills/<skill-name>/SKILL.md`
- `installedPath`: absolute installed user-skill path under `~/.agents/skills/<skill-name>/`
- `installMethod`: `symlink` or `copy`
- `installedAt`
- `updatedAt`
- `skillFolderHash`

#### Registry keying convention

loopx writes rows under the existing top-level registry shape:

- `skills["clarify"]`
- `skills["plan"]`
- `skills["build"]`
- `skills["review"]`
- `skills["autopilot"]`

No alternate keying convention is allowed in V1.

#### Shared bootstrap interface

The shared install/discovery core must expose one explicit interface shape:

```ts
installBundledSkills(env, {
  installationIdentity: 'loopx',
  distributionChannel: 'npm' | 'plugin',
  sourceUrl: string,
  targetSkillsRoot?: string,
  targetSkillLockPath?: string
})
```

Rules:

- npm shell passes `distributionChannel='npm'`
- plugin shell passes `distributionChannel='plugin'`
- `installationIdentity='loopx'` is invariant across both shells
- `sourceUrl` records provenance only and may differ by shell
- the shared core must not derive identity from `sourceUrl`

#### Discovery rule

For loopx-owned project installs, discovery is considered valid only when **both** of the following are true:

- installed user-skill directory exists at the expected `~/.agents/skills/<skill-name>/` path
- corresponding loopx-owned registry row exists in `~/.agents/.skill-lock.json`

Directory presence alone is not sufficient.
Registry row presence alone is not sufficient.

#### Dual-install identity rule

When both npm and plugin installation paths are present:

- both must resolve to the same installed skill directories
- both must resolve to the same `~/.agents/.skill-lock.json` loopx-owned rows keyed by `skills["<skill-name>"]`
- Codex must expose one visible loopx skill set, not duplicated skills
- plugin metadata may record its own packaging provenance, but not by creating a second loopx discovery identity

#### Ownership and refresh rule

loopx-owned installed skills are identified by:

- `source=loopx`
- `sourceType=local`
- `installationIdentity=loopx`
- installed skill directory basename beginning with `loopx-`

Refresh/repair/uninstall logic must only mutate rows/directories that match those ownership signals.
Distribution-source metadata may distinguish npm vs plugin provenance internally, but that distinction must remain subordinate to the single loopx installation identity.

#### Repair rule

`loopx repair-install` must:

- detect missing installed skill directories
- detect missing loopx-owned registry rows
- detect stale `installedPath` / `skillFolderHash` mismatches
- restore the canonical installed directories and registry rows
- leave unrelated user-installed skills untouched
- converge stale npm/plugin provenance rows back onto one `installationIdentity=loopx` row per skill

#### Rejected alternatives

- writing directly into `~/.codex/skills/`
- relying on directory presence without registry metadata
- requiring a second explicit “install skill” command after project installation
- allowing npm and plugin to register separate loopx identities

### Minimal plugin shell boundary

The minimum plugin shell for this phase is:

- plugin-root layout following the existing Codex plugin convention:
  - `plugins/loopx/.codex-plugin/plugin.json`
  - `plugins/loopx/skills/`
  - `plugins/loopx/scripts/plugin-install.mjs`

Contract:

- the plugin shell does not contain a second implementation of loopx skills/runtime
- plugin skill payload is a generated/mirrored shell over the canonical root `skills/` set
- the plugin shell delegates to the same shared install/discovery core as npm install
- plugin installation passes explicit `distributionChannel=plugin`
- plugin uninstall/refresh must target the same `installationIdentity=loopx`
- the plugin descriptor must point only to plugin-root-relative assets, not back-reference arbitrary repo-root paths

### Install guarantees

- install is idempotent
- existing loopx-installed skills are refreshed, not duplicated
- partial install failure is surfaced explicitly
- repair path is available and documented

### Non-goals for install

- no second manual skill-install step after project installation
- no hidden write into system/bundled skill directories when user-skill installation is sufficient
- no silent fallback that leaves the product installed but undiscoverable

## Mode Contract for This Phase

### `clarify`

- role: requirements clarification and spec generation
- primary output: `.loopx/specs/clarify-<slug>-<timestamp>.md`

### `plan`

- role: consensus planning and decision artifact generation
- primary output: `.loopx/plans/prd-<slug>.md`, `.loopx/plans/test-spec-<slug>.md`

### `build`

- role: persistent execution loop with verification
- primary output: `.loopx/workflows/<slug>/...` execution artifacts

### `review`

- role: post-execution acceptance / review surface
- primary output: review verdict artifact inside `.loopx/workflows/<slug>/`

### `autopilot`

- role: top-level bundled automation surface that composes clarified/planned execution
- V1 interpretation:
  - **not** a separate heavy autonomous runtime family imported wholesale from `workflow-reference.md`
  - **is** a bundled loopx composition surface over:
    - `clarify`
    - `plan`
    - `build`
    - `review`
- minimum phase requirement:
  - callable as a bundled loopx skill
  - backed by a real `loopx autopilot` runtime entry
  - executes one bounded happy-path composition using the retained runtime/debug substrate
  - writes outputs into the renamed `.loopx/...` runtime namespace
- does not require the `team` surface

#### Autopilot control semantics

V1 `autopilot` is a **single-invocation composition path**, not a separate approval-gated stage family.

Chosen behavior:

- one user invocation authorizes one bounded autopilot run
- inside that run, autopilot may satisfy stage approvals internally for:
  - clarify -> plan
  - plan -> build
  - build -> review
- those internal approvals are recorded as autopilot-owned control events
- the user does not need to call `approve` mid-run
- autopilot writes through the same canonical loopx runtime artifact model used by the stage runtime
- autopilot also writes an orchestration ledger at:
  - `.loopx/autopilot/<slug>/run.json`

Bounded happy-path composition means:

- produce a clarified spec
- produce a plan package
- execute one build path
- produce one review verdict
- complete without invoking `team`

Rejected autopilot models:

- importing the full heavyweight future autopilot concept from `workflow-reference.md` into this phase
- requiring the user to manually call `approve` between internal autopilot steps
- bypassing canonical loopx artifacts/state

## Team Removal Decision

This phase removes `team` from:

- bundled skill surface
- README and user-facing product framing
- primary workflow contract
- release acceptance criteria
- test plan happy paths

Surface-by-surface retirement rule:

- `skills/team/SKILL.md`
  - delete
- public `team` command in CLI help and routing
  - delete
- README / workflow docs public `team` references
  - delete
- release-level tests that validate `team` as a happy path
  - delete or replace
- runtime code dedicated only to public `team` execution
  - delete by default
  - if temporary quarantine is required during refactor, move under an explicit non-public retired/internal path and remove it from all release docs, commands, and tests before the phase closes

Team-related code may either be:

- removed outright, or
- retired behind explicit non-release/internal status

But it must not remain part of the current product contract or public install/use story.

## Migration Decision

This phase uses bounded migration, not indefinite compatibility.

Chosen direction:

- provide an explicit migration path from `.codex-helper/` to `.loopx/`
- migrate or reject old runtime data with a clear repair path
- do not preserve long-lived mixed naming in the active runtime

Rejected migration model:

- keeping both `.codex-helper` and `.loopx` as equal long-term active runtime roots

## Documentation Translation Rule

`workflow-reference.md` is directional input, not a literal contract transplant.

Translation rule:

- preserve the user-facing shape:
  - clarify
  - plan
  - build
  - review
  - autopilot
- do not over-commit the phase to every future ambition implied by the draft
- keep phase acceptance anchored to skill-first installation, rename migration, team removal, and working bundled loopx skills

## Deliverables

1. Renamed `loopx` product identity across package/CLI/docs/skills/runtime paths
2. Removal of `team` from the active release contract
3. Bundled `loopx` skill set with Codex-discoverable installation/bootstrap
4. Retained but demoted runtime/debug CLI substrate
5. `autopilot` bundled skill/runtime surface for this phase
6. Migration/repair story from `codex-helper` runtime identity to `loopx`
7. Updated tests proving install/discovery, rename, and team removal
8. Plugin distribution shell that reuses the same loopx install/discovery core

## Implementation Plan

1. **Replace the public contract**
   - rewrite README, package identity, command naming, and skill identity from `codex-helper` to `loopx`
   - replace the old `team`-inclusive product framing with the new skill-first contract

2. **Rename the runtime namespace**
   - migrate runtime root from `.codex-helper/` to `.loopx/`
   - add bounded migration/repair behavior
   - keep `.omx/` explicitly out of the product rename scope

3. **Rebuild the bundled skill surface**
   - rename/restructure repo-local skills into the bundled loopx set
   - remove `team`
   - add `autopilot`
   - ensure each bundled skill is usable as a first-class Codex-facing entrypoint

4. **Add install/discovery bootstrap**
   - add install-time placement/registration of loopx skills into local discoverable user-skill locations
   - wire bootstrap through `postinstall` and `scripts/install-skills.mjs`
   - add a plugin shell under `plugins/loopx/` that reuses the same bootstrap core
   - update or write skill-lock metadata as needed
   - add repair/doctor paths for broken discovery state
   - implement the loopx-owned `local` registry row shape and ownership rules defined above
   - enforce one loopx installation identity even when npm and plugin are both present

5. **Refactor the retained CLI/runtime substrate**
   - rename CLI surface from `codex-helper` to `loopx`
   - freeze `approve` and `status` as public support/debug commands
   - add `doctor`, `migrate`, and `repair-install`
   - keep CLI as runtime/debug substrate rather than the primary journey
   - remove or retire `team` runtime entrypoints from the active release contract

6. **Translate `workflow-reference.md` into a right-sized phase contract**
   - preserve the targeted mode set
   - keep `autopilot` real but bounded as a composition surface over clarify/plan/build/review
   - implement autopilot as a single-invocation composition path with internal recorded approvals
   - avoid overscoping into unbounded future-mode expansion

7. **Expand verification**
   - add tests for install/discovery bootstrap, rename migration, no-team contract, bundled skill discoverability, and phase-level happy paths

## Risks and Mitigations

### Risk 1: install-time skill registration is brittle across local environments

- Risk: loopx installs successfully as a package but fails to become discoverable in Codex.
- Mitigation: ground install behavior in the observed local user-skill registry model, define the exact loopx-owned local row shape, make install idempotent, and add explicit repair diagnostics.

### Risk 1a: npm and plugin distributions fork the installation identity

- Risk: users see duplicate loopx skills or drift between npm-installed and plugin-installed loopx behavior.
- Mitigation: force both distribution shells through one shared install/discovery core and test dual-install coexistence explicitly.

### Risk 2: the product remains secretly CLI-first

- Risk: users technically have skills, but those skills only bounce them into a raw CLI workflow.
- Mitigation: treat skill-first usability as a release acceptance gate, not a docs preference.

### Risk 3: rename migration leaves mixed identity

- Risk: user-facing docs say loopx while runtime/state still behaves like `codex-helper`.
- Mitigation: use bounded migration and explicit rejection/repair rules instead of indefinite compatibility.

### Risk 4: removing `team` leaves public contract drift

- Risk: docs, skills, CLI, tests, and runtime disagree about whether `team` exists.
- Mitigation: treat team removal as a cross-cutting contract change and test for absence from public surfaces.

### Risk 5: `autopilot` scope expands uncontrollably

- Risk: phase stalls trying to fully realize every long-horizon promise in `workflow-reference.md`.
- Mitigation: keep this phase’s `autopilot` requirement bounded to a real bundled composition surface plus at least one end-to-end happy path over the retained runtime.

## Verification Steps

1. Install/bootstrap tests prove loopx skills land in Codex-discoverable local user-skill locations without a second install step.
2. Install/bootstrap tests prove both directory presence and loopx-owned registry rows exist for discovery.
3. Install/bootstrap tests prove `postinstall` and `loopx repair-install` both drive the same canonical bootstrap entrypoint.
4. Dual-distribution tests prove npm install and plugin install converge on one loopx installation identity and one visible loopx skill set.
   - plugin-path tests validate a real plugin-root artifact layout under `plugins/loopx/`
   - plugin lifecycle tests simulate the local wrapper without requiring a live marketplace install
5. Rename tests prove package name, CLI name, skill names, and runtime directories are all migrated to loopx.
6. Contract tests prove `team` is absent from the active release surface.
7. Happy-path tests prove a user can use bundled loopx skills after install.
8. Runtime tests prove the retained CLI/debug substrate still works under the loopx name.
9. Autopilot tests prove the V1 composition surface works without requiring a separate heavy runtime or `team`, and records internal approval events plus `.loopx/autopilot/<slug>/run.json`.
10. Migration tests prove `.codex-helper` runtime data is migrated or rejected with a clear repair path.

## Available-Agent-Types Roster

- `planner`
- `architect`
- `critic`
- `executor`
- `verifier`
- `test-engineer`
- `debugger`
- `writer`
- `dependency-expert`
- `build-fixer`

## Follow-up Staffing Guidance

### Recommended `ralph` lane

- `executor` — `high`
  - own rename, runtime refactor, skill bundling, and install bootstrap
- `test-engineer` — `medium`
  - own install/discovery and migration regression coverage
- `verifier` — `high`
  - own release-surface checks for skill-first usability and no-team contract drift

### Recommended `team` lane

Not recommended for the next execution phase because the clarified loopx release contract explicitly removes `team` from the active product surface. If coordination is still needed internally, keep it invisible to the public loopx contract.
