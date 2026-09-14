# Engineering Working Agreement

Use the repository's existing code and contracts to complete the requested work.
Keep changes and verification proportional to their effect.

## Before changing code

- Establish the requested outcome and protected behavior. Read the affected code,
  callers and tests; widen the search when a shared or public contract changes.
- For brownfield work, identify the owning module, applicable architecture rules,
  and the closest existing extension or reuse points before adding a new path.
- Run relevant baseline checks before changing behavior. Record existing failures
  separately; do not assume the baseline is green or fix unrelated failures.
- Resolve discoverable facts from the repository. Use `clarify` only when missing
  intent, scope, acceptance, permission or a destructive choice could materially
  change the result.

## While changing

- Make the smallest correct change. Preserve unrelated work and existing public
  behavior unless the request changes it.
- Keep responsibilities, dependency direction, shared state and failures within
  their established modules. Reuse existing capabilities before adding another.
- If a new service, store, workflow, source of truth or cross-module dependency
  changes ownership, state or failure boundaries, stop before mutation and use
  `spec`; do not justify it after coding. An approved design records the reason
  before mutation. A local module or helper that follows existing boundaries
  remains an implementation choice; continue prompt-first.
- Check relevant empty, single-item, limit and partial-batch cases. Keep a clear
  way to test, diagnose and later change or remove the affected behavior.
- Integrate changes to the same file or shared state sequentially and inspect the
  combined result. Do not overwrite another worker's changes.
- Give subagents independent assignments. Each is a leaf worker and must not
  spawn helpers. Review and integrate their results one at a time.
- Do not add fallback, retry, degraded-mode or compatibility-shim behavior unless
  a requirement names the scenario and expected behavior. Preserve existing
  required error behavior.

## Verification and completion

- Test the changed behavior and affected callers. Add a regression test for a
  defect or new behavior where practical; use an appropriate repeatable check
  for documents, configuration or generated output.
- Run the full test suite when repository instructions require it, when shared
  behavior changes, or when focused checks cannot establish the affected scope.
  Run required formatting, lint and build checks. Rerun affected checks after edits.
- Review the final diff for unjustified duplication, boundary violations, wider
  failure impact and avoidable maintenance work.
- Only claim completion from fresh command output for the final state. State
  unverified scope and existing failures. A new message alone does not invalidate
  evidence when code, inputs and environment have not changed.
- Check command completion, exit status and tested scope. A focused test does not
  prove the full suite passes, and a worker's report does not prove its integrated
  changes work. Use the installed `shared/evidence-contract.md` for a requested
  evidence audit or durable handoff; ordinary verification needs no extra document.
- Do not weaken checks or discard user changes to obtain passing evidence. Once
  applicable checks pass, repeat or broaden them only for changed state, uncovered
  requirements, failures or a repository requirement.
- For security-sensitive, destructive or public-compatibility changes, have an
  independent subagent review the exact diff. Reviewers report findings without
  editing or receiving a preferred verdict. Fix Critical or Important findings,
  then verify and independently review the changes again.
- Continue authorized work through implementation, verification and corrections.
  Do not stop at a first draft or ask again for routine steps already authorized.

## When a decision is missing

- Stop the affected work when intent, scope, permissions, compatibility, data or
  ownership has a material unresolved choice. Explain the concrete decision;
  do not guess and do not write code that depends on it. Continue independent
  work already authorized. Local implementation details remain yours to choose.
- Record durable product, data, security or architecture rulings through `spec`.
  Keep already accepted decisions settled.

## Git

- Never commit, push, merge, or discard work unless the user explicitly asks.
- Before any destructive Git action, confirm the exact target. Existing
  authorization for that target remains valid.

## Larger work

- When work needs a durable plan for approval, interruption recovery or several
  owners, use `plan2exec`. Execute its verified slices directly or through an
  explicitly selected `$exec`. Ordinary bounded tasks need no plan document.

## Requirements and plans

- Read the original approved requirements before implementation and final checks,
  even when a design or plan exists. Compare expected behavior, not just IDs.
- Do not weaken or defer required acceptance without explicit authorization.
- Use a persistent plan only when requested or needed for approval, recovery, or
  coordination. An accepted design or refactor proposal can guide work directly.
- Plan review is required only for an explicit request or a concrete risk in
  destructive changes, public compatibility, security, migration ordering, or
  shared-resource coordination. Fix ordinary formatting directly. Recheck fixes
  and affected content; do not restart full review for local implementation details.
- If implementation is complete, check its results against the source and fresh
  evidence. Do not send it back through pre-implementation plan review.
