# Model-Native Adaptive Execution Implementation Package

> **For agentic workers:** Use the assessed Execution strategy below: `loopx:subagent-exec` for isolated plan/task boundaries. Independent child and task lanes may run with at most two leaf workers; steps use checkbox (`- [ ]`) syntax for tracking.

**Source:** `docs/loopx/design/2026-07-16-model-native-adaptive-execution/需求设计文档.md`

**Canonical contract:** `docs/loopx/design/2026-07-16-model-native-adaptive-execution/需求合同.md`

**Accepted proposal:** `docs/loopx/design/2026-07-16-model-native-adaptive-execution/设计提案.md`

**Goal:** Replace the three duplicated executor state/Git/evidence paths with one versioned, fenced, owned execution kernel while preserving current aliases, public CLI behavior, review/final-review responsibility, and exact current-state resume.

**Package slug:** `2026-07-16-model-native-adaptive-execution`

**Local state:** `.loopx/multi-plan/2026-07-16-model-native-adaptive-execution/state.json`

**Support lenses:** `architecture-designer`, `cli-developer`, `ddia:failure-review`

**Execution strategy recommendation:** `subagent-exec`

**Selection rationale:** The source changes one correctness contract, but several boundaries have disjoint write scopes and complete interface contracts. Run installer ownership and task compilation as independent child lanes, then use bounded two-way task lanes for state/lease, policy/router, scheduler/evaluation, and release verification. Integration, task review, plan review, and downstream dependency gates remain serial and deterministic.

```loopx-parallel-package
{
  "schema": "loopx.parallel-package.v1",
  "max_parallel": 2,
  "plans": [
    {
      "path": "docs/loopx/plans/2026-07-16-model-native-adaptive-execution/01-foundation-install.md",
      "depends_on": [],
      "can_run_in_parallel": true
    },
    {
      "path": "docs/loopx/plans/2026-07-16-model-native-adaptive-execution/02-task-contract-compiler.md",
      "depends_on": [],
      "can_run_in_parallel": true
    },
    {
      "path": "docs/loopx/plans/2026-07-16-model-native-adaptive-execution/03-state-lease-facade.md",
      "depends_on": ["docs/loopx/plans/2026-07-16-model-native-adaptive-execution/01-foundation-install.md", "docs/loopx/plans/2026-07-16-model-native-adaptive-execution/02-task-contract-compiler.md"],
      "can_run_in_parallel": false
    },
    {
      "path": "docs/loopx/plans/2026-07-16-model-native-adaptive-execution/04-workspace-delta-quality.md",
      "depends_on": ["docs/loopx/plans/2026-07-16-model-native-adaptive-execution/03-state-lease-facade.md"],
      "can_run_in_parallel": false
    },
    {
      "path": "docs/loopx/plans/2026-07-16-model-native-adaptive-execution/05-policy-routing-cutover.md",
      "depends_on": ["docs/loopx/plans/2026-07-16-model-native-adaptive-execution/04-workspace-delta-quality.md"],
      "can_run_in_parallel": false
    },
    {
      "path": "docs/loopx/plans/2026-07-16-model-native-adaptive-execution/06-scheduler-graduation.md",
      "depends_on": ["docs/loopx/plans/2026-07-16-model-native-adaptive-execution/05-policy-routing-cutover.md"],
      "can_run_in_parallel": false
    },
    {
      "path": "docs/loopx/plans/2026-07-16-model-native-adaptive-execution/07-package-release.md",
      "depends_on": ["docs/loopx/plans/2026-07-16-model-native-adaptive-execution/06-scheduler-graduation.md"],
      "can_run_in_parallel": false
    }
  ]
}
```

## Split rationale and execution order

The source contains seven independently testable boundaries. Each child leaves a working, directly testable result for the next child:

| Child | Scope | Result | Depends on |
|---|---|---|---|
| `01-foundation-install.md` | shared execution owner, constraint registry, per-item installer ownership, package/plugin gate | shared runtime can be installed atomically without whole-tree drift false positives | none |
| `02-task-contract-compiler.md` | canonical task contract, immutable manifest, role prompt projection, plan/reviewer integration | a plan task compiles to a strict, hashed machine contract | `01` |
| `03-state-lease-facade.md` | epoch state/events, CAS, writer lease/fence, reservation/recovery, internal JSON facade | deterministic prepare/next/reserve/transition semantics with fail-closed recovery | `02` |
| `04-workspace-delta-quality.md` | enforced write roots, owned Git resources, exact tree/blob delta, evidence/review v2, fenced finish handoff | one reviewed task candidate can be safely integrated or blocked | `03` |
| `05-policy-routing-cutover.md` | hard risk guard, shadow classifier, capability provenance, generation router, alias cutover contracts | fresh/current/unknown routing and profile pinning preserve compatibility | `04` |
| `06-scheduler-graduation.md` | baseline scheduler, explicit mode profiles, wait-any and disabled independent rungs, model/adapter eval evidence | streaming candidates can be evaluated without changing quality gates or defaults | `05` |
| `07-package-release.md` | package fan-in, supersession audit, compatibility/docs/release verification | the complete feature has one package-level evidence and finish gate | `06` |

Package mode starts `01` and `02` concurrently, integrates their reviewed child commits in declared order, then executes `03 -> 04 -> 05 -> 06 -> 07`. Within children `03`, `05`, `06`, and `07`, only the explicitly independent task pairs run concurrently. After each child, run its plan-level `final-review`, update `.loopx/multi-plan/2026-07-16-model-native-adaptive-execution/state.json`, and create the child implementation commit. After `07`, run one spec-level `final-review`, then `finish`.

Child commits do not independently activate release phases. All phase-0 compatibility foundations (`01`, the compiler contract in `02`, and the exact-delta/review foundations completed in `04`) remain dormant until their combined P0 tests pass. Unified state/facade code from `03` is simulation/internal-only until `04` closes the safety-complete workspace/delta/review/finish boundary; no fresh alias route changes before child `05`.

## Global constraints

- Use Node.js ESM, standard-library APIs only, owner-only local JSON/NDJSON/filesystem artifacts, Git CLI, and no new runtime dependency.
- `skills/shared/execution/` is the only unified-kernel owner. Aliases, planner, reviewer, installer, and plugin consume it; they do not duplicate state, Git, or review rules.
- Do not add a public CLI command, public skill, public mode/risk/explain flag, new public JSON/exit contract, fixed model ID, third-party runtime dependency, cross-repo coordinator, persistent writer queue, fine-grained resource lease, or external Git-writer enforcement.
- Do not automatically enable parallel, adaptive in-place execution, review-turn reduction, low-risk coverage reduction, or native spawn exactly-once claims. Rungs `4b`-`6` are versioned disabled-by-default policy/evaluation lanes until their stated graduation gates pass.
- All unified writers, including inline, require an enforced runtime/adapter write root; source Git/common dir is read-only; invoking checkout tracked bytes, index, HEAD, and placement-sensitive existing untracked/ignored items remain unchanged until finish placement; unavailable capability fails closed.
- Current-contract state is never migrated or normalized. Recognized current state routes to its matching frozen legacy engine; unknown, pre-v2, ambiguous, or missing-engine state fails closed. Active unified runs never switch generation/profile.
- Every correctness mutation is bound to `operation_id`, request digest, expected revision, lease id, and authoritative fencing epoch. Append-only epoch claims are authoritative; elapsed time/heartbeat never proves death; legacy or finish owners without terminal evidence cannot be taken over.
- Run artifacts are owner-only and gitignored (`0700` directories, `0600` files). Do not persist secrets, raw environment, API keys, tokens, or unrelated source. Block/quarantine rather than storing unsafe content.
- Per-task exact delta, fresh evidence, Critical/Important blocking, `Approved + Minor`, task review-before-integration, package/plan/spec final-review ownership, and finish ownership remain mandatory. P0 correctness/safety/reliability/provenance/compatibility gates are absolute; P1 values are versioned candidate thresholds only.

## Source coverage map

| Source anchors | Owning child plans |
|---|---|
| `AC-001`, `D-001`, `TC-001` | `01`, `02`, `07` |
| `AC-002`-`AC-004`, `D-002`-`D-004`, `TC-002`, `TC-003` | `02`, `03`, `05` |
| `AC-005`, `AC-009`-`AC-014`, `D-003`, `D-005`, `D-009`-`D-011`, `TC-006`-`TC-010`, `TC-016` | `03`, `04`, `05` |
| `AC-006`-`AC-008`, `AC-023`, `AC-026`, `D-008`, `TC-004`, `TC-005`, `TC-017` | `05`, `06`, `07` |
| `AC-015`-`AC-019`, `AC-025`, `D-006`, `D-007`, `D-012`, `D-013`, `D-016`, `TC-011`-`TC-014`, `TC-019`, `TC-020` | `04`, `06`, `07` |
| `AC-020`-`AC-022`, `AC-024`, `D-014`, `D-015`, `TC-015`, `TC-018` | `05`, `07` |

Deferred-with-rationale: automatic risk/mode routing, automatic parallel, P=4 production graduation, critical-path/test-layering production enforcement, review-turn reduction, public mode/risk/explain surfaces, legacy deletion, cross-repo atomic capacity, persistent queues, and adaptive in-place execution are represented only by pinned policy schemas, disabled defaults, rollback/eval fixtures, and explicit release negatives. The source requires each to graduate independently or return to `spec`; no child silently enables it.

## Surface inventory, caller proof, and negative assertions

| Surface | Current caller/owner | Planned change | Must remain unchanged |
|---|---|---|---|
| `src/install-discovery.mjs`, `scripts/install-skills.mjs`, plugin installer | normal/plugin install and governance tests | managed `shared_items` provenance and atomic `execution/` subtree ownership | CLI human/JSON output, dry-run, package-root canonical source |
| `skills/plan-to-exec/`, `skills/plan-reviewer/` | plan generation and internal review | canonical task-contract block and compiler/validator use | traceability, execution recommendation surface until the new contract is released |
| `skills/shared/execution/` | new kernel/facade owner | all unified runtime modules and schemas | no legacy state rewrite or public CLI |
| `skills/exec/`, `skills/subagent-exec/`, `skills/parallel-subagent-exec/`, `skills/RESOLVER.md` | expert aliases/router | thin facade routing and exact legacy detector | existing flags, public aliases, leaf/controller rules, current resume |
| `skills/subagent-exec/scripts/review-*`, `src/finish-runtime.mjs`, `skills/finish/` | task review and finish | v2 evidence/review and epoch-bound handoff | final-review six-stage responsibility and user-owned Git decision |
| `skills/parallel-subagent-exec/scripts/{state,scheduler,git,parallel-exec}.mjs` | brownfield primitives | shared-kernel extraction/adapters | legacy engine remains readable for recognized current runs |
| `docs/loopx/specs/installation.md`, README/docs, `package.json` | release surface | fresh/current generation wording and plugin suite gate | existing public CLI/install surface and package canonical-root rules |

Caller-proof searches for implementation/final verification:

```bash
rg -n "LOOPX_BUNDLED_SKILLS|sharedContractsHash|installBundledSkills|verifyInstallState" src/install-discovery.mjs scripts test plugins package.json
rg -n "finishStartStage|finishRecordStage|executionStartStage|finish_begin|finish_capture" src skills test
rg -n "exec|subagent-exec|parallel-subagent-exec|loopx execute|mode|risk" skills/RESOLVER.md src/cli.mjs src/workflow.mjs docs README.md README.zh-CN.md
rg -n "loopx\.task-contract\.v1|loopx\.execution-manifest\.v1|loopx\.execution-state\.v1|loopx\.review-result\.v2" skills test docs
```

Required negative assertions:

- No new public command, flag, stdout prose, non-TTY prompt, or automatic resolver route is added.
- No current/pre-v2 state is rewritten, normalized, adopted, or silently switched to unified state.
- No unified worker writes central state, source refs/objects, another worktree, invoking checkout, completion, or finish placement.
- No stale epoch, old cache pointer, late/unbound result, stale review, out-of-scope path, secret-bearing blob, or ownership-mismatched cleanup is accepted.
- `git diff --name-only -- 'skills/subagent-exec/**'` is allowed only for the explicit v2 review/routing changes listed in child `04`/`05`; unrelated legacy engine rewrites are forbidden and must be called out in review.
- `npm test` must execute `plugins/loopx/scripts/plugin-install.test.mjs`; a passing default suite that omits the plugin suite is a release failure.

## Internal plan review

- Plan review mode: subagent
- Reviewer independence: independent
- Unresolved findings: none
- Review evidence: `.loopx/plan-to-exec/model-native-adaptive-execution-plan-review.md`
- Recheck evidence: `.loopx/plan-to-exec/model-native-adaptive-execution-plan-review.md` — all three Important findings closed
- Residual risk: live native multi-agent stress and provider-specific enforced write-root capability remain release-gated evaluation work, not assumptions in the plan.

## Package execution handoff

Execution strategy recommendation: `subagent-exec`

Selection rationale: bounded two-way isolation is justified for the declared disjoint lanes; immutable schema/version, Git integration, and review ownership still gate every dependent lane and child boundary.

Subagent execution path:

```text
$subagent-exec docs/loopx/plans/2026-07-16-model-native-adaptive-execution/00-overview.md
```

Inline execution path:

```text
$exec docs/loopx/plans/2026-07-16-model-native-adaptive-execution/00-overview.md
```

Direct child execution is reserved for targeted/resume/manual-control runs:

```text
$exec docs/loopx/plans/2026-07-16-model-native-adaptive-execution/01-foundation-install.md
$subagent-exec docs/loopx/plans/2026-07-16-model-native-adaptive-execution/01-foundation-install.md
```
