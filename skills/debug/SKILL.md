---
name: debug
description: "Diagnose and fix bugs, failing tests, regressions, or performance issues (排查并修复). Builds a tight red feedback loop before hypothesising; stops at findings only on explicit read-only/diagnosis-only requests."
metadata:
  version: "0.6.0"
  when_to_use: "debug, diagnose, root cause, bug fix, failing test, regression, crash, flaky test, 根因排查, 修复bug"
---

# Debug

Find the real cause with a tight feedback loop, make the smallest root-cause
repair, and verify the original scenario. Ordinary debugging continues through
repair and verification without asking for a second approval. Explicit
diagnosis-only or read-only requests stop at findings and leave every repository
file untouched (including no temporary instrumentation).

For a supplied `.loopx/issues/*.md` ledger, read
[existing-ledgers.md](references/existing-ledgers.md) before mutating code or
ledger state. Do not create a ledger by default.

## Phase 1: Build a tight feedback loop

**This is the skill.** Before guessing causes, construct one command that goes
**red** on the user's exact symptom:

1. Failing unit/integration/e2e test at the highest seam that reaches the bug.
2. Curl/HTTP script, CLI invocation with fixture input, or headless browser script.
3. Replay of a captured payload/event log, or a throwaway minimal harness.
4. For intermittent/race bugs, loop 50x–100x or parallelize until failure rate is reliable.
5. For regressions between known commits, `git bisect run`.

**Completion criterion:** name one fast, deterministic command you have already
run at least once that reproduces the exact reported symptom (redact secrets as
`<REDACTED>`). Jumping to a theory before this command exists is the failure
mode this skill prevents.

If reproduction is genuinely impossible in the available environment, stop
guessing, list what you tried, and ask for environment access, redacted logs,
or permission for targeted instrumentation. On explicit read-only requests,
collect evidence strictly without modifying files.

## Phase 2: Minimize and hypothesize

1. **Minimize** the reproduction until every remaining input/step is load-bearing.
2. Generate **3–5 ranked, falsifiable hypotheses** before testing any single one:
   `If <X> is the cause, changing <Y> will make the symptom disappear / change.`
3. Probe one variable at a time. Prefer a debugger/REPL or targeted boundary
   checks over noisy logging. Tag any temporary debug log with `[DEBUG-<id>]`
   (e.g. `[DEBUG-a4f2]`) so cleanup is a single grep.
4. For performance regressions, capture a baseline measurement or profile first.

## Phase 3: Fix, verify, and clean up

Skip this phase on explicit diagnosis-only or read-only requests.

1. Confirm expected behavior is settled; ask only if the fix requires a new
   public contract or disputed behavior.
2. Turn the minimized reproduction into a failing regression test at the real
   seam, watch it fail, then apply the smallest root-cause fix.
3. Never add unrequested retries, sleeps, fallbacks, or swallowed-error shims to
   mask an uncertain cause.
4. Verify the fix:
   - Regression test passes.
   - Original Phase 1 feedback loop no longer reproduces.
   - Affected repository test/lint checks pass.
   - Zero `[DEBUG-...]` tags remain (`node skills/code-review/scripts/check-guardrails.mjs` or `grep`).
   - Delete throwaway harnesses and keep unrelated user changes intact.
5. For explicit review requests or irreversible security/destructive repairs,
   recommend `/code-review` on the diff; do not spawn review subagents on routine fixes.

Report what caused the failure, what changed, the exact commands run, and any
remaining unverified scope. Perform Git actions only on explicit request.

## References (load only when needed)

- [root-cause-tracing.md](root-cause-tracing.md): trace deep invalid values back to their origin.
- [condition-based-waiting.md](condition-based-waiting.md): fix flaky async timing waits without arbitrary sleeps.
- [defense-in-depth.md](defense-in-depth.md): guard already-required invariants across layers.
- [diagnosis-contract.md](references/diagnosis-contract.md): structured fields when an existing ledger requires them.
