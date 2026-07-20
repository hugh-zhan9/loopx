# loopx Domain Language

loopx is a skill-first workflow harness that lets the model handle ordinary work directly while adding governance only where it materially improves execution.

## Execution

**Prompt-first execution**:
Execution that begins from a clear user request and lets the model inspect, implement, verify, and report without first creating a persistent workflow document.
_Avoid_: Direct mode, ungoverned execution

**Governed escalation**:
The deliberate addition of clarification, specification, planning, review, or resumable state when unresolved decisions, risk, coordination, recovery, or explicit user intent justify it.
_Avoid_: Default workflow, mandatory Golden path

**Adaptive concurrency**:
Execution in which the model identifies independent work that can run concurrently, while strongly coupled work remains sequential. Concurrency is a formal capability, not an unconditional default.
_Avoid_: Default parallelism, always-parallel execution

**Adaptive executor**:
The single planned-work entry point that chooses same-context sequential execution or isolated concurrent execution from the work's dependencies, write surface, and reasoning context.
_Avoid_: Parallel executor, sequential executor, execution mode

**Concurrency admission**:
The explainable rule that permits concurrent execution only when tasks have independent dependencies, write surfaces, decisions, verification, baselines, and integration outcomes. Uncertain work remains sequential.
_Avoid_: Risk score, parallel preference

**Lean plan**:
A concise statement of intended outcomes, boundaries, known dependencies, acceptance, and verification that leaves local implementation judgment to the executing model.
_Avoid_: Step transcript, implementation recipe

**Execution graph**:
The executor's current view of ready, dependent, sequential, and concurrently admissible work, derived from the plan and the present codebase.
_Avoid_: Plan metadata, fixed schedule

**Run manifest**:
Temporary state retained only while concurrent or explicitly resumable work needs ownership, recovery, and integration safety. It disappears after successful integration and verification.
_Avoid_: Workflow ledger, permanent execution record

**Integration workspace**:
A temporary protected workspace where independently produced changes are combined and verified before one complete result is applied to an unchanged target surface in the user's workspace.
_Avoid_: Shared worker workspace, user branch

**Independent task**:
A task whose dependencies, write surface, and required reasoning context allow it to complete without coordinating intermediate state with another active task.
_Avoid_: Parallel task, isolated step

**Strongly coupled task**:
A task whose result or reasoning depends on intermediate state shared with another task and therefore belongs in the same sequential execution context.
_Avoid_: Non-parallel task, blocked task

**Execution boundary**:
The limit within which loopx protects concurrent work from conflicting dependencies or changes, while leaving task-level implementation judgment to the model.
_Avoid_: Scheduler policy, model policy

**Verification**:
Fresh evidence that an implemented outcome works as intended and did not break the relevant surrounding behavior. Every completion path requires verification.
_Avoid_: Review, confidence statement

**Integration check**:
An examination of the combined change for scope, interaction, and verification gaps after independently produced work has been integrated.
_Avoid_: Task review, final ceremony

**Independent review**:
A separate evaluation required when risk, compatibility, cross-task interaction, conflict reconciliation, or explicit user intent justifies reviewer independence.
_Avoid_: Mandatory task review, verification

**Completion check**:
The lightweight end-of-work check that confirms verification, applicable spec consistency, and any genuinely reusable knowledge across prompt-first, sequential, and concurrent execution.
_Avoid_: Finish workflow, final ceremony

**Finish**:
Explicit handling of Git disposition after completed work, such as commit, branch, merge, pull request, worktree cleanup, or discard.
_Avoid_: Completion check, final review, knowledge distillation

## Knowledge

**Knowledge distillation**:
Semantic comparison of the intended outcome, implemented change, verification evidence, and existing project knowledge to identify only novel information worth preserving.
_Avoid_: Change summary, candidate generation

**Spec**:
A durable project rule or behavioral contract that future implementation and review must obey. A change that invalidates an applicable spec is incomplete until the spec and implementation agree.
_Avoid_: Design notes, implementation summary

**Memory**:
Non-durable project knowledge that is difficult to recover from the code alone and helps future work avoid repeated investigation or known pitfalls.
_Avoid_: Commit summary, workflow state, obvious code fact

**Spec delta**:
A concrete addition, modification, removal, or rename needed to keep durable project knowledge aligned with an implemented behavior change.
_Avoid_: Spec review reminder, possible documentation update

**Authority source**:
An explicit user decision, approved requirement, or existing applicable spec that can justify creating or changing a durable project rule.
_Avoid_: Implementation inference, model confidence

## Workflow Surface

**Routing authority**:
The installed host guidance and skill frontmatter that determine whether a request stays prompt-first or invokes a canonical workflow entry.
_Avoid_: Resolver document, README routing

**Canonical workflow entry**:
One of the small set of current user-facing workflow intents: clarify, spec, plan, exec, review, or finish.
_Avoid_: Execution mode, workflow stage chain

**Compatibility alias**:
A temporary explicit-only name that forwards an older invocation to its canonical workflow entry without participating in automatic discovery or routing.
_Avoid_: Core skill, alternate workflow

**Runtime capability**:
A host's observed ability to run read-only or worktree-isolated workers safely. Missing capability narrows concurrency but does not change workflow intent or fail otherwise executable work.
_Avoid_: Execution mode, platform workflow

**Worker budget**:
The shared upper bound on leaf implementers, reviewers, and fixers owned by the top-level executor. It limits resource use without creating a target concurrency level.
_Avoid_: Parallelism target, worker pool

**Product baseline**:
Bare-model behavior on the same task, model, tools, and fresh repository used to judge whether the actually installed loopx surface preserves quality while adding useful governance or execution capability.
_Avoid_: Injected-prompt baseline, documentation comparison
