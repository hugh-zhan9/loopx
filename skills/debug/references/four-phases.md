# Focused Failure Investigation

Use this detail when a check misses the reported symptom, reproduction is noisy
or unavailable, or a failure crosses components. A local failure with a clear
cause needs no separate phase report.

## Make the symptom observable

Choose the smallest practical check that exercises the failing path: a test, CLI
fixture, HTTP request, browser action or captured-input replay. Prefer one command
with a precise assertion over a long manual sequence. For example, a successful
HTTP status does not detect a missing final export batch; compare the returned
record IDs with the expected IDs. Record the command, inputs, relevant environment
and actual result, redacting secrets.

Reduce unrelated setup and inputs one change at a time, rerunning after each
reduction. Keep the original case available for final verification: a reduced
case may omit interactions the repair still affects. Stop reducing when it no
longer helps distinguish causes or would remove the reported failure.

Control time, random seeds, initial data and external dependencies where they
add noise. For an intermittent failure, record attempts and failures under the
same conditions; one successful run is not proof of repair. Repeat or add load
only within an authorized, bounded environment. Do not stress production or
replay sensitive payloads merely to improve reproduction.

If reproduction is unavailable, continue read-only code, log or trace analysis.
State which conclusions are inferred and what evidence would distinguish the
remaining causes. Request only the missing access, redacted input or permission
needed for that check; do not invent a reproduction or silently add production
instrumentation.

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

For a structured summary or existing ledger, use
[the diagnosis contract](diagnosis-contract.md); ordinary findings need no new
record. Report only hypotheses actually tested. If repair is authorized, turn
the reproduction into a regression check and make the supported change. Follow
the parent skill's final verification against both the original scenario and
reduced case. If the failure persists, use its new evidence to continue
investigation rather than layering unrelated fixes.
