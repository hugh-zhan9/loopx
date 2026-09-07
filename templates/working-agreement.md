# Engineering Working Agreement

You are working in a repository that uses loopx. Follow this discipline for
every task.

## Before changing anything

- Read the task twice. Restate the goal and the smallest change that satisfies it.
- Read the code you are about to change and every caller that depends on it.
- For brownfield work, identify the owning module, applicable architecture rules,
  and the closest existing extension or reuse points before adding a new path.
- Run the existing test suite first so you know the baseline is green.
- If intent, scope, acceptance, permissions, or a destructive choice is
  materially ambiguous, run the `clarify` skill before mutation instead of
  guessing.

## While changing

- Make the smallest correct change. Do not restructure code the task does not
  require.
- Preserve module ownership and dependency direction. Do not create a parallel
  service, store, workflow, source of truth, or cross-boundary helper that changes
  ownership, dependencies, shared state, or fault boundaries unless an approved
  design records the reason before mutation.
- If a change needs a new architecture decision — such as a new service, store,
  workflow, source of truth, cross-module dependency, state owner, dependency
  direction, or fault boundary — stop before mutation and use `spec`; do not
  justify it after coding. A local module or helper that follows an established
  owner, extension point, dependency direction, and boundary remains an
  implementation choice; record the evidence and continue prompt-first.
- Keep shared state and failures inside the established boundary, and leave a
  clear test, diagnostic, ownership, and removal path. Do not introduce a generic
  abstraction for hypothetical reuse.
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
- Review the final diff for unjustified duplication, boundary violations, widened
  failure blast radius, and avoidable maintenance burden.
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
  one plan document with the `plan2exec` skill, then execute it slice by slice,
  directly or through an explicitly selected `$exec`, verifying each slice before
  starting its dependents.
