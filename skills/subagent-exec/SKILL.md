---
name: subagent-exec
description: "Explicit delegated-serial execution profile for exec. Uses a fresh implementer per planned slice, mandatory independent read-only task review, separate fixes, and final Spec plus Standards review. Not for automatic routing, inline execution, parallel dispatch, planning, or unresolved requirements."
when_to_use: "explicit subagent-exec invocation, force delegated serial profile, fresh implementer per slice, mandatory task review"
disable-model-invocation: true
metadata:
  version: "0.5.0"
argument-hint: "<same clear input or plan path accepted by exec>"
---

# subagent-exec Profile

This is the explicit `delegated-serial-v1` profile entry point. Forward the same
input to the canonical `exec` controller with the structural profile pinned to
delegated serial. This skill does not own a separate scheduler, state store, Git
pipeline, or review policy.

## Admission

- Validate a current plan's `loopx.execution-graph.v1` before mutation.
- Compile a legacy lean plan conservatively as delegated serial.
- Require the host to create and observe fresh implementer, reviewer, fixer, and
  final-review leaf workers.
- If required worker or independent-review capability is unavailable, block and
  report it. Never silently execute planned work inline.

## Slice Loop

For each ready slice in stable graph order:

1. Give one fresh leaf implementer the slice outcome, dependencies, write scope,
   relevant context, interfaces, acceptance, verification, expected evidence,
   and review focus.
2. Require a candidate and fresh verification evidence.
3. Bind the exact candidate and evidence to a separate read-only leaf reviewer.
4. Require both task spec compliance and task quality approval.
5. Send Critical or Important findings to a separate leaf fixer. Freshly verify
   and independently re-review the amended candidate.
6. Integrate only the clean reviewed candidate, then unlock dependents.

The controller alone owns dispatch, state, Git, integration, and cleanup. Every
worker prompt must use the leaf clause from `../shared/agent-topology.md`.

## Final Gate

After all slices integrate and combined verification passes, dispatch separate
read-only Spec and Standards final reviewers. Keep their findings side by side.
Completion remains blocked until both axes have no unresolved Critical or
Important finding.

## Resources

- Give implementers [implementer-prompt.md](./implementer-prompt.md).
- Give reviewers [task-reviewer-prompt.md](./task-reviewer-prompt.md).
- Follow [task handoff and review](./references/task-handoff-and-review.md)
  when creating file-based candidates.
- Follow the [review result contract](./references/review-result-contract.md)
  when capturing or verifying a canonical verdict.
- Use `scripts/review-result` and `scripts/review-artifact-verify` for
  deterministic capture and stale-input checks.

## STOP Conditions

Stop on an invalid graph, unresolved material decision, unavailable implementer
or reviewer capability, unsafe write ownership, failed required verification,
or a blocking finding without clean re-review.
