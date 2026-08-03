# Parallel Subagent Exec Implementation Package

**Source:** `docs/loopx/design/2026-07-14-parallel-subagent-exec/需求设计文档.md`

**Proposal:** `docs/loopx/design/2026-07-14-parallel-subagent-exec/设计提案.md`

**Goal:** Add a manual, experimental `parallel-subagent-exec` lane with strict plan metadata, deterministic local state/Git helpers, hierarchical worktrees, existing review/final-review gates, and bundled discovery while preserving `subagent-exec` unchanged.

**Package slug:** `2026-07-14-parallel-subagent-exec`

**Local state:** `.loopx/multi-plan/2026-07-14-parallel-subagent-exec/state.json`

**Support lenses:** `architecture-designer`, `cli-developer`

**Execution strategy recommendation:** `exec`

**Selection rationale:** This package bootstraps the executor it is building. The state machine, scheduler, Git index snapshots, worktree ownership, review adapters, and bundled governance are tightly coupled and require continuous debugging across child boundaries. Current package execution must remain strictly sequential; subagent availability alone does not justify isolated task dispatch for this implementation.

```loopx-parallel-package
{
  "schema": "loopx.parallel-package.v1",
  "max_parallel": 4,
  "plans": [
    {
      "path": "docs/loopx/plans/2026-07-14-parallel-subagent-exec/01-parallel-plan-contract.md",
      "depends_on": [],
      "can_run_in_parallel": true
    },
    {
      "path": "docs/loopx/plans/2026-07-14-parallel-subagent-exec/02-state-and-scheduler.md",
      "depends_on": [
        "docs/loopx/plans/2026-07-14-parallel-subagent-exec/01-parallel-plan-contract.md"
      ],
      "can_run_in_parallel": true
    },
    {
      "path": "docs/loopx/plans/2026-07-14-parallel-subagent-exec/03-worktree-integration.md",
      "depends_on": [
        "docs/loopx/plans/2026-07-14-parallel-subagent-exec/01-parallel-plan-contract.md"
      ],
      "can_run_in_parallel": true
    },
    {
      "path": "docs/loopx/plans/2026-07-14-parallel-subagent-exec/04-skill-orchestration.md",
      "depends_on": [
        "docs/loopx/plans/2026-07-14-parallel-subagent-exec/02-state-and-scheduler.md",
        "docs/loopx/plans/2026-07-14-parallel-subagent-exec/03-worktree-integration.md"
      ],
      "can_run_in_parallel": true
    },
    {
      "path": "docs/loopx/plans/2026-07-14-parallel-subagent-exec/05-install-governance-and-release.md",
      "depends_on": [
        "docs/loopx/plans/2026-07-14-parallel-subagent-exec/04-skill-orchestration.md"
      ],
      "can_run_in_parallel": false
    }
  ]
}
```

## Global Constraints

- Do not modify any file under `skills/subagent-exec/`; verify its tree hash and existing behavior remain unchanged (`AC-001`, `AC-034`, `D-001`, `D-017`).
- Preserve the user's existing uncommitted changes in `skills/plan-to-exec/SKILL.md`, `skills/plan-to-exec/references/plan-schema.md`, `test/fixtures/skill-contract-matrix.json`, and `test/skill-governance.test.mjs`; build on the current worktree instead of reverting the evidence-based execution-strategy work.
- Do not add a public `loopx` CLI command, public `--json` mode, automatic resolver route, or `plan-to-exec` recommendation for the new executor (`AC-023`, `AC-024`, `AC-029`, `D-013`, `D-014`, `D-015`).
- Use Node.js ESM, two-space indentation, semicolons, single quotes, `node:fs/promises`, `node:path`, and `execFile`/`execFileSync` argument arrays. Add no npm dependency.
- All dispatched implementers, reviewers, fixers, final reviewers, and reconciliation workers remain leaf workers. Only the top-level controller owns lifecycle, state transitions, Git commits, integration, retry, resume, and cleanup (`AC-003`, `D-006`, `D-011`).
- Treat the three parallel metadata schemas, state schema, public invocation, internal helper exit codes, two reconciliation attempts, commit boundaries, and strict resume behavior as fixed design contracts. Return to `spec` before changing them.
- New runtime state remains under `.loopx/parallel-subagent-exec/<run-id>/` with a local `*` `.gitignore`; no repo-tracked runtime state.
- Current `exec` and `subagent-exec` package mode remains strictly sequential even though this overview records future parallel capability.

## Child Plans

| Plan | Scope | Independent result | Dependencies | Future parallel capability |
|---|---|---|---|---|
| `01-parallel-plan-contract.md` | Versioned JSON fences, shared validator, planning/reviewer integration | New plans emit and validate strict parallel metadata without changing execution recommendation | none | first |
| `02-state-and-scheduler.md` | Atomic CAS state, task/child state machine, ready queue, capacity backpressure | Deterministic scheduler/state helpers with unit tests | `01` | may run alongside `03` |
| `03-worktree-integration.md` | Owned worktree topology, ephemeral commits, no-commit fan-in, snapshot recovery, cleanup | Deterministic Git helper with real-repository integration tests | `01` | may run alongside `02` |
| `04-skill-orchestration.md` | Root skill/references/prompts/platform adapters, orchestration, bundled registration, Lancet mapping | Manually invokable bundled skill with green install/governance tests | `02`, `03` | after both dependencies |
| `05-install-governance-and-release.md` | Bilingual docs, uninstall surface, package/compatibility/release checks | Documented experimental skill with unchanged default flow | `04` | exclusive release boundary |

## Execution Order

Future DAG order is `01 -> (02 || 03) -> 04 -> 05`. Current `exec` and `subagent-exec` package modes must execute `01`, `02`, `03`, `04`, and `05` strictly sequentially, running plan-level `final-review` and one formal commit after each child plan.

## Source Coverage

| Source contract | Owning child plans |
|---|---|
| Strict metadata and legacy fail-fast (`AC-010`-`AC-012`, `D-002`, `D-003`, `D-015`) | `01` |
| Worker budget, scheduler priority, runtime capacity (`AC-002`, `AC-013`, `AC-014`, `AC-017`, `D-004`, `D-011`) | `02`, `04` |
| Worktree isolation, commit/integration order, conflicts (`AC-004`, `AC-005`, `AC-018`-`AC-022`, `D-005`, `D-007`, `D-008`, `D-017`) | `03`, `04` |
| Task review, child/package fan-in, final-review/finish (`AC-006`, `AC-008`, `AC-009`, `AC-015`, `AC-016`, `AC-025`-`AC-028`, `D-006`, `D-009`, `D-012`) | `04` |
| State/resume/cleanup (`AC-030`-`AC-033`, `D-010`, `D-016`) | `02`, `03`, `04` |
| Manual skill, install/discovery, unchanged defaults (`AC-001`, `AC-007`, `AC-023`, `AC-024`, `AC-029`, `AC-034`, `D-001`, `D-013`, `D-014`) | `04`, `05` |

## Surface Inventory

| Surface | Current owner/caller | Planned change | Must remain unchanged |
|---|---|---|---|
| `skills/plan-to-exec/` | plan generation | add strict metadata generation and shared validation | existing evidence-based `exec`/`subagent-exec` recommendation |
| `skills/plan-reviewer/` | internal plan gate | validate parallel blocks, cycles, paths, and overlaps | no implementation-code review or workflow state |
| `skills/shared/` | installed cross-skill contracts | add parallel plan contract and validator | existing agent/review/evidence contracts |
| `skills/parallel-subagent-exec/` | new | add experimental executor and helpers | manual-only boundary |
| `skills/subagent-exec/` | conservative executor | none | complete tree/content/behavior |
| `src/install-discovery.mjs` / `package.json` | bundled install/package | add new skill directory | canonical root ownership and plugin no-payload model |
| `skills/RESOLVER.md` / public skill docs | discovery | manual/experimental row | default flow and automatic routing |
| `src/lancet-runtime.mjs` | support-lens stage map | classify new skill as implementation | planning/review mappings |

## Caller Proof And Negative Assertions

Run during implementation and final verification:

```bash
rg -n "LOOPX_BUNDLED_SKILLS|skills/parallel-subagent-exec|skills/subagent-exec|Execution strategy recommendation|Selection rationale|STAGE_MAP" src skills test package.json README.md README.zh-CN.md docs/loopx
git diff -- skills/subagent-exec
git diff --name-only | rg '^skills/subagent-exec/' && exit 1 || true
rg -n "parallel-subagent-exec" src/cli.mjs src/workflow.mjs src/next-skill.mjs
```

Expected negative assertions:

- `git diff -- skills/subagent-exec` prints nothing.
- No public `loopx parallel-*` command appears in `src/cli.mjs` or CLI docs.
- `src/workflow.mjs` default flow and preferred surface do not add `parallel-subagent-exec`.
- `skills/plan-to-exec/SKILL.md` does not add `parallel-subagent-exec` to `Execution strategy recommendation` or execution handoff examples.
- `skills/RESOLVER.md` mentions the new skill only in an explicit manual/experimental route, not the core automatic routing table.

## Internal Plan Review

- Plan review mode: subagent
- Reviewer independence: independent
- Plan review verdict: approved
- Unresolved findings: none
- Review evidence: `.loopx/plan-to-exec/parallel-subagent-exec-plan-review.md`
- Recheck evidence: `.loopx/plan-to-exec/parallel-subagent-exec-plan-review.md`
- Residual risk: native Codex/Claude/Cursor concurrency is contract-tested through deterministic adapters and simulations; live multi-agent stress evaluation is intentionally deferred until the user's manual testing.

## Package Execution Handoff

Execution strategy recommendation: `exec`

Selection rationale: The implementation is a bootstrap of a new executor and requires continuous state/Git debugging across child boundaries. Use current package mode, which is strictly sequential.

Subagent execution path:

```text
$subagent-exec docs/loopx/plans/2026-07-14-parallel-subagent-exec/00-overview.md
```

Inline execution path:

```text
$exec docs/loopx/plans/2026-07-14-parallel-subagent-exec/00-overview.md
```

Do not use `$parallel-subagent-exec` to bootstrap this package. Direct numbered child execution remains targeted/resume/manual-control only under the existing executors.
