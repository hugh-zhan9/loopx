# Quiet Completion Check

Run this check immediately before every completion claim for direct, serial,
and concurrent work. Keep it in the active context; do not create a workflow
artifact or ask the user to review generic candidates.

1. Confirm fresh task-relevant verification covers the accepted outcome and
   final integrated change. Do not complete with stale or worker-only evidence.
2. Compare the accepted intent and final diff with the applicable repo specs.
   If an applicable spec was changed by the implementation, synchronize it in
   the same implementation and verify the result. A new durable rule needs an
   explicit user decision, approved requirement, or existing spec authority.
3. Compare the encountered work with existing local and shared knowledge. An
   automatic local-memory write is allowed only for an encountered,
   evidence-backed, non-obvious, reusable project pitfall that is hard to
   recover from the code or specs. Deduplicate before writing.
4. Shared memory and newly tracked knowledge always require explicit acceptance
   before writing. Never preserve secrets, raw conversation, workflow state,
   generic path-based candidates, commit summaries, or obvious code facts as
   knowledge.

When neither an applicable spec nor qualifying knowledge changed, make no
artifact, show no reminder, and continue with the ordinary completion summary.
Mention a spec or knowledge write only when one actually occurred. This check
does not invoke Git disposition; use `finish` only when the user explicitly
requests it.
