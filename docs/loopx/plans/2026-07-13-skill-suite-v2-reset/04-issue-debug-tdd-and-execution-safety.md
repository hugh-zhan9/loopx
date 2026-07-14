# Issue, Debug, TDD, And Execution Safety Implementation Plan

**Source:** `00-overview.md`

**Goal:** Make diagnosis, issue intake, repair, TDD, verification, and worktree setup share safe, non-destructive contracts.

**Architecture:** `debug` produces one diagnosis schema; `issue` consumes it; `fix` executes only ready ledgers. TDD distinguishes true test-first work from characterization/regression testing of existing code.

**Support lenses:** lancet

### T-001 / Task 1: Canonicalize Diagnosis And Issue Ledger Contracts

**Files:**
- Create: `skills/debug/references/diagnosis-contract.md`
- Modify: `skills/debug/SKILL.md`
- Modify: `skills/issue/SKILL.md`
- Modify: `skills/fix/SKILL.md`
- Test: `test/skill-governance.test.mjs`

**Interfaces:** canonical fields: `classification`, `reproduction_status`, `root_cause_status`, `root_cause`, `hypotheses_rejected`, `fix_mode`, `regression_test_required`, `risk_triggers`.

**Expected execution evidence:** exact schema-parity test reads producer and consumers; ledger metadata status is distinct from append-only closeout status.

**Review focus:** diagnosis must not implement lasting fixes or invent fallback/retry behavior.

- [ ] Add failing schema-parity and status-ownership tests.
- [ ] Make `debug` diagnosis-only with an explicit implementation handoff.
- [ ] Remove `root_cause_hypothesis` duplication from `issue` or define it only as evidence inside canonical `root_cause`.
- [ ] Clarify fix ledger metadata versus execution/closeout sections.
- [ ] Run focused governance tests.

### T-002 / Task 2: Replace Unsafe TDD And Verification Prose

**Files:**
- Modify: `skills/tdd/SKILL.md`
- Modify: `skills/tdd/testing-anti-patterns.md`
- Modify: `skills/verify/SKILL.md`
- Test: `test/skill-governance.test.mjs`

**Interfaces:** TDD outputs `strict_test_first | characterization | regression_reproduction | degraded` evidence mode and consumes the shared evidence schema.

**Expected execution evidence:** negative governance assertions reject instructions to delete user/pre-existing code and manifesto language; positive tests require preservation rules.

**Review focus:** existing dirty code is preserved; lack of strict RED does not get mislabeled as TDD.

- [ ] Add failing safety and evidence-mode assertions.
- [ ] Replace “delete it” and honesty/dishonesty rhetoric with operational gates.
- [ ] Define safe paths for new code, existing code, generated code, and unreproducible defects.
- [ ] Make `verify` emit the shared durable evidence record.
- [ ] Run focused tests and skill verification.

### T-003 / Task 3: Harden Fix And Worktree Side Effects

**Files:**
- Modify: `skills/fix/SKILL.md`
- Modify: `skills/using-git-worktrees/SKILL.md`
- Test: `test/skill-governance.test.mjs`

**Interfaces:** fix consumes controller-only agent topology; worktree setup records owner/path/branch/setup/cleanup handoff.

**Expected execution evidence:** governance tests require leaf workers, preview of side-effectful setup, collision handling, and no automatic destructive cleanup.

**Review focus:** `npm install` or equivalent setup must not run blindly when postinstall can mutate user state.

- [ ] Add failing safety assertions.
- [ ] Require repo-documented, lockfile-safe setup commands and explicit handling of postinstall side effects.
- [ ] Add branch/path collision and current-shell cwd caveats.
- [ ] Require ownership and cleanup handoff records.
- [ ] Run focused tests and `npm test`.

