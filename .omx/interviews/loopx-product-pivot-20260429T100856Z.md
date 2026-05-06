# Deep Interview Summary: loopx product pivot

## Topic

Reframe the current `codex-helper` repo into `loopx`, remove `team` from this phase, and clarify the install/use model before further planning.

## Final Ambiguity Assessment

- Profile: `standard`
- Outcome: sufficiently clear for planning
- Remaining ambiguity: low
- Final weighted ambiguity: `0.09`
- Threshold: `0.20`

## Key Answers

### Product direction

- This phase is a product-definition rewrite, not a local de-scope patch.
- `team` is removed from this phase and from the phase-level product contract.

### Scope

- The broader `workflow-reference.md` direction is in scope for this phase.
- This phase is allowed to reshape the product contract and surface model around that reference.

### Primary product surface

- `loopx` must be used primarily as a Codex skill.
- CLI remains in the repo, but only as an underlying runtime / debug surface.
- CLI-first usage is explicitly not the desired user experience.

### Completion signal

- A user installs the project and then opens Codex.
- Codex already shows the built-in `loopx` skills.
- The user can use those skills directly without a separate skill-install command.

### Rename boundary

- Rename is not doc-only.
- Product name, skill name, CLI name, package name, and workspace/state directory naming all move to `loopx` in this phase.

### Dual distribution boundary

- Both npm install and plugin install are first-class distribution surfaces.
- They must remain two distribution shells over one shared loopx runtime and one shared loopx skill core.
- If the user installs both, the system must collapse them into one loopx installation identity rather than surfacing duplicate skills or parallel registrations.

### Non-goals made explicit

- Do not leave the user in a CLI-first flow after install.
- Do not ship a skill shell that still requires the user to manually assemble the workflow from CLI-only primitives.
- Do not preserve `team` as an active phase capability for this release contract.

### Assumption pressure pass

- Pressure target: “install the app, open Codex, skill is already there”.
- Resolved assumption: install means the project itself performs the Codex-discoverable skill placement/registration.
- Rejected interpretation: user installs the repo, then must run a second explicit skill-install command.

## Readiness

This interview is ready to hand off to planning.

## Condensed Transcript

1. User chose a full product-definition rewrite for this phase.
2. User chose to include the broader `workflow-reference.md` direction rather than keeping it conceptual-only.
3. User defined completion as: install project, open Codex, directly use built-in skills.
4. User defined the skill as the primary surface and CLI as a retained runtime/debug surface.
5. User explicitly rejected CLI-first and skill-shell-only release outcomes.
6. User clarified that install must auto-place/register the skills without a second install step.
7. User required full rename migration, including runtime identifiers and storage directories.
8. User clarified that npm and plugin must share one core implementation.
9. User clarified that dual installation must merge into one loopx installation identity.
