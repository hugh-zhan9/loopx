# Skill A/B End-to-End Benchmark (`debug`, `spec`, `plan2exec`, `clarify`, `exec`)

Real repository-backed A/B tests for the core loopx workflow and engineering
skills. Unlike `evals/drills/` (open-book decision quizzes), every task runs
inside a fresh Git fixture and is judged by hidden tests and deterministic
guardrail checks.

## Task Matrix (16 Tasks)

| Category | Task ID | Mode | What It Tests |
|---|---|---|---|
| `debug` | `debug-misleading-race` | direct | Error surfaces in consumer, real bug is non-atomic state overwrite in scheduler; hidden 50x stress test + no sleep/retry hacks + no `[DEBUG-` leftovers |
| `debug` | `debug-precision-boundary` | direct | Order cent-split drift on odd amounts & empty batches + misleading formatter; hidden conservation matrix |
| `debug` | `debug-readonly-dirty-tree` | direct | Explicit read-only diagnosis with pre-existing dirty user edits; repo bytes MUST stay 100% unchanged + root cause identified |
| `debug` | `debug-pressure-breaking-compat` | direct | **Bare-breaking trap**: urgency/authority pressure to ship breaking public API change without product decision; MUST stop without mutating code |
| `spec` | `spec-concurrent-state` | two-stage | Async callback + partial refund state machine under no-DB-lock policy; Stage 2 blind impl tested under concurrency + `SELECT FOR UPDATE` scanner |
| `spec` | `spec-compat-api-evolution` | two-stage | Reconciliation API evolution with internal DB snapshot columns; Stage 2 must keep v1 callers intact & omit internal columns |
| `spec` | `spec-brownfield-reuse` | two-stage | New export channel on repo with existing exporter registry; Stage 2 hidden test checks registration in existing pipeline rather than parallel bypass |
| `spec` | `spec-implicit-no-db-lock` | two-stage | **Bare-breaking trap**: prompt does NOT mention no-DB-lock policy; tests whether `spec` (`database-concurrency.md`) prevents `SELECT ... FOR UPDATE` where bare models default to row locks |
| `spec` | `spec-implicit-caller-dto` | two-stage | **Bare-breaking trap**: prompt does NOT ban raw DB columns; tests whether `spec` (`caller-driven-api.md`) prevents leaking internal snapshot/JSON string columns |
| `plan2exec` | `plan-vertical-slice` | two-stage | Cross-layer feature (model + store + validator + CLI handler); plan validated + Stage 2 passes hidden e2e checks |
| `plan2exec` | `plan-expand-contract` | two-stage | Breaking signature change to `createInvoice` across 6 callers with intermediate compatibility; Stage 2 passes legacy + new contract tests |
| `plan2exec` | `plan-hidden-shared-resource` | two-stage | Two features in disjoint `src/` files sharing `src/registry.mjs`; Stage 2 hidden integration test catches lost updates |
| `clarify` | `clarify-fact-vs-decision` | direct | **Bare-breaking trap**: currency (`HKD`) and window (`30` days) live in `src/config.mjs`; must resolve repo facts, ask only real decisions with recommendations, and edit 0 code files |
| `clarify` | `clarify-ambiguous-prd-block` | direct | **Bare-breaking trap**: Chinese PRD with vague terms and shipped-vs-VIP contradiction; must emit `AC-*`/`TC-*`/`[PENDING]` requirements without guessing or editing code |
| `exec` | `exec-reject-unsafe-plan` | direct | **Bare-breaking trap**: plan marked `ready` has unknown schema `custom-plan/v9` and undeclared parallel `writes` overlap on `src/registry.mjs`; must block before editing any file |
| `exec` | `exec-ready-plan-state-and-dirty-guard` | direct | Valid 2-slice `loopx-plan/v1` plan + unrelated user WIP file; must pass hidden checks, update slice/plan statuses to `done`/`complete`, preserve WIP file, and create 0 Git commits |

## Running

```bash
# 1. Deterministic dry-run (verifies runner, judging, and fixture discrimination; no paid model calls)
npm run eval:skill-ab -- --dry-run

# 2. Live 4-arm A/B run with Codex CLI
npm run eval:skill-ab -- --live \
  --adapter codex \
  --model <model-id> \
  --old-ref <pre-refactor-sha-or-tag> \
  --new-ref HEAD \
  --skill all \
  --replicates 5

# 3. Single-skill targeted A/B (e.g. debug only, faster & cheaper)
npm run eval:skill-ab -- --live \
  --adapter claude \
  --model <model-id> \
  --old-ref <pre-refactor-sha-or-tag> \
  --new-ref HEAD \
  --skill debug \
  --replicates 5
```

Reports are written to `.loopx/evals/skill-ab/<timestamp>/` (`report.json` and
`report.md`) and are never published to npm.
