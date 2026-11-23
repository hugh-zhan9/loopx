---
name: tdd
description: "Test-driven development with vertical slices at public seams (测试先行). Use when building features or bugfixes test-first, or when an owning workflow requests red-green-refactor."
metadata:
  version: "0.4.0"
  when_to_use: "tdd, test-first, red-green-refactor, vertical slices, characterization test, 测试先行"
---

# Test-Driven Development

Drive implementation through a tight **red → green** loop at public seams.
Consult `GLOSSARY.md` (when present) so test names match domain language.

## Choose the evidence path

- **New behavior or bugfix:** write one failing test at a public seam, watch it
  fail for the missing behavior, then implement the smallest passing code.
- **Existing behavior before refactor:** preserve existing code and write a
  passing characterization test first. Never delete existing code to fake a red phase.
- **Impractical automation (generated output, configs):** use a repeatable check
  and state the exception honestly.

## Seams and vertical slices

A **seam** is the public boundary where callers observe behavior without reaching
inside. Prefer the highest practical seam; agree on target seams up front for
non-trivial work.

Work in **vertical slices (tracer bullets)**: one seam, one failing test, one
minimal implementation, repeat. Avoid **horizontal slicing** (writing all tests
up front before understanding the implementation).

## Anti-patterns to avoid

- **Implementation-coupled tests:** mocking internal collaborators or asserting
  private methods so refactoring breaks tests while behavior is unchanged.
- **Tautological assertions:** computing expected output with the same formula as
  the code under test. Derive expectations from independent worked examples or specs.
- **Mock-only evidence:** verifying mock wiring instead of the promised outcome.

See [testing-anti-patterns.md](testing-anti-patterns.md) when introducing mocks
or test helpers.

## Rules of the loop

1. **RED:** Write one test for an observable requirement. Run it and confirm it
   fails for the intended behavior (not an import/setup typo).
2. **GREEN:** Write only enough code to pass that test. Run it.
3. **REPEAT:** Add the next vertical slice covering boundaries and failure paths.
4. **VERIFY:** Run affected and repository-required checks on the final state.
   For high-risk logic (money, security, concurrency, destructive data) whose
   tests have never failed for that logic, run [mutation-check.md](references/mutation-check.md).
   Keep refactoring for the review/cleanup step (`code-review`), not inside the red→green loop.
