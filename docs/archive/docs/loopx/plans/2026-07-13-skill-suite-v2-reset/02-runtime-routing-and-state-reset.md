# Runtime Routing And State Reset Implementation Plan

**Source:** `00-overview.md`

**Goal:** Make CLI guidance persist and honor the clarify design gate while accepting only the new current state contract.

**Architecture:** Add an explicit clarify `handoff_decision` to workflow state and route `next` from it. Reject or ignore pre-v2 running state instead of migrating it.

**Support lenses:** cli-developer, architecture-designer

## Global Constraints

- Valid clarify handoffs are `needs_spec`, `direct_to_plan`, and `blocked`.
- No read-time normalization or migration of old workflow state.
- Human and JSON output must agree.

### T-001 / Task 1: Persist Clarify Handoff Decision

**Files:**
- Modify: `src/workflow.mjs`
- Modify: `src/next-skill.mjs`
- Modify: `src/cli.mjs`
- Test: `test/workflow.test.mjs`
- Test: `test/trellis-hardening.test.mjs`

**Interfaces:**
- Produces: `state.handoff_decision`; `$spec <intake>` or `$plan-to-exec <intake>` next command.
- Consumes: clarify readiness fields and intake package path.

**Expected execution evidence:** tests cover all three decisions in human and JSON status/next output.

**Review focus:** `needs_spec` must never route directly to planning; `blocked` must produce no execution handoff.

- [ ] Add failing tests for `needs_spec`, `direct_to_plan`, and `blocked`.
- [ ] Add `handoff_decision` validation and persistence to current workflow state.
- [ ] Route `nextSkillCommand` exclusively from the persisted decision once clarify is ready.
- [ ] Ensure status and next output expose the same decision and command.
- [ ] Run `node --test test/workflow.test.mjs test/trellis-hardening.test.mjs`.

### T-002 / Task 2: Enforce Current-State-Only Behavior

**Files:**
- Modify: `src/workflow.mjs`
- Modify: `src/runtime-maintenance.mjs`
- Modify: `test/workflow.test.mjs`
- Modify: `docs/loopx/cli.md`
- Modify: `docs/loopx/cli.zh-CN.md`

**Interfaces:** current workflow schema is accepted; missing/old decision schema produces a specific restart-current-workflow diagnostic.

**Expected execution evidence:** negative tests prove old running state is not migrated; current new state remains resumable.

**Review focus:** destructive reset applies to running state only and must not delete user files automatically.

- [ ] Add a failing old-state rejection test.
- [ ] Remove compatibility normalization related to the replaced workflow state.
- [ ] Return a clear diagnostic instructing the user to start a new current-contract workflow.
- [ ] Document the destructive v2 boundary in both CLI references.
- [ ] Run focused tests and `npm test`.

