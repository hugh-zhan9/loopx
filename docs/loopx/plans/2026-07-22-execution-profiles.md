# Execution Profiles And Reviewed DAG Execution

## Source And Goal

- User direction in the 2026-07-22 loopx design session.
- Current baseline: `f260617` on `main`.
- Behavioral donor: package version 0.5.2 at `29839a2`.

- Goal: Keep `exec` as the normal execution entry while making execution
  ownership, dependency scheduling, and independent review explicit and testable.

## Boundaries And Global Constraints

- Clear, bounded, low-risk prompt-first work may stay in the main agent.
- Planned work defaults to delegated serial execution unless parallel safety is
  established by a valid execution graph.
- Every delegated implementation or fix attempt receives independent task
  review before integration.
- Parallel tasks use isolated worktrees and unlock dependants only after review
  and integration.
- Implementers, reviewers, and fixers are leaf workers sharing one worker
  budget. Fix and review work has priority over new implementation.
- Preserve the current exec-owned Git isolation, dirty-workspace safety,
  target-snapshot, resume, installation, and evaluation contracts.
- Do not restore the 0.5.2 host-specific runtimes, finish lifecycle, or package
  workflow as separate execution engines.

## Execution Profiles

| Internal profile | User-facing route | Ownership | Review |
|---|---|---|---|
| `inline-owned-v1` | automatic `$exec` | main agent | proportional |
| `delegated-serial-v1` | automatic `$exec` or explicit `$subagent-exec` | fresh leaf worker per task | mandatory per task and final |
| `parallel-strict-v1` | automatic `$exec` or explicit `$parallel-subagent-exec` | bounded isolated leaf workers | mandatory before integration and final |

## Authoritative Execution Graph

```loopx-execution-graph
{
  "schema": "loopx.execution-graph.v1",
  "selected_profile": "parallel-strict-v1",
  "selection_rationale": "P-003 first publishes the shared profile and review contracts; after it integrates, P-001 and P-002 form a proved-independent ready frontier, followed by ordered runtime integration and product-surface migration.",
  "max_parallel": 4,
  "tasks": [
    {
      "id": "P-001",
      "outcome": "Validate execution DAGs and compute bounded ready frontiers.",
      "depends_on": ["P-003"],
      "write_scope": ["skills/exec/scripts/execution-graph.mjs", "skills/exec/scripts/scheduler.mjs", "test/execution-graph.test.mjs", "test/execution-scheduler.test.mjs"],
      "relevant_paths": ["skills/shared/agent-topology.md"],
      "exclusive_resources": [],
      "interfaces": {"consumes": ["loopx.execution-graph.v1"], "produces": ["validated execution graph", "ready-stage reservations"]},
      "source_anchors": ["user:dependency-aware-plan", "user:parallel-when-independent"],
      "acceptance": ["Invalid dependencies and unsafe concurrency fail closed.", "Diamond graphs expose independent ready slices."],
      "verification": ["node --test test/execution-graph.test.mjs test/execution-scheduler.test.mjs"],
      "expected_evidence": ["Graph and scheduler tests pass."],
      "review_focus": ["DAG correctness, path/resource/interface conflicts, worker budget and backpressure."],
      "parallel_safe": true,
      "parallel_rationale": "Runs only after P-003 integrates, then owns graph/scheduler modules and focused tests disjoint from P-002."
    },
    {
      "id": "P-002",
      "outcome": "Create provenance-bound independent task review and fix/re-review gates.",
      "depends_on": ["P-003"],
      "write_scope": ["skills/exec/scripts/review-gate.mjs", "skills/subagent-exec/implementer-prompt.md", "skills/subagent-exec/task-reviewer-prompt.md", "skills/subagent-exec/references", "skills/subagent-exec/scripts", "test/execution-review-gate.test.mjs"],
      "relevant_paths": ["skills/shared/review-contract.md"],
      "exclusive_resources": [],
      "interfaces": {"consumes": ["independent review policy"], "produces": ["task review artifact contract"]},
      "source_anchors": ["user:subagent-review-required"],
      "acceptance": ["Malformed or stale review artifacts fail closed.", "Blocking findings require a separate fixer and fresh reviewer."],
      "verification": ["node --test test/execution-review-gate.test.mjs"],
      "expected_evidence": ["Review gate and helper tests pass."],
      "review_focus": ["Read-only reviewer enforcement, provenance freshness and bounded replacement."],
      "parallel_safe": true,
      "parallel_rationale": "Runs only after P-003 integrates, then owns review artifacts and prompts without touching P-001 graph scheduling surfaces."
    },
    {
      "id": "P-003",
      "outcome": "Publish plan, profile, routing and shared review contracts.",
      "depends_on": [],
      "write_scope": ["skills/plan2exec", "skills/plan-reviewer", "skills/exec/SKILL.md", "skills/subagent-exec/SKILL.md", "skills/parallel-subagent-exec/SKILL.md", "skills/shared", "src/install-discovery.mjs", "skills/RESOLVER.md"],
      "relevant_paths": ["ref"],
      "exclusive_resources": [],
      "interfaces": {"consumes": ["reference workflow patterns"], "produces": ["loopx.execution-graph.v1", "independent review policy", "execution profile contract", "plan graph contract"]},
      "source_anchors": ["user:exec-remains-entry", "user:explicit-execution-profiles"],
      "acceptance": ["Exec owns automatic selection.", "Subagent and parallel-subagent exec are real explicit profiles rather than aliases."],
      "verification": ["node scripts/verify-skills.mjs", "node --test test/execution-skill-contract.test.mjs"],
      "expected_evidence": ["Bundled skill verification and contract tests pass."],
      "review_focus": ["Discovery wording, progressive disclosure and compatibility classification."],
      "parallel_safe": false,
      "parallel_rationale": "Produces shared graph and review contracts that must integrate before P-001 and P-002 become ready."
    },
    {
      "id": "P-004",
      "outcome": "Integrate profiles, scheduling, review, Git isolation and resume into one exec kernel.",
      "depends_on": ["P-001", "P-002"],
      "write_scope": ["skills/exec/scripts/adaptive-exec.mjs", "skills/exec/scripts/run-manifest.mjs", "skills/exec/scripts/reviewed-task-runner.mjs", "skills/exec/scripts/worktree-integration.mjs", "skills/exec/scripts/execution-profiles.mjs", "test/execution-profile-selection.test.mjs", "test/execution-reviewed-runtime.test.mjs", "test/parallel-exec-state.test.mjs"],
      "relevant_paths": ["skills/exec/scripts/git-isolation.mjs", "skills/shared/agent-topology.md", "skills/shared/review-contract.md"],
      "exclusive_resources": [{"kind": "runtime", "key": "exec-kernel", "reason": "Owns the integrated execution lifecycle."}],
      "interfaces": {"consumes": ["validated execution graph", "ready-stage reservations", "task review artifact contract"], "produces": ["reviewed adaptive exec runtime"]},
      "source_anchors": ["user:small-inline", "user:serial-subagent-review", "user:parallel-subagent-exec"],
      "acceptance": ["Planned work never silently runs inline.", "Only reviewed candidates integrate.", "Final findings enter fixer and re-review closure."],
      "verification": ["node --test test/execution-profile-selection.test.mjs test/execution-reviewed-runtime.test.mjs test/parallel-exec-state.test.mjs"],
      "expected_evidence": ["Profile, runtime, review closure and resume tests pass."],
      "review_focus": ["Git isolation, candidate freshness, identity separation, crash safety and final review closure."],
      "parallel_safe": false,
      "parallel_rationale": "Integrates the interfaces produced by P-001 and P-002 and must follow them."
    },
    {
      "id": "P-005",
      "outcome": "Migrate installed-surface, governance, documentation and release contracts.",
      "depends_on": ["P-003", "P-004"],
      "write_scope": ["test/workflow.test.mjs", "test/skill-governance.test.mjs", "test/legacy-surface-contract.test.mjs", "test/parallel-subagent-exec-release.test.mjs", "test/fixtures", "README.md", "README.zh-CN.md", "docs/loopx"],
      "relevant_paths": ["package.json", "scripts/verify-skills.mjs"],
      "exclusive_resources": [{"kind": "documentation", "key": "public-surface", "reason": "Synchronizes English and Chinese product contracts."}],
      "interfaces": {"consumes": ["reviewed adaptive exec runtime", "execution profile contract", "plan graph contract"], "produces": ["governed installed product surface"]},
      "source_anchors": ["user:current-branch-migration"],
      "acceptance": ["Old alias-only assertions are removed.", "Installed docs and release payload describe the same profile behavior."],
      "verification": ["node --test test/workflow.test.mjs test/skill-governance.test.mjs test/legacy-surface-contract.test.mjs test/parallel-subagent-exec-release.test.mjs"],
      "expected_evidence": ["Governance and installed-surface tests pass."],
      "review_focus": ["No stale 0.5.2 lifecycle restoration or contradictory public wording."],
      "parallel_safe": false,
      "parallel_rationale": "Consumes both the runtime and skill contracts and owns shared public documentation."
    }
  ]
}
```

## Execution Slices

### P-001: Validate and schedule execution graphs

- Outcome: Validate execution DAGs and compute bounded ready frontiers.
- Depends on: P-003.
- Write scope: `skills/exec/scripts/execution-graph.mjs`,
  `skills/exec/scripts/scheduler.mjs`, `test/execution-graph.test.mjs`, and
  `test/execution-scheduler.test.mjs`.
- Relevant paths: `skills/shared/agent-topology.md`.
- Exclusive resources: none.
- Interfaces: consumes `loopx.execution-graph.v1`; produces a validated
  execution graph and ready-stage reservations.
- Source anchors: `user:dependency-aware-plan`,
  `user:parallel-when-independent`.
- Acceptance: invalid dependencies and unsafe concurrency fail closed;
  diamond graphs expose independent ready slices.
- Verification: `node --test test/execution-graph.test.mjs
  test/execution-scheduler.test.mjs`.
- Expected evidence: graph and scheduler tests pass.
- Review focus: DAG correctness, path/resource/interface conflicts, worker
  budget, and backpressure.
- Parallel safety: after P-003 integrates, safe to run with P-002 because this
  slice owns only graph/scheduler modules and focused tests.

### P-002: Restore file-based delegated review

- Outcome: Create provenance-bound independent task review and fix/re-review
  gates.
- Depends on: P-003.
- Write scope: `skills/exec/scripts/review-gate.mjs`, the prompts, references,
  and scripts under `skills/subagent-exec`, and
  `test/execution-review-gate.test.mjs`.
- Relevant paths: `skills/shared/review-contract.md`.
- Exclusive resources: none.
- Interfaces: consumes the independent-review policy; produces the task review
  artifact contract.
- Source anchors: `user:subagent-review-required`.
- Acceptance: malformed or stale review artifacts fail closed; blocking
  findings require a separate fixer and fresh reviewer.
- Verification: `node --test test/execution-review-gate.test.mjs`.
- Expected evidence: review-gate and helper tests pass.
- Review focus: read-only reviewer enforcement, provenance freshness, and
  bounded replacement.
- Parallel safety: after P-003 integrates, safe to run with P-001 because the
  slice does not touch graph scheduling surfaces.

### P-003: Publish profile and planning contracts

- Outcome: Publish plan, profile, routing, and shared review contracts.
- Depends on: none.
- Write scope: `skills/plan2exec`, `skills/plan-reviewer`, the three execution
  profile skill files, `skills/shared`, `src/install-discovery.mjs`, and
  `skills/RESOLVER.md`.
- Relevant paths: `ref`.
- Exclusive resources: none.
- Interfaces: consumes reference workflow patterns; produces
  `loopx.execution-graph.v1`, the independent review policy, the execution
  profile contract, and the plan graph contract.
- Source anchors: `user:exec-remains-entry`,
  `user:explicit-execution-profiles`.
- Acceptance: `exec` owns automatic selection; subagent and parallel-subagent
  execution are explicit profiles rather than aliases.
- Verification: `node scripts/verify-skills.mjs` and
  `node --test test/execution-skill-contract.test.mjs`.
- Expected evidence: bundled-skill verification and contract tests pass.
- Review focus: discovery wording, progressive disclosure, and compatibility
  classification.
- Parallel safety: unsafe as a concurrent slice because it produces shared graph
  and review contracts that must integrate before P-001 and P-002 become ready.

### P-004: Integrate profiles with the exec kernel

- Outcome: Integrate profiles, scheduling, review, Git isolation, and resume
  into one exec kernel.
- Depends on: P-001 and P-002.
- Write scope: the exec runtime modules and focused profile, reviewed-runtime,
  and state tests listed in the authoritative graph.
- Relevant paths: `skills/exec/scripts/git-isolation.mjs`,
  `skills/shared/agent-topology.md`, and `skills/shared/review-contract.md`.
- Exclusive resource: runtime key `exec-kernel`.
- Interfaces: consumes validated graphs, ready-stage reservations, and task
  review artifacts; produces the reviewed adaptive exec runtime.
- Source anchors: `user:small-inline`, `user:serial-subagent-review`, and
  `user:parallel-subagent-exec`.
- Acceptance: planned work never silently runs inline; only reviewed candidates
  integrate; final findings enter fixer and re-review closure.
- Verification: `node --test test/execution-profile-selection.test.mjs
  test/execution-reviewed-runtime.test.mjs test/parallel-exec-state.test.mjs`.
- Expected evidence: profile, runtime, review-closure, and resume tests pass.
- Review focus: Git isolation, candidate freshness, identity separation, crash
  safety, and final-review closure.
- Parallel safety: unsafe; this slice consumes P-001 and P-002 outputs and must
  follow them.

### P-005: Replace product and governance contracts

- Outcome: Migrate the installed surface, governance, documentation, and
  release contracts.
- Depends on: P-003 and P-004.
- Write scope: governance and release tests, fixtures, both READMEs, and
  `docs/loopx` as listed in the authoritative graph.
- Relevant paths: `package.json` and `scripts/verify-skills.mjs`.
- Exclusive resource: documentation key `public-surface`.
- Interfaces: consumes the reviewed runtime and profile/plan contracts;
  produces the governed installed product surface.
- Source anchors: `user:current-branch-migration`.
- Acceptance: alias-only assertions are removed; installed docs and release
  payload describe the same profile behavior.
- Verification: `node --test test/workflow.test.mjs
  test/skill-governance.test.mjs test/legacy-surface-contract.test.mjs
  test/parallel-subagent-exec-release.test.mjs`.
- Expected evidence: governance and installed-surface tests pass.
- Review focus: no stale 0.5.2 lifecycle restoration or contradictory public
  wording.
- Parallel safety: unsafe; this slice consumes runtime and skill contracts and
  owns shared public documentation.

## Compatibility

- Existing lean plans without an execution graph compile conservatively to
  `delegated-serial-v1`; they are never automatically parallelized.
- A supplied authoritative graph with missing fields, invalid dependencies,
  cycles, or task mismatches blocks execution. Conservative delegated serial
  compilation applies only when no graph was supplied.
- Temporary capacity below two applies backpressure without changing the
  structural profile.
- Missing reviewer capability blocks review-required planned work instead of
  silently converting it to inline execution.

## Integration And Final Verification

- `exec` remains the sole canonical execution intent.
- Subagent and parallel execution have real skill payloads and share one exec
  kernel rather than duplicating lifecycle logic.
- A dependency edge no longer serializes unrelated ready tasks.
- Delegated work cannot complete or integrate without a valid independent
  review result.
- Current Git safety and resume behavior remains covered.
- After P-005 integrates and combined verification passes, dispatch independent
  read-only Spec and Standards final reviewers against the complete integration
  boundary. This is a controller final gate, not an execution-graph task and
  does not create a task commit.
- Critical or Important final findings go to a separate fixer, followed by fresh
  combined verification and fresh review of both final axes. Completion remains
  blocked until both axes have no unresolved Critical or Important findings.
- `node scripts/verify-skills.mjs`, `npm test`, and
  `npm pack --dry-run --json` pass.

## Handoff And Residual Risks

- Status: `ready_for_exec`
- Blockers: none.
- Residual risks: host adapters must provide reliable worker identity, terminal
  proof for interrupted workers, and the declared read-only/worktree bindings.
- Resume note: independent Spec and Standards re-review follows every blocking
  fix before release verification is accepted.
