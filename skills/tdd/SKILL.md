---
name: tdd
description: "Applies failing-test-first and red-green-refactor discipline when explicitly invoked or activated by an owning implementation workflow. Not for automatic routing of ordinary prompt-first work, generated files, throwaway prototypes, or deleting existing user-owned implementation to recreate a red phase."
when_to_use: "explicit TDD invocation, owning workflow requests failing-test-first discipline, red green refactor, characterization or regression evidence, 测试先行"
metadata:
  version: "0.3.5"
---

# Test-Driven Development (TDD)

## Overview

Write the test first. Watch it fail. Write minimal code to pass.

**Core principle:** If you didn't watch the test fail, you don't know if it tests the right thing.

**Violating the letter of the rules is violating the spirit of the rules.**

## When to Use

After explicit invocation or activation by an owning implementation workflow,
use strict test-first development for new features, bug fixes, refactoring,
and behavior changes.

**Use explicit permission or a different evidence strategy for:** throwaway
prototypes, generated code, configuration files, and existing user-owned
implementation where a strict test-first rewrite would require deleting or
replacing code.

Thinking "skip TDD just this once"? Stop. That's rationalization.

## Test-First Contract

```
NO NEW PRODUCTION BEHAVIOR WITHOUT A FAILING TEST FIRST
```

If implementation already exists, preserve it. Do not claim strict test-first
TDD for work that began before the test. Add characterization or regression
evidence first, then make the smallest change that preserves the accepted
behavior. Never delete user-owned code merely to simulate a red phase. A full
rewrite or replacement requires explicit user approval and a separate rollback
plan.

## Red-Green-Refactor

Read [references/red-green-refactor.md](references/red-green-refactor.md) for
the full cycle with worked examples, good-test criteria, the "why order
matters" rebuttals, the complete verification checklist, and when-stuck help.

Process summary:

1. **RED** — Write one minimal failing test: one behavior, clear name, real
   code (no mocks unless unavoidable).
2. **Verify RED (mandatory, never skip)** — Run it. Confirm it fails (not
   errors) because the feature is missing. Passes? You're testing existing
   behavior; fix the test. Errors? Fix until it fails correctly.
3. **GREEN** — Write the simplest code that passes. Don't add features,
   refactor other code, or "improve" beyond the test.
4. **Verify GREEN (mandatory)** — Run it. Confirm it and all other tests pass
   with pristine output. Fails? Fix the code, not the test.
5. **REFACTOR** — After green only: remove duplication, improve names, extract
   helpers. Stay green; add no behavior.
6. **Repeat** — Next failing test for the next feature.

## Common Rationalizations

| Excuse | Reality |
|--------|---------|
| "Too simple to test" | Simple code breaks. Test takes 30 seconds. |
| "I'll test after" | Tests passing immediately prove nothing. |
| "Tests after achieve same goals" | Tests-after = "what does this do?" Tests-first = "what should this do?" |
| "Already manually tested" | Ad-hoc ≠ systematic. No record, can't re-run. |
| "The implementation already exists" | Preserve it, characterize the relevant behavior, and do not claim strict test-first evidence. |
| "Keep as reference, write tests first" | Preserve existing user-owned code; characterize it first and label the evidence honestly. |
| "Need to explore first" | Keep exploration isolated from production; once the behavior is understood, start new production behavior with a failing test. |
| "Test hard = design unclear" | Listen to test. Hard to test = hard to use. |
| "TDD will slow me down" | TDD faster than debugging. Pragmatic = test-first. |
| "Manual test faster" | Manual doesn't prove edge cases. You'll re-test every change. |
| "Existing code has no tests" | You're improving it. Add tests for existing code. |

## Red Flags - Stop And Re-establish Evidence

- Code before test
- Test after implementation
- Test passes immediately
- Can't explain why test failed
- Tests added "later"
- Rationalizing "just this once"
- "I already manually tested it"
- "Tests after achieve the same purpose"
- "It's about spirit not ritual"
- "Delete the existing implementation so the test can fail"
- "Rewrite user-owned code just to simulate test-first"
- "TDD is dogmatic, I'm being pragmatic"
- "This is different because..."

**These mean: stop, restore the safe baseline if it was changed, and return to
the red phase or characterization-test path without deleting user-owned code.**

## Verification Checklist

Before marking work complete, walk the full checklist in
[references/red-green-refactor.md](references/red-green-refactor.md): every new
behavior has a test that was watched failing for the expected reason, minimal
code, all tests pass, pristine output, real code over mocks, edge cases
covered.

For new behavior, unchecked red-green items mean strict TDD is incomplete; stop
and re-establish the missing evidence. For pre-existing behavior, use the
characterization/regression path and state the limitation instead of deleting
the implementation.

## Debugging Integration

Bug found? Prefer a failing automated test that reproduces it, then follow the
TDD cycle. When automation is impractical, record the concrete exception and
use the strongest repeatable verification available; do not claim strict TDD.

## Testing Anti-Patterns

When adding mocks or test utilities, read
[`testing-anti-patterns.md`](testing-anti-patterns.md) to avoid common
pitfalls: testing mock behavior instead of real behavior, adding test-only
methods to production classes, and mocking without understanding dependencies.

## Final Rule

```
New production code → test exists and failed first
Existing production code → characterization or regression evidence, with the
test-first limitation stated honestly
```

Do not claim strict test-first TDD when the implementation predates the test.
