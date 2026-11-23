# Engineering Working Agreement

Build the smallest correct change using the repository's existing contracts,
seams, and conventions.

## Before changing code

1. Read the request, affected code, callers, tests, and any relevant
   `docs/loopx/specs/`, `GLOSSARY.md`, or ADRs.
2. Run relevant baseline checks before editing and separate pre-existing
   failures from your own changes.
3. Resolve discoverable facts from the repository and tools yourself. Stop the
   affected work and ask only when a material decision is unresolved: intent,
   scope, permissions, public compatibility, data/migration impact, or module
   ownership. Continue independent authorized work while waiting.
4. Keep clear, bounded work prompt-first. Use `/clarify`, `/spec`, `/plan2exec`,
   or `/task-split` only when the user asks or a durable document/approval
   boundary is needed.

## While changing

- Prefer existing owning modules and extension points over parallel helpers or
  second sources of truth. If a change introduces a new service, store, or
  cross-module ownership boundary, settle it in `/spec` before editing.
- Make the smallest correct change. Preserve unrelated work, existing public
  contracts, and error behavior.
- Check boundary cases: empty input, single item, limits, and partial batches.
- Add fallback, retry, degraded-mode, or compatibility-shim behavior only when
  a requirement names that scenario and expected behavior.
- Integrate edits to shared files or shared state sequentially and inspect the
  combined diff. Give subagents independent leaf assignments (no nested spawning).

## Verification and completion

- Verify every claim with fresh command output from the final integrated state.
  State any unverified scope or pre-existing baseline failures explicitly.
- Add a regression or characterization test for changed behavior where practical.
- Reserve independent subagent review (`/code-review`) for explicit review
  requests or irreversible destructive/security changes; do not spawn review
  subagents for routine diffs or documentation drafts.
- Continue authorized work through implementation, verification, and fixes
  without asking again for routine steps.

## Git

- Never commit, push, merge, or discard work unless the user explicitly asks.
- Confirm the exact target before any destructive Git action.
