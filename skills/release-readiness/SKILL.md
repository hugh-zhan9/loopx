---
name: release-readiness
description: "Prepare, review, or execute an authorized release runbook with prerequisites, rollout order, acceptance, and rollback (上线准备、发布清单、上线执行)."
disable-model-invocation: true
metadata:
  version: "0.2.0"
  when_to_use: "release preparation, deployment runbook, rollout readiness, resume release, 上线准备, 发布前检查, 按文档上线"
---

# Release Readiness

Maintain one actionable release runbook connecting the exact change candidate
to target-environment prerequisites, rollout order, acceptance checks, and
rollback conditions. Execution uses host-native tools; this skill adds no
deployment runtime.

## Match the request

- **Prepare:** inspect sources and environment evidence, then write or update
  the runbook (`docs/releases/YYYY-MM-DD-<topic>.md` unless another path exists).
  Read [runbook-template.md](references/runbook-template.md) and adapt depth to
  release size. Preparation never authorizes external mutations.
- **Review only:** compare the runbook against code and evidence; report
  findings without editing or executing.
- **Execute / resume:** verify actual session permissions (a runbook is not
  authorization), compare the live candidate and environment with the last
  checkpoint, refresh changed/volatile checks, execute authorized steps in
  order, and record results in place.

## Build concrete prerequisites and rollout order

1. **Pin candidate identity:** record repo, source/target branches, exact
   commit SHAs, comparison base, uncommitted changes, and target environment.
   Never infer scope from branch names.
2. **Check applicable prerequisites:** schema/historical data, config/flags,
   secrets/permissions/connectivity, generated artifacts/dependencies, and
   downstream callers. Mark each item `verified`, `pending`, `unknown` (query
   failure = `unknown`, never absent), or `not applicable` with timestamp and
   evidence. One environment passing proves nothing about another.
3. **Sequence by compatibility:** derive migration → config → application →
   client order from mixed-version compatibility. Record irreversible points,
   valid rollback artifacts, and when forward repair is required. Application
   rollback never implicitly authorizes dropping columns, data, or config.
4. **Define real acceptance:** separate local tests, deployment readiness
   (healthy pod != working business flow), read-only smoke checks, and real
   business writes. Keep secrets and signed URLs out of recorded evidence.

## Execute and resume safely

- Follow prerequisite order and verify each step before dependent actions.
- On timeout, partial migration, or interrupted rollout, inspect real target
  state before retrying; never blindly replay uncertain writes.
- Stop affected steps when a prerequisite fails, candidate differs, outcome is
  unknown, or acceptance fails. Report runbook path, exact deployed commit,
  completed vs unverified checks, and next safe action. Separate `prepared`,
  `deployed`, and `accepted`.
