# Shared Contracts And Agent Control Implementation Plan

**Source:** `00-overview.md`

**Goal:** Establish one shared contract for agent topology, review ownership, evidence records, severities, and diagnostic handoffs.

**Architecture:** Add small normative reference documents owned by the workflow suite and make dispatching skills consume them. Do not introduce runtime code in this child plan.

**Support lenses:** architecture-designer, lancet

## Global Constraints

- Every dispatched worker is a leaf worker.
- Only the top-level controller owns agent lifecycle operations.
- Shared invariants are defined once and referenced by consumers.
- No compatibility wording for older prompts or agent topologies.

## Surface Inventory

- Create shared normative references under `skills/shared/` and include them in `package.json`.
- Modify every skill or prompt that dispatches an agent: `plan-to-exec`, `subagent-exec`, `review`, `final-review`, and `fix`.
- Add semantic governance assertions in `test/skill-governance.test.mjs`.

### T-001 / Task 1: Define Shared Agent And Review Contracts

**Files:**
- Create: `skills/shared/agent-topology.md`
- Create: `skills/shared/review-contract.md`
- Create: `skills/shared/evidence-contract.md`
- Modify: `package.json`
- Test: `test/skill-governance.test.mjs`

**Interfaces:**
- Produces: leaf-worker dispatch clause; semantic capability model; review ownership matrix; `Critical|Important|Minor` severity definitions; verification evidence YAML.
- Consumes: current `subagent-exec` Codex lifecycle rules and current review/final-review evidence fields.

**Traceability:** audit findings P0-1, P1-3, P1-4.

**Expected execution evidence:** focused governance test RED then GREEN; `node scripts/verify-skills.mjs` passes.

**Review focus:** shared files must be normative and compact, with no workflow state or platform-specific tool names except in platform mappings.

- [ ] Add a failing governance test requiring the three shared files, package inclusion, required headings, and canonical field names.
- [ ] Define controller-only delegation and leaf-worker behavior in `agent-topology.md`.
- [ ] Define task/checkpoint/plan/spec review ownership and persisted outputs in `review-contract.md`.
- [ ] Define command, cwd, timestamp, exit code, scope, result, output summary, skipped checks, and environment constraints in `evidence-contract.md`.
- [ ] Add `skills/shared/` to the package `files` list and make the focused test pass.

### T-002 / Task 2: Apply Leaf-Worker Contract To Every Dispatch Surface

**Files:**
- Modify: `skills/plan-to-exec/SKILL.md`
- Modify: `skills/plan-reviewer/SKILL.md`
- Modify: `skills/subagent-exec/codex-subagents.md`
- Modify: `skills/subagent-exec/implementer-prompt.md`
- Modify: `skills/subagent-exec/task-reviewer-prompt.md`
- Modify: `skills/review/SKILL.md`
- Modify: `skills/review/code-reviewer.md`
- Modify: `skills/final-review/SKILL.md`
- Modify: `skills/final-review/final-reviewer.md`
- Modify: `skills/fix/SKILL.md`
- Test: `test/skill-governance.test.mjs`

**Interfaces:** all dispatch prompts consume `skills/shared/agent-topology.md` and state the leaf-worker clause directly in the worker-visible prompt.

**Expected execution evidence:** governance test enumerates every dispatch surface and rejects missing leaf-worker language.

**Review focus:** no worker may create, delegate to, wait for, message, replace, or terminate another agent.

- [ ] Add a failing table-driven governance assertion over all dispatching files.
- [ ] Add the direct leaf-worker clause to each worker-visible prompt.
- [ ] Replace Codex exact-tool capability requirements with semantic required/optional capabilities.
- [ ] Require exactly one active worker per task stage unless a future owning contract explicitly permits bounded parallel read-only work.
- [ ] Run focused governance tests and `node scripts/verify-skills.mjs`.

