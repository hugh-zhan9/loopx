# Mutation Check

Use this check to show that tests fail when changed logic is broken. It applies to
any language. The repository decides the tool, command, and configuration; this
file decides when the check is needed and what counts as evidence.

## When to apply

Apply it before relying on tests as the main evidence for changed calculations,
conditions and boundaries, state changes, error handling, or values passed to
other components, when those tests were never seen failing for that logic. Typical
cases are tests written after the code, characterization tests that protect a
refactor, and generated tests.

Skip it for documentation, configuration, generated code, pure wiring, and work
the repository or the user excludes. Limit it to the changed lines or functions;
run a whole package or repository only when asked.

## Run it

1. Run the mutation testing command documented by the repository on the changed
   scope.
2. Add a few targeted manual mutations for changed logic the tool cannot change.
   Operator-based tools usually miss arithmetic and comparisons done through
   method calls, such as decimal or money libraries, and may also miss removed
   calls and changed constants. Change one place at a time, run the tests that
   cover it, and restore the original.
3. When the repository documents no tool, or the documented tool is missing or
   cannot run, use targeted manual mutations only. Do not switch to an
   undocumented tool on your own. Report that the tool did not run and why.
4. Work in an isolated copy or worktree when the tool rewrites source files or the
   working tree has user changes. Confirm the source is unchanged afterward.

## Reject empty runs

A run is not evidence when it produced no mutants on the changed logic, every
mutant timed out or was marked not covered, the tool skipped changed files under
its defaults, or the unmutated tests already fail. Find the cause and fix the
configuration, or report that scope as unverified.

## Handle surviving mutants

Classify every surviving mutant on the changed logic:

- **Test gap:** add or strengthen a test of observable behavior that fails for the
  mutant. Do not assert implementation details only to kill it.
- **Equivalent:** the change cannot alter observable behavior, for example because
  the state it needs is unreachable. Record the reason; do not write a contrived
  test.
- **Unclear rule:** no requirement or spec settles the expected behavior. Ask the
  owner instead of inventing the rule in a test.
- **Redundant code:** report it, and remove it only when the task allows.

Do not chase a score. Apply a threshold only when the repository requires one.
Rerun the affected mutants after adding tests.

## Report

State the scope, the tool or manual method used, the killed, surviving, and invalid
counts, the classification of each survivor, and any changed logic left unverified.
