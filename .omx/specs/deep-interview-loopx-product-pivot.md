# Deep Interview Spec: LoopX product pivot

## Metadata

- Profile: `standard`
- Context type: `brownfield`
- Rounds: `7`
- Final ambiguity: `0.09`
- Threshold: `0.20`
- Readiness: `plan-ready`
- Context snapshot: `.omx/context/loopx-product-pivot-20260429T100856Z.md`

## Clarity Breakdown

| Dimension | Score |
| --- | --- |
| Intent | 0.84 |
| Outcome | 0.95 |
| Scope | 0.95 |
| Constraints | 0.82 |
| Success Criteria | 0.92 |
| Context | 0.84 |

## Intent

Turn the current `codex-helper` repo into `LoopX`, with a product shape centered on installable, Codex-discoverable built-in skills rather than CLI-first usage.

## Desired Outcome

After installing the project, a user opens Codex and immediately sees the built-in `LoopX` skills, then uses `LoopX` through those skills directly.

## In Scope

- Remove `team` from the current phase-level product contract.
- Reframe the project identity from `codex-helper` to `LoopX`.
- Make the skill surface the primary user-facing product surface.
- Retain a CLI/runtime layer only as an underlying execution/debug substrate.
- Migrate runtime-facing names as part of this phase:
  - product name
  - skill names
  - CLI name
  - package name
  - workspace/state directory naming
- Use `workflow-reference.md` as an in-scope direction for the new product framing.
- Ensure project installation itself performs the Codex-discoverable skill placement/registration needed for first-open usage.
- Support both npm install and plugin install as first-class distribution surfaces over one shared LoopX core.

## Out of Scope / Non-goals

- CLI-first user onboarding.
- Requiring a second explicit skill-install command after installing the project.
- Shipping a thin skill shell that still forces users to manually operate the product through raw CLI primitives.
- Preserving `team` as an active capability in this release contract.

## Decision Boundaries

OMX / implementation may decide without further confirmation:

- how the retained CLI/debug substrate is organized internally
- how built-in skill registration/placement is technically implemented
- how `workflow-reference.md` is mapped into concrete docs/artifacts, as long as the user-facing product contract remains skill-first and team-free

Must still be surfaced explicitly during planning or implementation if they become material tradeoffs:

- any compatibility shim that keeps old `codex-helper` runtime identifiers alive beyond a bounded migration path
- any fallback that weakens “install once, open Codex, skills already present”
- any partial rename that leaves user-facing surfaces split between `codex-helper` and `LoopX`
- any install design that creates two parallel LoopX identities when npm and plugin are both present

## Constraints

- This is a brownfield refactor of an existing repo that already contains:
  - `codex-helper` naming
  - an implemented `team` path
  - local workflow state and artifact generation
- The next step should be planning, not direct implementation from deep-interview.
- Product contract changes must be explicit enough to replace the previous “team mandatory in V1” direction.

## Testable Acceptance Criteria

- The repo presents itself as `LoopX`, not `codex-helper`, across user-facing product surfaces.
- `team` is removed from the current release contract and primary workflow framing.
- The primary user entry is a built-in `LoopX` skill surface discoverable in Codex after project installation.
- Users do not need to run a second explicit skill-install command after installing the project.
- CLI remains available only as a supporting runtime/debug surface and is not the primary usage path.
- Planning and later implementation artifacts reflect the renamed runtime/storage surfaces needed by the new product contract.
- npm install and plugin install both resolve to one shared LoopX runtime/skill core.
- If both install paths are present, Codex still exposes one LoopX skill set and one LoopX installation identity.

## Assumptions Exposed + Resolutions

- Assumption: “install the app” might still allow a second manual skill-install step.
  - resolution: rejected; install of the project itself must handle Codex-discoverable skill placement/registration
- Assumption: the project could be renamed at the surface layer while keeping `codex-helper` runtime names indefinitely.
  - resolution: rejected for this phase; runtime-facing names must migrate too
- Assumption: skill could just be a doc wrapper around CLI-only flows.
  - resolution: rejected; skill must be directly usable as the real product surface
- Assumption: npm and plugin could be separate but equivalent implementations.
  - resolution: rejected; they must share one LoopX core
- Assumption: dual installation could be left ambiguous.
  - resolution: rejected; dual install must collapse into one installation identity

## Pressure-Pass Findings

- Revisited earlier success claim: “install and use in Codex”.
- Hidden assumption uncovered: what “install” actually means operationally.
- Clarified result: a single project install must be sufficient for Codex to discover the built-in `LoopX` skills on open.

## Brownfield Evidence vs Inference

### Evidence

- Current repo/product name is still `codex-helper`.
- Current implementation already includes a `team` path.
- `workflow-reference.md` already introduces a `LoopX` framing and `.LoopX/...` path direction.

### Inference

- Converting the product into a built-in skill-first surface will likely require packaging/installation changes beyond the current CLI-only structure.

## Technical Context Findings

- Existing likely touchpoints:
  - `workflow-reference.md`
  - `README.md`
  - `package.json`
  - `src/cli.mjs`
  - `src/workflow.mjs`
  - `src/team-runtime.mjs`
  - `.omx/plans/*codex-helper*`
  - future plugin packaging/descriptor surface
  - current local skill registry targets under `~/.agents/`
- Existing previous plan assumptions about `team` are now superseded by the user's new direction.

## Execution Bridge

### Recommended: `$ralplan`

- Why: this is a product-contract rewrite with rename, packaging, install/discovery, and skill-surface implications; it needs a new PRD and test spec before implementation.
- Input artifact: `.omx/specs/deep-interview-loopx-product-pivot.md`
- Expected output: updated planning artifacts for `LoopX`, replacing the prior `codex-helper` / team-in-V1 assumptions.

### Optional later lanes

- `$ralph`
  - use after the new PRD/test spec are approved and implementation must be carried through with verification
- `$team`
  - not recommended for this next phase because the clarified contract explicitly removes `team` from the release product surface
- Refine further
  - only needed if naming/packaging/discovery tradeoffs prove more ambiguous during planning
