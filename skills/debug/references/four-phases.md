# Focused Failure Investigation

Use this detail when a failure crosses components or the first reproduction does
not identify its source. A local failure with a clear cause needs no separate
phase report.

## Locate the boundary

Start with the observed failure and trace backwards: failing operation, caller,
input producer, and source of the input. At each relevant boundary, compare the
expected and observed value, shape, timing, or configuration. Stop tracing when
there is evidence of the cause rather than merely a later symptom.

For a build pipeline, for example, distinguish whether a required variable is
absent in the job, lost by a wrapper, or read incorrectly by the build tool. Check
presence without exposing values:

```bash
if [ "${SIGNING_IDENTITY+x}" = x ]; then
  printf 'SIGNING_IDENTITY is set\n'
else
  printf 'SIGNING_IDENTITY is unset\n'
fi
```

Presence does not prove validity. Use a safe, task-specific validity check next;
do not dump the environment, credentials, tokens, or signed payloads.

## Compare and test

Find a working path with comparable inputs and environment. Inspect relevant
setup, dependencies, versions, and data flow; list differences that could explain
the symptom. A difference is a hypothesis, not a cause by itself.

Choose one discriminating experiment and predict its result before running it.
Record the actual result and revise the hypothesis when it disagrees. Avoid
bundling speculative fixes: a passing combined patch does not identify which
change resolved the failure.

Repeated failures call for new evidence or a different hypothesis. Escalate a
scope or architecture decision when the evidence shows one is needed, not after
a fixed attempt count. Explain what remains unknown when investigation stalls.

## Instrument safely

Prefer existing logs, read-only queries, and isolated reproductions. Before a
temporary edit, record the worktree baseline and follow the owning workflow's
rules for dirty files. Keep the diagnostic diff distinguishable from user work.
Use bounded, targeted logging without sensitive data. Remove only your own
instrumentation after collecting evidence, or record it explicitly in the handoff.

## Hand off the repair

Record [the diagnosis contract](diagnosis-contract.md), including rejected
hypotheses and remaining gaps. If repair is authorized, capture the original
failure in a regression check, make the supported change, and verify the affected
behavior plus required repository checks. If the failure persists, use its new
evidence to continue investigation rather than layering unrelated fixes.
