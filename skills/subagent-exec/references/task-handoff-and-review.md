# Task Handoff And Review

Use files for task-sized context and evidence. Do not copy bulky plans, diffs,
or test output through controller messages.

## Canonical Task Layout

For run `<run-id>` and task `<task-id>`, keep controller-owned artifacts under:

```text
.loopx/exec/<run-id>/tasks/<task-id>/
├── brief.md
├── implement-context.jsonl
├── review-context.jsonl
├── implementations/attempt-<n>/report.md
├── verification/attempt-<n>.json
├── diff-packages/attempt-<n>.diff
└── reviews/attempt-<n>/review-artifact.json
```

The brief is the task contract. It preserves the outcome, dependencies,
interfaces, write scope, source anchors, acceptance, verification commands,
expected evidence, and review focus from the approved plan.

Context manifests contain one JSON object per line with `path` and `reason`.
Implementation and review manifests may differ. The controller validates each
path before dispatch; a seed/example row is not task context.

## Controller Handoff

For every implementation or fix attempt:

1. Render an immutable brief and role-specific context manifest.
2. Dispatch a fresh leaf implementer into its assigned worktree.
3. Require a report and fresh verification evidence.
4. Validate the declared write scope and build a current diff package.
5. Dispatch a fresh read-only reviewer with the brief, report, diff package,
   verification, and review context.
6. Capture and verify the canonical review artifact through
   `skills/exec/scripts/review-gate.mjs`.

The report, diff package, and verification represent one candidate snapshot.
Do not change them while its reviewer is running.

## Fix And Re-review

A Critical or Important finding transitions the task to `needs_fix`. Dispatch a
fresh fixer with the finding evidence. After the fix:

- create a new report or append an explicit new attempt section;
- run verification again and write a new verification artifact;
- rebuild the diff package;
- dispatch a fresh reviewer identity with a higher review attempt; and
- require a clean canonical re-review before integration.

Reusing the prior verification hash, reviewer identity, or review attempt fails
closed. Independent sibling tasks may continue while this task is repaired.

## Invalid Review Output

Malformed output and review transport failure are infrastructure failures, not
semantic verdicts. After the original reviewer is proven terminal, the
controller may dispatch at most one replacement against byte-identical brief,
report, diff-package, and verification hashes. A changed candidate or a second
failure blocks the task. Never reconstruct a verdict from reviewer prose.
