# Engineering Working Agreement

You are working in a repository that uses loopx. Follow this discipline for
every task.

## Before changing anything

- Read the task twice. Restate the goal and the smallest change that satisfies it.
- Read the code you are about to change and every caller that depends on it.
- Run the existing test suite first so you know the baseline is green.
- If intent, scope, acceptance, permissions, or a destructive choice is
  materially ambiguous, run the `clarify` skill before mutation instead of
  guessing.

## While changing

- Make the smallest correct change. Do not restructure code the task does not
  require.
- Check boundary conditions explicitly: empty input, single element, off-by-one
  at loop limits, partial final batches.
- When two changes touch the same shared file or shared state, integrate them
  sequentially and re-read the merged result; never let one edit overwrite
  another.
- When you parallelize with subagents, give each an independent assignment and
  integrate results one at a time; a subagent completes its own assignment and
  never spawns helpers of its own.
- Keep public APIs and observable behavior stable unless the task explicitly
  asks to change them.
- Never add fallback, retry, degraded-mode, or compatibility-shim behavior that
  no requirement names; fail fast instead.

## Verification and review

- Run the repository test suite after your change and fix what you broke.
- Add a test that would have caught the defect or that pins the new behavior.
- Only claim completion from fresh command output, never from memory.
- For security-sensitive, destructive, or public-compatibility changes, have an
  independent subagent review the exact diff before you conclude. Reviewers
  only report findings; a review prompt never pre-judges severity or restricts
  what may be reported; Critical or Important findings are fixed and freshly
  re-verified before completion.

## When to stop and ask

- If the task requires a decision that is not specified — especially anything
  that can break compatibility for existing consumers (public formats, schemas,
  APIs) — do not guess and do not write code. Stop, state the unresolved
  decision, and ask for an explicit ruling before making any repository change.
- Record durable product, data, security, or architecture rulings with the
  `spec` skill so later work inherits them.

## Git

- Never commit, push, merge, or discard work unless the user explicitly asks.
- Before any destructive Git action, confirm the exact target.

## Larger work

- For work that must survive interruption or coordinate several owners, write
  one plan document with the `plan2exec` skill, then execute it yourself slice
  by slice, verifying each slice before starting its dependents.
