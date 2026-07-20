# Prompt-First Adaptive Execution Implementation Plan

**Source:** [Prompt-First Adaptive Execution Spec](../specs/prompt-first-adaptive-execution.md), [ADR-0001](../../adr/0001-prompt-first-adaptive-execution.md), [CONTEXT.md](../../../CONTEXT.md), and maintainer decisions from the 2026-07-20 `grill-with-docs` session.

**Goal:** Make loopx lightweight, fast, accurate, and parallel by defaulting clear work to the model, using one adaptive executor for serial and concurrent work, applying governance proportionally, and distilling only useful project knowledge.

**Architecture:** Installed host guidance and precise skill frontmatter own runtime routing. Clear work stays prompt-first; the canonical `exec` skill may derive a temporary execution graph from a request or lean plan, use native leaf workers when concurrency admission and runtime capability allow, isolate concurrent writes in worktrees, and fall back to same-context serial execution when independence is uncertain. Verification is universal, while persistent plans, independent review, resumable state, knowledge writes, and Git disposition are conditional.

**Tech Stack:** Markdown skill contracts, Node.js ESM, Git worktrees, `node:test`, existing install discovery and agent-eval utilities.

**Execution handoff:** Use the current inline execution capability for this compatibility migration. After T-002 establishes the canonical executor, later tasks must follow the new adaptive contract. The executor derives concurrency at runtime; this plan intentionally contains no fixed parallel metadata.

## Source Contract

### Decisions

- `D-001`: Clear, bounded requests use prompt-first execution without a workflow document. A clear request with multiple independent outcomes may use a temporary execution graph and concurrent workers without first writing a plan.
- `D-002`: The canonical workflow entries are `clarify`, `spec`, `plan`, `exec`, `review`, and `finish`. `plan-to-exec`, `subagent-exec`, `parallel-subagent-exec`, `final-review`, and `fix-review` remain explicit-only compatibility aliases for one release and do not participate in automatic discovery.
- `D-003`: One adaptive executor chooses same-context serial execution or concurrent leaf workers. Concurrency is admitted only when dependencies, write surfaces, decisions, verification, baseline, and integration outcomes are independent; uncertainty selects serial execution.
- `D-004`: Concurrent writes use one worktree per task and a protected integration worktree. Results return to the user's workspace only when target paths still match the execution baseline. loopx never stashes, commits, or overwrites pre-existing user changes.
- `D-005`: The top-level executor owns all agent lifecycle. The default shared worker budget is four; workers are leaves, all roles share the budget, and missing host capability narrows concurrency rather than failing otherwise executable work.
- `D-006`: Persistent plans are concise semantic inputs. They contain outcomes, boundaries, likely files, known dependencies, acceptance, and verification, but no mandatory microsteps, implementation transcription, review ceremony, or parallel metadata. Runtime code and the current repository remain authoritative for the execution graph.
- `D-007`: Fresh verification is mandatory. Ordinary tasks do not require one reviewer per worker. Independent review is required only for explicit requests, security or destructive surfaces, public compatibility changes, cross-task interaction, or conflict reconciliation.
- `D-008`: A lightweight completion check applies to prompt-first, serial, and concurrent work. It checks verification, applicable spec consistency, and genuinely reusable knowledge. `finish` handles only explicit Git disposition.
- `D-009`: Existing applicable specs must stay synchronized. New durable rules require an authority source. Only evidence-backed, non-obvious, reusable pitfalls may become memory; generic change summaries and path-based review reminders are not knowledge.
- `D-010`: Runtime routing authority is the installed host guidance plus skill frontmatter. `skills/RESOLVER.md` is a governance index, not an automatically loaded runtime contract.
- `D-011`: Cross-runtime behavior has uniform semantics and capability-adaptive execution. Native subagents are preferred; a host without reliable write isolation executes serially instead of requiring a custom external agent lifecycle.
- `D-012`: Evaluation compares the actual installed candidate with a bare-prompt product baseline. Live evaluation is a diagnostic tool for maintainer use, not an automated release or implementation-completion gate.

### Acceptance Criteria

- `AC-001`: Installed Codex and Claude guidance state the prompt-first rule, concrete escalation reasons, universal verification requirement, and no-artifact default. Clear local work does not auto-select a loopx skill.
- `AC-002`: The six canonical workflow entries have bounded discovery descriptions. Compatibility aliases remain explicitly invokable for one release but cannot auto-route requests or preserve the old fixed workflow chain.
- `AC-003`: `plan` creates one lean plan by default. Persistent planning is required only for an explicit request, approval boundary, interruption recovery, or durable cross-stage coordination.
- `AC-004`: `exec` accepts a clear multi-outcome request or a persistent plan, derives a current execution graph, explains each concurrency decision, and safely chooses serial or concurrent execution without requiring plan-embedded scheduler metadata.
- `AC-005`: Concurrent mutation uses isolated task worktrees, a protected integration workspace, actual-write validation, combined verification, target-baseline validation, and one complete application back to the user's workspace.
- `AC-006`: Ordinary serial work, concurrent read-only work, and successfully completed prompt-first work leave no run manifest, checkpoint, review, final-review, finish, plan, or orphaned worktree artifact. Blocked concurrent writes retain only the minimum state and exact resume information.
- `AC-007`: Every completion claim has fresh relevant verification. Independent review follows `D-007`; multi-agent execution alone does not require per-task reviewers or a final-review artifact.
- `AC-008`: The completion check synchronizes an applicable changed spec, writes only qualifying local memory automatically, proposes repo-tracked knowledge only from an authority source, and returns `none` without ceremony when no novel knowledge exists.
- `AC-009`: `finish` can commit, branch, merge, create a PR, keep, clean up, or discard completed work without requiring a canonical final-review report or reviewing extraction candidates.
- `AC-010`: The adaptive executor uses at most the minimum of ready work, observed host capacity, and the configured worker budget. Missing write isolation, overlapping user changes, or uncertain dependencies produce safe serial fallback.
- `AC-011`: Repository docs, install verification, skill versions, package files, and compatibility guidance describe the same canonical surface in English and Chinese.
- `AC-012`: Deterministic and simulated-agent tests prove routing, bounded dispatch, isolation, conflict protection, cleanup, review selection, and knowledge filtering. Opt-in live evaluation uses real temporary installation and never injects `skills/RESOLVER.md` into only one variant.

### Test Cases

- `TC-001`: A one-file defect is implemented and verified directly with no loopx artifact or subagent.
- `TC-002`: A clear small feature spanning several related files stays prompt-first and does not create a plan merely because it is called a feature.
- `TC-003`: A clear request with two independent outcomes dispatches concurrent isolated workers, observes overlapping execution, integrates both, verifies the combination, and cleans all temporary state.
- `TC-004`: Tasks that write the same file, define and consume the same new API, update a shared generated file, or depend on ongoing debugging execute serially with a concrete reason.
- `TC-005`: Unrelated user changes survive concurrent execution. A target path changed after the baseline blocks automatic application and preserves the integration result for recovery.
- `TC-006`: Missing worktree binding or runtime capacity safely selects serial execution; it does not fail the user request or recommend a different executor.
- `TC-007`: A compatibility, permission, secret, or destructive migration request with an unresolved decision stops mutation and selects `clarify` or `spec` with the concrete reason.
- `TC-008`: A low-risk multi-worker result with disjoint writes and passing combined verification receives an integration check without per-task reviewers; a public compatibility change and a reconciled conflict require independent review.
- `TC-009`: Changing behavior governed by an existing spec updates that spec in the implementation change. A rule inferred only from code is not silently promoted into a new spec.
- `TC-010`: An ordinary change produces no knowledge output. A real recurring pitfall produces one evidence-backed local memory entry without a generic shared-memory or spec reminder.
- `TC-011`: An explicit `$finish` offers only choices valid for the current Git/worktree state; ordinary completion does not invoke it.
- `TC-012`: Old explicit execution and review names forward to their canonical entry, while installed discovery exposes only the canonical names for automatic routing.
- `TC-013`: Paired live fixtures compare bare prompt with the actual installed candidate for direct work, adaptive parallelism, safe serial selection, escalation, spec synchronization, and memory precision.

## Global Constraints

- Do not read, copy, modify, execute, or use `docs/loopx/design/2026-07-16-model-native-adaptive-execution/` or `docs/loopx/plans/2026-07-16-model-native-adaptive-execution/` as an implementation source. Preserve all existing uncommitted changes there.
- Do not add a `direct` skill, direct mode, risk score, model router, general-purpose scheduler, lease system, or public execution-mode flag.
- Do not require a persistent plan, workflow ledger, review artifact, final-review report, or finish audit for ordinary prompt-first completion.
- Do not weaken verification, destructive-action approval, user-change preservation, worker isolation, or the top-level-only agent lifecycle rule.
- Do not use concurrent writes without reliable worktree binding. Safe serial fallback is required on unsupported hosts.
- Do not automatically create repo-tracked specs or shared memory from implementation inference alone.
- Do not add release switching or staged-rollout machinery. The maintainer will use the completed version before deciding whether to publish it.
- Runtime eval output remains under `.loopx/evals/darwin-simple/` and is not committed.

---

### T-001 / Routing And Canonical Surface

**Outcome:** The installed product, not an uninstalled resolver document, makes prompt-first execution the default and exposes six bounded canonical workflow intents.

**Files:**
- Modify: `src/install-discovery.mjs`
- Modify: `skills/RESOLVER.md`
- Modify: `skills/clarify/SKILL.md`
- Modify: `skills/spec/SKILL.md`
- Modify: `skills/shared/agent-topology.md`
- Test: `test/workflow.test.mjs`
- Test: `plugins/loopx/scripts/plugin-install.test.mjs`

**Depends on:** none

**Source traceability:** `D-001`, `D-002`, `D-005`, `D-010`, `D-011`; `AC-001`, `AC-002`, `AC-010`; `TC-001`, `TC-002`, `TC-006`, `TC-007`.

**Acceptance:** Codex and Claude installs receive the short routing authority; clear work remains model-native; escalation requires a concrete ambiguity, risk, recovery, coordination, or explicit-intent reason; leaf ownership and the shared budget remain explicit.

**Verification:** Focused install tests inspect generated guidance and frontmatter, including negative assertions for Golden-path defaults, broad completion triggers, `$direct`, and resolver injection.

**Expected evidence:** Installed-file snapshots for both hosts, passing focused install tests, and no new public runtime mode or CLI.

**Review focus:** Ensure the guidance is short enough to preserve model judgment and precise enough to stop broad workflow auto-selection.

### T-002 / Lean Planning And Unified Execution Contracts

**Outcome:** `plan` becomes the optional lean planning entry and `exec` becomes the single adaptive execution entry for requests or plans; old planning and execution names become explicit-only aliases.

**Files:**
- Create: `skills/plan/SKILL.md`
- Create: `skills/plan/references/plan-schema.md`
- Modify: `skills/exec/SKILL.md`
- Create: `skills/exec/references/execution-selection.md`
- Modify: `skills/plan-to-exec/SKILL.md`
- Modify: `skills/subagent-exec/SKILL.md`
- Modify: `skills/parallel-subagent-exec/SKILL.md`
- Modify: `package.json`

**Depends on:** T-001

**Source traceability:** `D-001`, `D-002`, `D-003`, `D-005`, `D-006`; `AC-002`, `AC-003`, `AC-004`, `AC-010`; `TC-002`, `TC-003`, `TC-004`, `TC-006`, `TC-012`.

**Acceptance:** Ordinary plans contain only outcomes, boundaries, files or modules, known dependencies, acceptance, and verification. `exec` applies the concurrency admission rules in priority order, explains the choice, uses a default budget of four, and falls back to serial execution without asking the user to select another executor.

**Verification:** Contract tests cover prompt input, plan input, explicit aliases, no-plan parallel decomposition, lean-plan negative assertions, default budget, and safe fallback wording.

**Expected evidence:** One ordinary plan fixture, one prompt-derived execution graph fixture, and installed metadata showing aliases disabled for automatic invocation.

**Review focus:** Prevent the new `exec` contract from becoming a universal mandatory skill or recreating fixed execution modes under different names.

### T-003 / Thin Adaptive Concurrency Runtime

**Outcome:** A small executor-owned runtime protects concurrent writes and recovery while native host agents retain task-level judgment.

**Files:**
- Create: `skills/exec/scripts/adaptive-exec.mjs`
- Create: `skills/exec/scripts/worktree-integration.mjs`
- Create: `skills/exec/scripts/run-manifest.mjs`
- Create: `skills/exec/references/concurrent-execution.md`
- Remove: obsolete implementation assets under `skills/subagent-exec/` except its compatibility `SKILL.md`
- Remove: obsolete scheduler, state-machine, runtime-adapter, prompt, and reference assets under `skills/parallel-subagent-exec/` except its compatibility `SKILL.md`
- Replace: `test/parallel-exec-git.test.mjs` with focused adaptive worktree tests
- Replace: `test/parallel-exec-scheduler.test.mjs` with focused admission and budget tests
- Replace: `test/parallel-exec-state.test.mjs` with minimal run-manifest tests
- Modify: remaining `test/parallel-exec-*.test.mjs` and `test/parallel-subagent-exec.test.mjs` to remove obsolete adapter/state contracts

**Depends on:** T-002

**Source traceability:** `D-003`, `D-004`, `D-005`, `D-011`; `AC-004`, `AC-005`, `AC-006`, `AC-010`; `TC-003`, `TC-004`, `TC-005`, `TC-006`.

**Acceptance:** Read-only concurrency needs no persistent state. Concurrent writes use owned task and integration worktrees, validate actual paths, preserve unrelated user changes, reject stale target paths, re-run verification after application, retain resumable state only when blocked, and clean every owned artifact after success. Host-specific external agent lifecycle wrappers are no longer required.

**Verification:** Git fixture tests cover clean and dirty workspaces, path overlap, stale target changes, integration conflict, interruption/resume identity, cleanup, worker budget, and capability-driven serial fallback. A fake native-agent harness proves actual overlap without paid model calls.

**Expected evidence:** No worker writes the invoking workspace; a successful run leaves only the intended unstaged change; blocked runs retain one compact manifest and exact resume instruction; legacy runtime modules are absent.

**Review focus:** Preserve proven Git safety while deleting lifecycle machinery that no longer owns product decisions.

### T-004 / Proportional Review

**Outcome:** Verification stays universal, combined changes receive an integration check, and independent review is selected only by an observable trigger.

**Files:**
- Modify: `skills/review/SKILL.md`
- Create: `skills/review/references/review-selection.md`
- Modify: `skills/final-review/SKILL.md`
- Modify: `skills/fix-review/SKILL.md`
- Remove: obsolete mandatory final-review report templates and reviewer orchestration assets
- Modify: `skills/issue/SKILL.md`
- Modify: `skills/fix/SKILL.md`

**Depends on:** T-002

**Source traceability:** `D-002`, `D-007`; `AC-002`, `AC-007`; `TC-007`, `TC-008`, `TC-012`.

**Acceptance:** Each worker verifies its own outcome; the controller validates evidence and combined behavior; ordinary disjoint worker results do not dispatch per-task reviewers; explicit review, sensitive changes, public compatibility, cross-task interaction, and reconciled conflicts require independent review. Findings are fixed and reverified in the active execution context instead of entering a separate workflow stage.

**Verification:** Focused contract tests cover every positive trigger, low-risk negative cases, compatibility alias forwarding, severity handling, and the absence of mandatory final-review artifacts.

**Expected evidence:** A deterministic selection table and passing tests showing the same multi-worker input chooses integration check or independent review solely from changed risk evidence.

**Review focus:** Ensure proportional review cannot become optional verification and that compatibility aliases do not retain the old ceremony indirectly.

### T-005 / Completion Knowledge And Git-Only Finish

**Outcome:** Every completion path performs a quiet, evidence-backed knowledge check, while `finish` handles only explicit Git disposition.

**Files:**
- Create: `skills/shared/completion-check.md`
- Modify: `skills/exec/SKILL.md`
- Modify: `skills/finish/SKILL.md`
- Modify: `skills/finish/references/branch-worktree-and-recording.md`
- Remove: `skills/finish/references/final-review-and-finish-gates.md`
- Remove: `skills/finish/references/memory-and-spec-candidates.md`
- Modify: `src/finish-runtime.mjs`
- Modify: `src/workspace-memory.mjs`
- Modify: `docs/loopx/memory/README.md`
- Test: `test/workflow.test.mjs`
- Test: `test/trellis-hardening.test.mjs`

**Depends on:** T-002

**Source traceability:** `D-008`, `D-009`; `AC-008`, `AC-009`; `TC-009`, `TC-010`, `TC-011`.

**Acceptance:** Path changes no longer generate generic extraction candidates. Existing applicable specs changed by the implementation must be synchronized. New spec rules require an authority source. Only encountered, reusable, non-obvious pitfalls with evidence may be written to local memory; shared or newly tracked knowledge is proposed explicitly. `finish` has no final-review or extraction precondition.

**Verification:** Tests cover required spec synchronization, inferred-rule rejection, qualifying local memory, ordinary `none`, deduplication, no secret or raw-log output, and every Git disposition on clean and blocked workspaces.

**Expected evidence:** The old three generic change-window candidates are absent; no-knowledge completion creates no files; finish audit and record retain Git evidence without knowledge-review state.

**Review focus:** Keep durable knowledge authoritative and sparse; do not move implementation summaries into memory under more elaborate wording.

### T-006 / Installation, Governance, And Documentation Migration

**Outcome:** Packaging, tests, and bilingual documentation expose the same canonical workflow and one-release compatibility policy.

**Files:**
- Modify: `src/install-discovery.mjs`
- Modify: `scripts/verify-skills.mjs`
- Modify: `test/fixtures/skill-contract-matrix.json`
- Modify: `test/skill-governance.test.mjs`
- Modify: `test/parallel-subagent-exec-release.test.mjs`
- Modify: `plugins/loopx/scripts/plugin-install.test.mjs`
- Modify: `README.md`
- Modify: `README.zh-CN.md`
- Modify: `docs/loopx/skills.md`
- Modify: `docs/loopx/skills.zh-CN.md`
- Modify: `docs/loopx/cli.md`
- Modify: `docs/loopx/cli.zh-CN.md`
- Modify: `docs/loopx/specs/installation.md`
- Modify: `package.json`

**Depends on:** T-003, T-004, T-005

**Source traceability:** `D-002`, `D-010`, `D-011`; `AC-001`, `AC-002`, `AC-011`; `TC-001`, `TC-002`, `TC-006`, `TC-011`, `TC-012`.

**Acceptance:** Package and normal/plugin installs include the canonical `plan` entry and compatibility aliases, installed guidance is byte-consistent, changed skill versions match the matrix, docs contain no Golden-path default or user-selected execution mode, and old names are documented only as temporary explicit aliases.

**Verification:** `node scripts/verify-skills.mjs`, focused governance tests, package-file inspection, and install tests for Codex and Claude.

**Expected evidence:** English and Chinese surfaces describe prompt-first and adaptive execution consistently; no stale mandatory checkpoint, final-review-before-finish, manual parallel-only, or resolver-runtime-authority claims remain.

**Review focus:** Check the actual installed payload rather than only repository prose, and preserve unrelated issue-driven and support-lens discovery behavior.

### T-007 / Product-Baseline Evaluation

**Outcome:** Maintainers can measure the installed redesign against bare prompt behavior without turning evaluation into a release workflow.

**Files:**
- Create: `evals/darwin-simple/README.md`
- Create: `evals/darwin-simple/cases.json`
- Create: `scripts/run-darwin-simple-evals.mjs`
- Create: `test/darwin-simple-eval.test.mjs`
- Create: focused fixture repositories under `test/fixtures/darwin-simple/`
- Modify: `src/agent-eval.mjs`
- Modify: `test/agent-eval.test.mjs`
- Modify: `package.json`

**Depends on:** T-006

**Source traceability:** `D-012`; `AC-012`; `TC-001` through `TC-013`.

**Acceptance:** Each variant starts from a fresh fixture. The candidate installs loopx into a temporary host home and receives only the installed guidance and discoverable skills; the baseline receives none. Both variants share model, effort, tools, task, timeout, and starting repository. Reports include outcome, verification, changed paths, artifacts, worker overlap, peak workers, tokens, latency, spec outcomes, and memory outcomes.

**Verification:** Deterministic fake-agent tests prove isolation, variant parity, installed-surface provenance, artifact/worktree cleanup, actual concurrency measurement, quality-first scoring, and the absence of candidate-only resolver injection. An opt-in live command runs paired crossover replicates without being part of `npm test`.

**Expected evidence:** Small direct cases stay within 10% of bare-prompt median tokens and latency when live metrics are available; parallel cases show real overlap and improve over forced serial medians; every safety and quality oracle passes before resource results are reported as favorable.

**Review focus:** Treat live variability as diagnostic evidence and never let lower cost compensate for a failed outcome, unsafe mutation, stale spec, or noisy knowledge write.

## Verification

```bash
node scripts/verify-skills.mjs
npm test
git diff --check
git status --short
```

Expected deterministic result: all repository and install-surface tests pass; prompt-first success paths leave no workflow artifacts; protected model-native files are unchanged by this work; runtime eval output remains untracked. The maintainer may then run the opt-in live evaluator and use the redesigned version before deciding whether to publish it.
