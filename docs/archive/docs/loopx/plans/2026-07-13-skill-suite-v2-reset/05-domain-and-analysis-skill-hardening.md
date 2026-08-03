# Domain And Analysis Skill Hardening Implementation Plan

**Source:** `00-overview.md`

**Goal:** Correct factual errors, tighten support-lens boundaries, reduce cookbook references, and add evidence-oriented outputs.

**Architecture:** Keep root skills as routing lenses. Load references conditionally by detected technology and named risk; remove generic recommendations that override repository evidence.

**Support lenses:** lancet, doc-readability

### T-001 / Task 1: Harden API, Architecture, And CLI Design Lenses

**Files:**
- Modify: `skills/api-designer/SKILL.md`
- Modify: `skills/api-designer/references/openapi.md`
- Modify: `skills/api-designer/references/versioning.md`
- Modify: `skills/architecture-designer/SKILL.md`
- Modify: `skills/architecture-designer/references/nfr-checklist.md`
- Modify: `skills/architecture-designer/references/architecture-patterns.md`
- Modify: `skills/cli-developer/SKILL.md`
- Modify: `skills/cli-developer/references/design-patterns.md`
- Test: `test/skill-governance.test.mjs`

**Expected execution evidence:** tests reject OAS 3.1 `nullable: true`, unconditional versioning/pagination/rate-limit mandates, and false POSIX exit-code claims.

**Review focus:** repo-pinned tools and existing stack win over `npx` downloads or framework recommendations.

- [ ] Add failing factual-trap and boundary tests.
- [ ] Replace nullable examples with JSON Schema 2020-12-compatible null unions.
- [ ] Make pagination, versioning, and rate limiting conditional on product/contract needs.
- [ ] Add API idempotency, concurrency, conditional request, webhook, and field-compatibility checks.
- [ ] Add architecture anchor/NFR/failure-mode/rollout evidence output.
- [ ] Replace CLI exit-code claims with a project-owned stable catalog and portability notes.

### T-002 / Task 2: Harden Requirement, Readability, And Codebase Analysis

**Files:**
- Modify: `skills/requirement-analyzer/SKILL.md`
- Modify: `skills/doc-readability/SKILL.md`
- Modify: `skills/codebase-spec/SKILL.md`
- Modify: `skills/codebase-spec/references/output-template.md`
- Modify: `skills/refactor-plan/SKILL.md`
- Modify: `skills/plan-reviewer/SKILL.md`
- Test: `test/skill-governance.test.mjs`

**Interfaces:** requirement analysis owns semantic closure; readability owns reader path/prose; codebase spec records provenance; refactor plans require behavior-preservation review.

**Expected execution evidence:** governance tests prove non-overlapping routing and required provenance/preservation fields.

**Review focus:** maturity scoring is optional; obvious document types do not require forced setup questions.

- [ ] Add failing routing and output-contract tests.
- [ ] Make requirement scores optional and qualitative verdict primary.
- [ ] Add semantic-preservation inventory for rewrites.
- [ ] Add commit/hash, timestamp, sampling coverage, and secret-redaction rules to codebase specs.
- [ ] Extend plan-reviewer for Behavior Preservation Contracts and require it before refactor execution handoff.

### T-003 / Task 3: Harden Go, SQL, Kratos, And Lancet Lenses

**Files:**
- Modify: `skills/go-style/SKILL.md`
- Modify: `skills/sql-style/SKILL.md`
- Modify: `skills/kratos/SKILL.md`
- Modify: selected risky files under `skills/kratos/references/`
- Modify: `skills/lancet/SKILL.md`
- Test: `test/skill-governance.test.mjs`

**Expected execution evidence:** tests require generated-source boundaries, conditional race checks, migration/concurrency safety, version assumptions, and anchor sufficiency.

**Review focus:** minimization must still satisfy every applicable AC/D/T/issue anchor.

- [ ] Add failing semantic assertions.
- [ ] Add goroutine ownership, cancellation, race, build-tag, and generated-source rules to Go guidance.
- [ ] Add transactions, online expand/contract migration, resumable backfills, reconciliation, privilege, and PII rules to SQL guidance.
- [ ] Remove or quarantine Kratos recipes that edit generated output; label version assumptions and conditionally route references.
- [ ] Add a traceable sufficiency check to lancet.

