# Governance, Documentation, And Release Gate Implementation Plan

**Source:** `00-overview.md`

**Goal:** Make every bundled skill semantically governed and publish only the coherent v2 current contract.

**Architecture:** Extend deterministic verification from structural checks to a compact per-skill contract matrix, then align resolver/public docs and package output.

**Support lenses:** cli-developer, doc-readability

### T-001 / Task 1: Add Full Bundled-Skill Contract Governance

**Files:**
- Modify: `scripts/verify-skills.mjs`
- Modify: `test/skill-governance.test.mjs`
- Create: `test/fixtures/skill-contract-matrix.json`

**Interfaces:** matrix fields: skill, role, boundary, required outputs, safety invariants, integrations, required references.

**Expected execution evidence:** every name in `LOOPX_BUNDLED_SKILLS` has one matrix entry; missing or duplicate entries fail verification.

**Review focus:** avoid thousands of brittle phrase assertions; validate stable semantic markers and factual traps.

- [ ] Add a failing parity test between bundled skills and the matrix.
- [ ] Add contract entries for all 27 skills.
- [ ] Add reusable checks for boundary, output, safety, integration, leaf-worker dispatch, reference existence, and metadata version.
- [ ] Retain focused behavior tests for high-risk runtime and workflow contracts.
- [ ] Run `node scripts/verify-skills.mjs` and the full governance suite.

### T-002 / Task 2: Align Resolver, Public Guides, And Package Surface

**Files:**
- Modify: `skills/RESOLVER.md`
- Modify: `README.md`
- Modify: `README.zh-CN.md`
- Modify: `docs/loopx/skills.md`
- Modify: `docs/loopx/skills.zh-CN.md`
- Modify: `docs/loopx/cli.md`
- Modify: `docs/loopx/cli.zh-CN.md`
- Modify: `docs/loopx/specs/installation.md`
- Modify: `package.json`

**Expected execution evidence:** current docs expose only the v2 chain, destructive reset boundary, suite-wide leaf-worker rule, and support-lens routing.

**Review focus:** historical plans/designs may mention old behavior; current product docs may not.

- [ ] Update routing and role descriptions from the final contracts.
- [ ] Document that in-progress pre-v2 state is unsupported and must restart.
- [ ] Document controller-only subagent ownership.
- [ ] Confirm package includes every new shared/reference/matrix file.
- [ ] Run bilingual documentation alignment checks.

### T-003 / Task 3: Prove Current-Surface Closure

**Files:**
- Modify as required by failures in strict current product paths only.

**Expected execution evidence:**
- `node scripts/verify-skills.mjs`: PASS
- `npm test`: 0 failures
- `npm pack --dry-run --json`: expected files present, no removed current-contract artifacts
- strict `rg` negative assertions: no legacy compatibility, nested-worker permission, unsafe TDD deletion, old diagnosis field, OAS 3.1 nullable, or false exit-code wording

**Review focus:** do not edit historical plans/designs merely to make negative assertions pass.

- [ ] Run strict negative searches over current product paths.
- [ ] Run the complete test and package commands.
- [ ] Run spec-level `final-review` across the package implementation range.
- [ ] Resolve all Critical and Important findings with `fix-review`, then re-review.
- [ ] Hand off to `$finish` only after the canonical report is clean.

