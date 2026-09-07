---
name: tdd
description: "Applies failing-test-first and red-green-refactor discipline when explicitly invoked or activated by an owning implementation workflow. Not for automatic routing of ordinary prompt-first work, generated files, throwaway prototypes, or deleting existing user-owned implementation to recreate a red phase."
when_to_use: "explicit TDD invocation, owning workflow requests failing-test-first discipline, red green refactor, characterization or regression evidence, 测试先行"
metadata:
  version: "0.3.6"
---

# Test-Driven Development

Use failing test first discipline when explicitly invoked or activated by an
owning implementation workflow. This skill does not independently select a
workflow or authorize production changes.

## Choose the evidence path

- **New behavior:** write and observe a test failing for the missing behavior
  before implementing it.
- **Existing implementation:** Preserve it. Add characterization or regression
  evidence before changing it; a passing characterization test is valid evidence
  of current behavior. Do not delete user-owned code to manufacture a red phase
  or claim strict test-first development for code that predates the test.
- **Generated output, configuration, prototypes, or impractical automation:** use
  the task's appropriate repeatable check and state the exception. Do not claim
  strict TDD. A different evidence strategy does not authorize a rewrite or a
  scope change.

## Red, green, refactor

1. **RED:** Add one test for an observable requirement or original bug. Run it
   and inspect the failure. It must fail for the intended missing behavior, not
   a broken import, setup problem, or unrelated exception. If it already passes,
   establish whether it characterizes existing behavior or misses the target.
2. **GREEN:** Implement the smallest change that satisfies the accepted behavior.
   Run the focused test. If it fails, compare both implementation and assertion
   with the requirement; correct an invalid test, but never weaken a valid
   assertion merely to get a pass.
3. **REFACTOR:** With the check green, simplify only what this change needs.
   Keep behavior stable and rerun affected checks after edits.
4. **Complete:** Verify other affected behavior and run repository-required
   checks. Record expected red and final green evidence, or the actual limits of
   the characterization or alternative path.

Test changed behavior rather than every helper or function. Cover relevant
boundaries and failure paths without inventing requirements or exhaustively
retesting unrelated code after every small edit.

## Test design

Prefer public behavior and real code. Use mocks at necessary external or costly
boundaries; assertions should establish the promised outcome, not merely that
mock wiring was exercised. If setup is difficult, inspect the interface and the
existing test seams before introducing production-only-for-test APIs.

Read [red-green-refactor.md](references/red-green-refactor.md) for a worked
example, and [testing-anti-patterns.md](testing-anti-patterns.md) when adding mocks
or test utilities. Keep evidence relevant to the final integrated state; a test
passing once does not establish all acceptance criteria.
