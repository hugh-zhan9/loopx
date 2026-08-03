# Parallel Subagent Exec Skill Orchestration Implementation Plan

> **For agentic workers:** Use the assessed Execution strategy below: `loopx:subagent-exec` for independently delegable tasks or `loopx:exec` for tightly coupled or context-continuous work. Steps use checkbox (`- [ ]`) syntax for tracking.

**Source:** `docs/loopx/design/2026-07-14-parallel-subagent-exec/需求设计文档.md`

**Goal:** Assemble the validated manifest, state machine, scheduler, Git integration helpers, platform adapters, review gates, and package fan-in rules into one manually invoked `parallel-subagent-exec` skill.

**Architecture:** A thin internal `parallel-exec.mjs` CLI composes the shared manifest validator with the state, scheduler, and Git libraries; it never owns public `loopx` routing. The root skill remains an operational controller contract, while focused references define dispatch, task review, deterministic integration, reconciliation, package fan-in, resume, and cleanup. Existing `subagent-exec` prompt/helper surfaces are consumed read-only where their contracts already fit.

**Tech Stack:** Node.js ESM, built-in child process/fs/path APIs, Markdown skill contracts, native subagent adapters, `node:test`.

**Support lenses:** `architecture-designer`, `cli-developer`, `lancet`

**Execution strategy recommendation:** `exec`

**Selection rationale:** The entrypoint, state transitions, scheduler reservations, Git ownership, platform dispatch, and review/integration lifecycle form one controller protocol. They should be implemented and debugged in one continuous context after child plans `02` and `03` are complete.

```loopx-parallel-plan
{
  "schema": "loopx.parallel-plan.v1",
  "max_parallel": 4
}
```

## Global Constraints

- Consume only the normalized manifest and helper interfaces from child plans `01`-`03`; do not reparse plan Markdown or duplicate state/Git validation.
- The top-level controller is the only lifecycle, state, Git, retry, resume, and cleanup owner. Every implementer, task reviewer, fixer, final reviewer, and reconciliation worker is a leaf and must not spawn or wait for another agent.
- Reject legacy/invalid metadata, unavailable subagents, direct numbered-child input, invalid resume identity, and unsafe worktree state before dispatch. Legacy/invalid metadata and direct-child targeted mode explicitly hand off to `$subagent-exec <same-path>`. Missing runtime capability exits `5` with zero dispatch and no executor handoff.
- Use one global worker budget for every leaf role. Default to `4`, accept `--max-parallel`, and apply runtime capacity as backpressure rather than task failure.
- Require task review before integration; use deterministic integration order and at most two reconciliation attempts. The controller alone creates ephemeral commits, applies them with `cherry-pick --no-commit`, and creates formal child/single-plan boundary commits.
- Do not modify any file under `skills/subagent-exec/`, add a public CLI command, add an automatic resolver route, or recommend this executor from `plan-to-exec`.

## Internal Plan Review

- Plan review mode: subagent
- Reviewer independence: independent
- Plan review verdict: approved
- Unresolved findings: none
- Review evidence: `.loopx/plan-to-exec/parallel-subagent-exec-plan-review.md`
- Recheck evidence: `.loopx/plan-to-exec/parallel-subagent-exec-plan-review.md`
- Residual risk: native Codex/Claude/Cursor concurrency is contract-tested through deterministic adapters and simulations; live multi-agent stress evaluation is intentionally deferred until the user's manual testing.

---

### T-001 / Task 1: Compose the internal controller helper CLI

**Files:**
- Create: `skills/parallel-subagent-exec/scripts/parallel-exec.mjs`
- Create: `test/parallel-exec-cli.test.mjs`

**Parallel execution:**

```loopx-parallel-task
{
  "schema": "loopx.parallel-task.v1",
  "task_anchor": "T-001",
  "depends_on": [],
  "write_scope": [
    "skills/parallel-subagent-exec/scripts/parallel-exec.mjs",
    "test/parallel-exec-cli.test.mjs"
  ],
  "parallel_safe": false
}
```

**Interfaces:**
- Consumes: `inspectParallelInput`/`validateParallelManifest`, state operations from `state-lib.mjs`, scheduling operations from `scheduler-lib.mjs`, and owned-worktree operations from `git-lib.mjs`.
- Produces: an internal JSON-only CLI with `manifest`, `state`, and `worktree` command groups, stable exit codes, atomic output files, and no agent-spawning implementation.

**Traceability:**
- Source AC: `AC-010`, `AC-011`, `AC-012`, `AC-030`, `AC-031`, `AC-032`
- Design anchors: `D-003`, `D-010`, `D-015`, `D-016`
- Test cases: `TC-008`, `TC-009`, `TC-010`, `TC-025`, `TC-026`, `TC-027`
- Task anchor: `T-001`

**Expected execution evidence:**
- `commands_run`: `node --test test/parallel-exec-cli.test.mjs`
- `evidence_summary`: every command emits one complete JSON result, diagnostics remain on stderr, validation fails before state/worktree creation, stale CAS and identity mismatch are distinct exits, and signal interruption persists resumable state.
- `remaining_risk`: agent dispatch remains platform-owned and is intentionally outside this helper process.

**Review focus:**
- Verify the CLI delegates to existing libraries instead of duplicating their rules.
- Verify no stdout progress prose and no public `src/cli.mjs` registration.
- Verify partial failures do not leave a successfully advanced state revision.

**Support lenses:** `cli-developer`, `architecture-designer`, `lancet`

- [ ] **Step 1: Write failing command-contract tests**

Test these exact internal forms in temporary repositories:

```text
node skills/parallel-subagent-exec/scripts/parallel-exec.mjs manifest inspect --input PATH [--max-parallel N] --output FILE
node skills/parallel-subagent-exec/scripts/parallel-exec.mjs state init --state FILE --manifest FILE --operation FILE
node skills/parallel-subagent-exec/scripts/parallel-exec.mjs state verify --state FILE --observed FILE
node skills/parallel-subagent-exec/scripts/parallel-exec.mjs state transition|complete --state FILE --expected-revision N --operation FILE
node skills/parallel-subagent-exec/scripts/parallel-exec.mjs worktree create|verify|snapshot|commit-task|apply|cleanup --operation FILE
```

Operation and observed files are owner-only JSON (`0600`) so complex payloads are never shell-encoded. Each operation file names the expected repo/worktree/ref/state identities required by the delegated library call.

Assert exit `0` for success, `2` for usage/schema defects, `3` for identity/resume mismatch, `4` for Git/worktree/integration failure, `5` for runtime capability/capacity unavailable, and `130` for a persisted interruption. Recoverable capacity shortage is JSON `{ "backpressure": true }` with exit `0`.

- [ ] **Step 2: Run focused tests and confirm RED**

```bash
node --test test/parallel-exec-cli.test.mjs
```

Expected: FAIL because `parallel-exec.mjs` does not exist.

- [ ] **Step 3: Implement minimal argument parsing and library dispatch**

Use explicit command/flag tables and `JSON.parse`; reject unknown commands, flags, duplicate flags, missing values, and malformed JSON. Export a testable entrypoint:

```javascript
export async function runParallelExecCommand({ argv, cwd, env, stdout, stderr }) {}
```

Direct execution calls the export and sets `process.exitCode`. Do not introduce a dependency or shell-string command execution.

- [ ] **Step 4: Add atomic output and signal behavior**

Write requested JSON output using same-directory temporary files plus rename. On `SIGINT`/`SIGTERM`, complete the current atomic state operation, persist `interrupted`, emit one JSON result, and exit `130`; never start another external operation after interruption is observed.

- [ ] **Step 5: Run focused tests to GREEN**

```bash
node --test test/parallel-exec-cli.test.mjs
```

Expected: all command, output, exit-code, and interruption cases pass.

- [ ] **Step 6: Record task evidence**

Record the command matrix, exit-code matrix, stdout/stderr samples, atomic-output evidence, signal result, and confirmation that `src/cli.mjs` remains untouched.

### T-002 / Task 2: Define the manual controller and platform dispatch contracts

**Files:**
- Create: `skills/parallel-subagent-exec/SKILL.md`
- Create: `skills/parallel-subagent-exec/agents/openai.yaml`
- Create: `skills/parallel-subagent-exec/platform-subagents.md`
- Create: `skills/parallel-subagent-exec/codex-subagents.md`
- Create: `skills/parallel-subagent-exec/claude-subagents.md`
- Create: `skills/parallel-subagent-exec/cursor-subagents.md`
- Create: `skills/parallel-subagent-exec/reconciliation-prompt.md`
- Create: `skills/parallel-subagent-exec/references/task-pipeline.md`
- Create: `skills/parallel-subagent-exec/references/scheduler-and-state.md`
- Create: `skills/parallel-subagent-exec/references/worktree-integration.md`
- Create: `skills/parallel-subagent-exec/references/package-mode.md`
- Modify: `src/install-discovery.mjs`
- Modify: `package.json`
- Modify: `skills/RESOLVER.md`
- Modify: `test/fixtures/skill-contract-matrix.json`
- Modify: `test/skill-governance.test.mjs`
- Modify: `test/workflow.test.mjs`
- Test: `test/parallel-exec-cli.test.mjs`

**Parallel execution:**

```loopx-parallel-task
{
  "schema": "loopx.parallel-task.v1",
  "task_anchor": "T-002",
  "depends_on": ["T-001"],
  "write_scope": [
    "skills/parallel-subagent-exec/SKILL.md",
    "skills/parallel-subagent-exec/agents/openai.yaml",
    "skills/parallel-subagent-exec/platform-subagents.md",
    "skills/parallel-subagent-exec/codex-subagents.md",
    "skills/parallel-subagent-exec/claude-subagents.md",
    "skills/parallel-subagent-exec/cursor-subagents.md",
    "skills/parallel-subagent-exec/reconciliation-prompt.md",
    "skills/parallel-subagent-exec/references/task-pipeline.md",
    "skills/parallel-subagent-exec/references/scheduler-and-state.md",
    "skills/parallel-subagent-exec/references/worktree-integration.md",
    "skills/parallel-subagent-exec/references/package-mode.md",
    "src/install-discovery.mjs",
    "package.json",
    "skills/RESOLVER.md",
    "test/fixtures/skill-contract-matrix.json",
    "test/skill-governance.test.mjs",
    "test/workflow.test.mjs"
  ],
  "parallel_safe": false
}
```

**Interfaces:**
- Consumes: internal helper CLI, normalized manifest/state JSON, platform-native subagent operations, existing `subagent-exec` implementer/reviewer prompts and review artifact scripts by path without editing them.
- Produces: bundled skill version `0.1.0`, invocation `$parallel-subagent-exec <plan-or-package> [--max-parallel N]`, leaf-worker handoffs, deterministic task/package orchestration, metadata/direct-child conservative-executor handoff, runtime-capability hard stop, bounded reconciliation instructions, and a manual/experimental resolver entry.

**Traceability:**
- Source AC: `AC-001`-`AC-009`, `AC-013`-`AC-025`, `AC-029`-`AC-034`
- Design anchors: `D-001`, `D-004`-`D-017`
- Test cases: `TC-001`-`TC-007`, `TC-011`-`TC-021`, `TC-024`-`TC-029`
- Task anchor: `T-002`

**Expected execution evidence:**
- `commands_run`: `node --test test/parallel-exec-cli.test.mjs test/workflow.test.mjs test/skill-governance.test.mjs`; `node scripts/verify-skills.mjs`
- `evidence_summary`: the bundled skill performs required root-worktree startup before reservation, rejects unsupported inputs before dispatch, reserves workers atomically, keeps every worker leaf-only, reviews before deterministic integration, retries reconciliation at most twice, performs isolated two-level package review/fan-in, preserves audit state/resources, and is discoverable only through a manual experimental route.
- `remaining_risk`: platform adapters remain instruction contracts around native agent tools; live concurrency behavior requires later agent evaluation outside this implementation package.

**Review focus:**
- Verify the root skill is operational and within the governed line limit; move detail to references rather than broadening the root.
- Verify every dispatch template contains the leaf-worker clause and exact owned worktree/report paths.
- Verify legacy/invalid metadata and direct child produce the same-path conservative handoff, while unavailable runtime capability exits `5` with zero dispatch and no handoff.
- Verify no silent fallback, no direct-child execution, no worker-side Git/state mutation, and no third reconciliation attempt.
- Verify the skill is bundled/package-complete in the same task that creates its canonical directory so repository governance never sees an unregistered skill root.
- Verify installed shared-contract identity includes nested relative paths and contents; the existing top-level-only shared hash must not hide a missing or modified validator script.
- Verify `execution-start` and `finish-start` run from the owned root integration worktree with canonical absolute source/design paths before the first reservation, and verify plan-level/spec-level report ownership and blocking behavior.
- Verify child reviewers receive an isolated multi-plan v2 snapshot, may change only their matching row, cannot write the canonical package review report, and are merged serially by the controller.

**Support lenses:** `architecture-designer`, `cli-developer`, `lancet`

- [ ] **Step 1: Extend tests with static controller invariants**

Add assertions for frontmatter/version, manual invocation, `--max-parallel`, exact helper path, leaf clauses, review-before-integration, controller-only Git/state ownership, two reconciliation attempts, direct-child rejection, metadata-only handoff text, runtime-capability exit `5` without handoff, package child DAG execution, child integration worktrees, root integration worktree, startup/final-review/finish order, cleanup/evidence retention, child row isolation, bundled/package inventory, manual resolver wording, and no `skills/subagent-exec/` writes.

- [ ] **Step 2: Run focused tests and confirm RED**

```bash
node --test test/parallel-exec-cli.test.mjs test/workflow.test.mjs test/skill-governance.test.mjs
```

Expected: FAIL because the new skill surface does not exist.

- [ ] **Step 3: Write the bounded root skill and capability gate**

Keep `SKILL.md` at or below the matrix limit. Its fast path must be:

1. classify only single-plan/package input and validate metadata;
2. run native subagent capability and Git/worktree checks;
3. initialize or strictly resume state and create the owned root integration worktree;
4. from that root worktree run `loopx execution-start <slug> --source <absolute-input> [--design <absolute-design>]` and `loopx finish-start <slug> --source <absolute-input>`, persisting their artifact paths before the first reservation;
5. repeatedly reserve and dispatch ready leaf stages within effective capacity;
6. review, integrate, reconcile, and commit deterministic boundaries;
7. run plan/spec final review and `finish` only at the required scope;
8. clean only disposable owned resources and retain required audit evidence.

For missing/legacy/invalid metadata or direct-child targeted mode, stop with the exact same-path handoff:

```text
$subagent-exec <same-input-path>
```

For unavailable required subagent capabilities, exit `5`, report the missing create/observe-or-wait capability, persist zero dispatch, and do not invoke or recommend another executor.

- [ ] **Step 4: Define platform adapters and leaf handoffs**

Document native capability discovery, explicit model selection, bounded global worker accounting, worktree cwd, report path, review package path, and canonical result capture for Codex, Claude, and Cursor. Codex may use controller-managed parallel child dispatch; workers must receive: `You are a leaf worker. Do not spawn, delegate to, or wait for other agents.`

- [ ] **Step 5: Define task pipeline, reconciliation, and Git ownership**

Require implementer -> task review -> fix/re-review -> ephemeral task commit -> deterministic `cherry-pick --no-commit`. On conflict, restore the exact pre-apply integration snapshot, dispatch one reconciliation worker with conflict evidence, review its result, and allow at most two attempts before `blocked`. Workers never create commits, cherry-pick, update state, remove worktrees, or own refs.

- [ ] **Step 6: Define startup and review ownership**

After manifest/Git validation and root worktree creation, run `execution-start` and `finish-start` from the root integration worktree before any scheduler reservation. Resolve source/design to canonical absolute paths, persist the requirement-start commit, finish baseline, and canonical final-review report identity in run state, and reject dispatch when either startup command fails. Single-plan mode creates one formal plan commit, then one spec-level final review and `finish`. Package child reviews are plan-level and must not own the canonical package report; the package root owns exactly one spec-level final review. Any blocking plan/spec review leaves state/worktrees/evidence intact and never calls `finish`.

- [ ] **Step 7: Define package mode and completion boundaries**

Execute the child-plan DAG from `00-overview.md` subject to `can_run_in_parallel` and the global budget. Each child has task worktrees plus one child integration worktree and creates one formal child commit after plan-level review. Apply completed child commits into the root integration worktree in overview order so final history retains exactly one formal commit per child and no extra package commit; resolve child-boundary conflicts with the same two-attempt protocol, run one spec-level final review, and call `finish` only when clean.

- [ ] **Step 8: Isolate child plan-review state and merge one row**

Before a child plan-level review, copy the root worktree's exact `.loopx/multi-plan/<slug>/state.json` into the child integration worktree at the same relative path and save a controller-owned pre-review snapshot under `<run-root>/reviews/<child-id>/multi-plan-state.before.json`. The reviewer may change only the matching child row and writes no canonical package final-review report. After review, the controller requires schema v2, clean plan-level verdict, byte-identical canonical JSON for every sibling row, and an allowed transition for the matching row; it then serially merges only that row into the root state with CAS. Reject sibling mutation, schema/report ownership mismatch, or non-clean review without creating the child boundary commit.

- [ ] **Step 9: Register the complete skill without changing default routing**

Add `parallel-subagent-exec` to `LOOPX_BUNDLED_SKILLS`, `package.json#files`, and the semantic matrix with version `0.1.0` and root limit `220`. Add a separate manual/experimental resolver row, never a core automatic route. Replace `sharedContractsHash` with a deterministic recursive hash over entry type, normalized relative path, and file content so nested `skills/shared/scripts/parallel-plan-contract.mjs` drift is visible. Extend normal/plugin install tests to require the complete recursive skill/shared surface and to fail when the installed nested validator is missing or modified. Preserve the default workflow arrow and `plan-to-exec` recommendation.

- [ ] **Step 10: Define strict resume and cleanup**

Resume only when source hashes, baseline, control root, worktree paths/HEADs, state schema, startup artifacts, and ownership refs match. Repeated complete invocation returns the stored summary. Success removes only owned task/retry/child worktrees and temporary/ephemeral refs; it retains reports, reviews, conflict evidence, compact `state.json`, `completion.json`, and the root integration worktree for `finish`. Blocked/interrupted runs preserve all state, evidence, paths, and refs and print the resume command.

- [ ] **Step 11: Run verification to GREEN**

```bash
node --test test/parallel-exec-cli.test.mjs test/workflow.test.mjs test/skill-governance.test.mjs
node scripts/verify-skills.mjs
```

Expected: all contracts pass; no file under `skills/subagent-exec/` changes.

- [ ] **Step 12: Record task evidence**

Record every static invariant, startup cwd/order/absolute inputs/artifacts, adapter coverage, worker-budget example, task/package fan-in sequence, child snapshot/row comparisons, plan/spec report ownership, conflict retry example, resume mismatch example, exact cleanup/retention lists, bundled/install inventory, manual-route assertions, and live-evaluation residual risk.

### T-003 / Task 3: Add orchestration simulation and Lancet stage integration

**Files:**
- Create: `test/parallel-subagent-exec.test.mjs`
- Modify: `skills/parallel-subagent-exec/scripts/parallel-exec.mjs`
- Modify: `src/lancet-runtime.mjs`
- Modify: `test/lancet-runtime.test.mjs`
- Test: `test/parallel-exec-state.test.mjs`
- Test: `test/parallel-exec-scheduler.test.mjs`
- Test: `test/parallel-exec-git.test.mjs`
- Test: `test/parallel-exec-cli.test.mjs`

**Parallel execution:**

```loopx-parallel-task
{
  "schema": "loopx.parallel-task.v1",
  "task_anchor": "T-003",
  "depends_on": ["T-002"],
  "write_scope": [
    "test/parallel-subagent-exec.test.mjs",
    "skills/parallel-subagent-exec/scripts/parallel-exec.mjs",
    "src/lancet-runtime.mjs",
    "test/lancet-runtime.test.mjs"
  ],
  "parallel_safe": false
}
```

**Interfaces:**
- Consumes: public skill contract plus all pure helper APIs; fake platform dispatch callbacks that return deterministic implementer/reviewer/reconciliation outcomes.
- Produces: end-to-end controller simulations for single-plan/package success, backpressure, conflict/retry/block, strict resume, interruption, and cleanup; Lancet classifies `parallel-subagent-exec` as `implementation`.

**Traceability:**
- Source AC: `AC-002`-`AC-009`, `AC-013`-`AC-022`, `AC-025`-`AC-033`
- Design anchors: `D-004`-`D-012`, `D-016`, `D-017`
- Test cases: `TC-002`-`TC-007`, `TC-011`-`TC-018`, `TC-021`-`TC-028`
- Task anchor: `T-003`

**Expected execution evidence:**
- `commands_run`: `node --test test/parallel-exec-*.test.mjs test/parallel-subagent-exec.test.mjs test/lancet-runtime.test.mjs`
- `evidence_summary`: deterministic simulations prove startup-before-reservation, bounded concurrent reservations, review gating, isolated child-row merges, ordered fan-in, package/report boundaries, retry exhaustion, evidence-retaining resume/cleanup, and Lancet implementation guidance without invoking live subagents.
- `remaining_risk`: native platform scheduling is contract-tested but not exercised by repository unit tests.

**Review focus:**
- Verify tests assert observable state/Git ordering, not only static documentation text.
- Verify simulations cannot exceed the configured or observed capacity.
- Verify the invoking checkout index/worktree remains byte-for-byte unchanged.
- Verify unavailable runtime capability produces exit `5`, zero reservations/dispatches, and no fallback text; legacy metadata still emits the exact conservative handoff.
- Verify sibling-row mutation and child canonical-report writes are rejected, while one unique package spec-level report is accepted.

**Support lenses:** `architecture-designer`, `lancet`

- [ ] **Step 1: Write failing orchestration simulations**

Build a deterministic fake dispatcher and real temporary Git repositories. Cover: root-worktree startup commands succeed before the first reservation with canonical absolute inputs; startup failure dispatches nothing; two independent tasks overlap in active reservations; a dependent task waits; reviewer and fixer consume the same global budget; capacity zero becomes `capacity_wait`; unavailable capability exits `5` without fallback; successful outputs integrate in task order; conflicts restore snapshots and stop after attempt two; child plans run by DAG but integrate in overview order; child review accepts only the matching row; sibling mutation/canonical-report write is rejected; direct-child and legacy inputs dispatch nothing and emit the conservative handoff.

- [ ] **Step 2: Run focused tests and confirm RED**

```bash
node --test test/parallel-subagent-exec.test.mjs test/lancet-runtime.test.mjs
```

Expected: FAIL because the orchestration simulation and Lancet mapping are absent.

- [ ] **Step 3: Add the smallest testable orchestration seam**

Export only the smallest controller-step seam from `parallel-exec.mjs` that accepts state, observed capacity, and injected startup/dispatch/Git/review callbacks. The seam must expose persisted ordering and report/state artifacts for assertions. Do not add a second scheduler or platform abstraction hierarchy.

- [ ] **Step 4: Classify the skill for Lancet**

Add `['parallel-subagent-exec', 'implementation']` to `STAGE_MAP` and assert `resolveLancetStage({ skillName: 'parallel-subagent-exec' }) === 'implementation'`. Do not alter guidance text or other mappings.

- [ ] **Step 5: Run the full focused suite to GREEN**

```bash
node --test test/parallel-exec-state.test.mjs test/parallel-exec-scheduler.test.mjs test/parallel-exec-git.test.mjs test/parallel-exec-cli.test.mjs test/parallel-subagent-exec.test.mjs test/lancet-runtime.test.mjs
```

Expected: all pass with deterministic ordering and no live-agent dependency.

- [ ] **Step 6: Record task evidence**

Record scheduler timelines, max observed worker count, integration ordering, conflict attempt count, worktree/index hashes, resume results, Lancet mapping, and the explicit live-platform test gap.

## Plan Verification

```bash
node --test test/parallel-plan-contract.test.mjs test/parallel-exec-state.test.mjs test/parallel-exec-scheduler.test.mjs test/parallel-exec-git.test.mjs test/parallel-exec-cli.test.mjs test/parallel-subagent-exec.test.mjs test/lancet-runtime.test.mjs test/skill-governance.test.mjs
node scripts/verify-skills.mjs
git diff --check
git diff -- skills/subagent-exec
```

Expected: all tests pass; the final command prints nothing; native platform execution remains the only residual validation gap.

## Execution Handoff

```text
$exec docs/loopx/plans/2026-07-14-parallel-subagent-exec/04-skill-orchestration.md
```
