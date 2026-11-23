---
name: plan2exec
description: "Write or review a vertical-slice implementation plan (`loopx-plan/v1`) for approval, recovery, or multi-owner coordination (实施计划、计划评审)."
disable-model-invocation: true
metadata:
  version: "0.9.1"
  when_to_use: "plan2exec, implementation plan, approval boundary, interruption recovery, vertical slices, 实施计划, 执行计划"
argument-hint: "<approved source path or clear planning request>"
---

# Plan2Exec

Write one concise, verifiable persistent plan (`loopx-plan/v1`). The plan is a
document contract; loopx does not schedule or execute it. Clear, bounded work
without an explicit planning, approval, recovery, or coordination trigger stays
prompt-first.

For a review-only request, read [plan-review.md](references/plan-review.md) and
report findings without editing or executing the plan. If the planned work is
already implemented, verify the code and fresh test output against the original
source and close the plan instead of running pre-implementation review.

## Process

1. **Read authoritative sources.** Start from the approved request,
   requirements, task brief, or design spec (follow links to `概要设计.md` and
   its `D-*` decisions). Stop and route to `/clarify` or `/spec` if a material
   product, API, data, security, compatibility, or cross-module architecture
   decision is still unresolved. When concurrent persisted state is involved,
   apply [database-concurrency.md](../shared/database-concurrency.md).
2. **Slice into tracer bullets.** Split into coherent, independently verifiable
   **vertical slices** (`P-001`, `P-002`, ...) that cut end-to-end through
   behavior and tests rather than horizontal layer slices:
   - Fold setup, tests, and docs into the slice that owns the behavior.
   - **Wide-refactor exception:** for breaking signature/column migrations with
     wide blast radius, expand first and migrate callers in safe batches so
     tests stay green between slices. Include a final **contract/removal** slice
     ONLY when the requirement explicitly authorizes removing legacy
     compatibility; never delete a legacy signature that callers must keep.
   - Treat shared mutable state, generated files, migrations, registries, or
     lockfiles as explicit `depends` edges even when source paths differ.
3. **Write the plan document.** Follow [plan-schema.md](references/plan-schema.md)
   and write `docs/loopx/plans/YYYY-MM-DD-<feature-slug>.md`:
   - YAML frontmatter owns `schema: loopx-plan/v1`, `source`, `status`, and
     explicit `slices` (`id`, `status`, `depends`).
   - Map every active source `AC-*`, `D-*`, and `TC-*` anchor to a slice or
     integration check (deferrals require explicit source-owner authorization).
   - Each slice ends with `writes`, `anchors`, `architecture` (reuse/owner/
     dependency/isolation check), `verify` (exact command or observable check),
     and optional `review` (only for concrete high-risk slices).
   - Omit microsteps, code snippets, time estimates, and per-slice Git commands.
4. **Validate deterministically.** Run:

```bash
node skills/plan2exec/scripts/validate-plan.mjs <plan-path>
```

Fix any structural error (cycles, ID mismatch, missing meta lines, undeclared
parallel `writes` overlap) before handoff.
5. **Review only when explicitly justified.** Ordinary plans are `ready` after
   author self-check plus `validate-plan.mjs`. Dispatch a read-only leaf
   reviewer ([plan-review.md](references/plan-review.md)) ONLY when explicitly
   requested or when the plan executes an irreversible destructive migration or
   security-boundary change — never for routine refactors or compatibility plans.

## Handoff

Mark only affected slices `blocked` when a concrete conflict or missing
decision prevents safe execution; use overall `blocked` only when no remaining
slice can safely proceed. Report the plan path, status, validator result,
review outcome (when applicable), and remaining blockers.
