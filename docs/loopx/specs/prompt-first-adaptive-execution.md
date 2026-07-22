## Problem Statement

loopx currently imposes a fixed, artifact-heavy workflow on work that capable coding models can often complete directly. Clear changes are routinely expanded into clarification, detailed planning, task dispatch, repeated review, final review, finish state, and generic knowledge-extraction steps. The result is higher latency and token use, overly prescriptive plans, underused concurrency, and workflow rules that can constrain rather than amplify stronger models. The current finish-time spec and memory extraction also produces generic review reminders from changed paths instead of precise, reusable project knowledge.

The maintainer needs loopx to remain useful as a safety and coordination harness without becoming the default author of every implementation decision. The product should be lightweight for ordinary work, accurate when risk requires governance, fast when tasks are independent, and safely parallel when the host can isolate concurrent changes.

## Solution

Make prompt-first execution the normal behavior for clear, bounded requests. The model may inspect, implement, verify, and report directly without first creating a workflow artifact. When a clear request contains independent outcomes, one adaptive executor may derive a temporary execution graph and run isolated leaf workers concurrently without requiring a persistent plan.

Reduce the canonical workflow surface to six explicit intents: clarify, spec, plan, exec, review, and finish. The adaptive executor chooses same-context serial execution or worktree-isolated concurrency from current dependencies, write surfaces, reasoning context, verification boundaries, and runtime capability. loopx owns worker limits, isolation, integration safety, fresh verification, and recovery state; the model owns semantic decomposition and implementation judgment.

Apply governance proportionally. Verification remains mandatory, but independent review, persistent plans, resumable state, knowledge writes, and Git disposition occur only when their concrete trigger is present. Knowledge distillation compares the accepted intent, implemented result, verification evidence, and existing project knowledge. It synchronizes applicable specs, preserves only non-obvious reusable memory, and produces no output when nothing novel exists.

## User Stories

1. As a loopx user, I want a clear local coding request to execute directly, so that workflow overhead does not exceed the work itself.
2. As a loopx user, I want direct work to include fresh verification, so that lightweight execution does not weaken correctness.
3. As a loopx user, I want ordinary direct work to create no plans, ledgers, review reports, or finish artifacts, so that my repository stays clean.
4. As a loopx user, I want a clear multi-outcome request to use concurrency without first writing a plan, so that planning ceremony does not block obvious parallel work.
5. As a loopx user, I want persistent plans only when I request one or need approval, recovery, or durable coordination, so that plans remain purposeful.
6. As a plan reader, I want plans to state outcomes, boundaries, dependencies, acceptance, and verification, so that I can understand intent without reading an implementation transcript.
7. As an implementing model, I want local implementation choices left open, so that I can use current code and model capability rather than stale prescribed microsteps.
8. As a loopx user, I want one execution entry point, so that I do not have to choose between serial, subagent, and parallel modes.
9. As an implementing model, I want to explain why work is serial or concurrent, so that execution choices remain reviewable without a risk score.
10. As a loopx user, I want independent tasks to run concurrently, so that wall-clock time decreases when the work permits it.
11. As a loopx user, I want strongly coupled tasks to remain in one sequential context, so that concurrency does not fragment necessary reasoning.
12. As a repository owner, I want concurrent writers isolated in task worktrees, so that workers cannot overwrite each other or my current workspace.
13. As a repository owner, I want concurrent results combined in a protected integration workspace, so that the complete change can be verified before reaching my workspace.
14. As a repository owner, I want pre-existing uncommitted changes preserved without stash or implicit commit, so that loopx never takes ownership of my work.
15. As a repository owner, I want stale target paths to block automatic application, so that changes made during a run are not overwritten.
16. As a loopx user, I want unsupported concurrency capability to fall back to serial execution, so that platform differences do not turn valid work into failure.
17. As a loopx user, I want a bounded worker budget, so that adaptive concurrency cannot create uncontrolled agent usage.
18. As a loopx user, I want dispatched workers to remain leaves, so that the top-level executor retains lifecycle and resource ownership.
19. As a loopx user, I want successful concurrent runs to clean their worktrees and run state, so that temporary safety machinery does not become permanent workflow state.
20. As a loopx user, I want interrupted concurrent work to preserve only enough state to resume safely, so that recovery remains possible without a large state machine.
21. As a loopx user, I want every worker outcome and the integrated result verified, so that concurrency does not trade speed for accuracy.
22. As a loopx user, I want low-risk disjoint changes to avoid per-task independent reviewers, so that parallel execution does not double agent calls by default.
23. As a repository owner, I want security, destructive operations, public compatibility changes, cross-task interaction, and reconciled conflicts independently reviewed, so that meaningful risks retain a separate check.
24. As a loopx user, I want review findings fixed and reverified in the active execution context, so that feedback does not create another mandatory workflow stage.
25. As a repository owner, I want applicable specs updated when behavior changes, so that durable project rules remain trustworthy.
26. As a repository owner, I want new specs to require an explicit authority source, so that one implementation inference does not silently become a permanent rule.
27. As a future coding agent, I want memory to contain only evidence-backed, non-obvious, reusable pitfalls, so that it reduces investigation instead of adding noise.
28. As a loopx user, I want ordinary changes with no novel knowledge to produce no memory or spec candidates, so that completion stays quiet.
29. As a loopx user, I want finish to handle only explicit `$finish` invocations or Git disposition for work completed by the active loopx execution context, so that standalone branch, commit, merge, PR, and worktree requests remain ordinary Git operations.
30. As a loopx user, I want the installed host guidance and skill descriptions to control routing, so that documented behavior matches the product I actually use.
31. As an existing loopx user, I want old execution and review names to forward temporarily to canonical entries, so that migration does not break explicit invocations immediately.
32. As a loopx maintainer, I want legacy aliases excluded from automatic discovery, so that compatibility does not preserve the old decision burden.
33. As a loopx maintainer, I want real installed behavior compared with a bare-prompt baseline, so that evaluation measures the product rather than an injected experimental prompt.
34. As a loopx maintainer, I want quality and safety to gate any performance claim, so that lower tokens or latency cannot conceal a regression.
35. As a loopx maintainer, I want live evaluation to remain an opt-in diagnostic, so that I can use the redesigned version personally before deciding whether to publish it.

## Implementation Decisions

- Runtime routing is owned by short installed host guidance and precise skill frontmatter. The resolver document remains a governance index rather than an automatically loaded runtime authority.
- The canonical workflow entries are clarify, spec, plan, exec, review, and finish.
- The former planning, serial-execution, subagent-execution, parallel-execution, final-review, and review-fix names remain explicit-only compatibility aliases for one release.
- Clear single-outcome work remains prompt-first and does not require a skill invocation.
- Clear multi-outcome work may enter the adaptive executor directly from the request without producing a persistent plan.
- Persistent planning is selected only for explicit planning requests, approval boundaries, interruption recovery, or durable cross-stage coordination.
- A lean plan describes semantic outcomes and constraints. It does not require implementation code, minute-scale steps, review ceremonies, or fixed parallel metadata.
- The executor derives a current execution graph from the request or plan and the present codebase. A plan's dependencies and expected files are important inputs but not immutable scheduler commands.
- Concurrent execution requires independent dependencies, write surfaces, decisions, verification, baseline inputs, and integration outcomes. Any uncertainty selects sequential execution.
- The top-level executor is the only agent-lifecycle owner. All implementers, reviewers, and fixers are leaf workers.
- The default worker budget is four. Effective concurrency is the minimum of admissible ready work, observed host capacity, and configured budget. Every role consumes the same budget.
- Read-only concurrency does not require persistent run state. Concurrent mutation uses isolated task worktrees and a protected integration workspace.
- Concurrent results are integrated in dependency order, receive combined verification, and return to the user's workspace only when target paths still match the execution baseline.
- loopx does not stash, formally commit, or overwrite user-owned workspace changes. Unrelated changes are preserved; overlapping or uncertain changes force sequential execution or block application.
- Run state exists only for active concurrent mutation or explicit recovery needs. Success removes the state and owned worktrees; interruption retains one compact manifest and exact resume information.
- Cross-runtime semantics are uniform, but concurrency is capability-adaptive. Native host agents are preferred. Missing reliable write isolation narrows execution to read-only concurrency or serial work.
- Fresh task-relevant verification is required for every completion claim.
- The integrated change receives an integration check. Independent review is triggered only by explicit request, sensitive or destructive behavior, public compatibility, cross-task interaction, or conflict reconciliation.
- Multi-agent execution alone does not mandate one reviewer per task or a final-review artifact.
- Review findings are handled and reverified in the active execution context rather than through a separate mandatory fix workflow.
- A completion check applies across direct, sequential, and concurrent work. It evaluates verification, applicable spec consistency, and genuinely reusable project knowledge.
- Existing applicable specs changed by the implementation are synchronized as part of the implementation. New durable rules require an explicit user decision, approved requirement, or existing spec as authority.
- Local memory may be written automatically only for an actually encountered, evidence-backed, non-obvious, reusable project pitfall. Repo-tracked specs and shared memory require explicit authority or acceptance.
- Generic path-based extraction candidates, commit summaries, obvious code facts, raw conversations, secrets, and workflow state are not knowledge.
- Finish is invoked only by explicit `$finish` or for Git disposition of work completed by the active loopx `exec` or `fix` context. Standalone Git requests do not trigger it, and eligible finish work has no mandatory final-review or knowledge-extraction precondition.
- No direct skill, direct mode, numeric risk classifier, model router, general-purpose scheduler, lease system, public execution-mode flag, or staged release mechanism is introduced.

## Testing Decisions

- The primary testing seam is the installed product boundary: install the candidate into a fresh temporary host home, submit a task in a fresh fixture repository, and observe the final repository, verification, agent activity, temporary artifacts, knowledge outcome, and user-facing response.
- Routing tests exercise generated host guidance and installed skill frontmatter rather than repository documentation alone.
- Adaptive execution tests submit requests or lean plans and assert externally visible serial or concurrent behavior, not internal model reasoning.
- Git isolation tests use real temporary repositories and worktrees to cover unrelated dirty changes, overlapping target changes, stale baselines, integration conflicts, interruption, resume identity, and cleanup.
- A fake native-agent harness controls duration and output so tests can prove actual overlap, bounded peak workers, deterministic integration order, and safe fallback without paid model calls.
- Review-selection tests vary only observable risk evidence and assert whether the result requires an integration check or independent review.
- Completion tests compare accepted intent, final diff, verification evidence, existing specs, and existing memory. They assert required spec synchronization, rejected unsupported rules, qualifying local memory, deduplication, and quiet `none` outcomes.
- Finish tests cover routing isolation from standalone Git requests and the valid Git choices for active loopx work in normal repositories and worktrees without requiring review or extraction artifacts.
- Compatibility tests prove old explicit names forward to the correct canonical intent while remaining absent from automatic routing.
- Paired live evaluation runs bare prompt and the actually installed candidate with the same model, effort, tools, task, timeout, and fresh starting repository.
- Live direct-work cases measure outcome, verification, changed paths, workflow artifacts, workers, tokens, and latency. Candidate medians should remain within ten percent of bare prompt when metrics are available.
- Live independent-work cases must observe overlapping workers and compare favorably with forced serial execution. Strongly coupled cases must select serial execution.
- Quality and safety oracles are evaluated before resource results. Any incorrect result, unsafe mutation, stale spec, or noisy knowledge write invalidates a favorable cost comparison.
- Existing repository patterns for install verification, workflow tests, Git worktree fixtures, skill governance, and agent-eval normalization should be extended rather than replaced with implementation-coupled mocks.

## Out of Scope

- A new direct skill, direct mode, or public mode selector.
- A numeric risk score or runtime model policy engine.
- A general-purpose scheduler, distributed lease service, or arbitrary workflow kernel.
- Mandatory concurrency on hosts that cannot provide reliable isolation.
- Automatic creation of repo-tracked rules from model inference alone.
- Preserving the old mandatory Golden-path, checkpoint, per-task review, final-review, or finish artifact protocols.
- Reading from or implementing the separate model-native adaptive-execution design or plan package.
- Automated release switching, staged rollout, or publishing decisions.
- Committing runtime evaluation output or temporary execution state.

## Further Notes

- The maintainer has accepted the domain language and architectural decision for prompt-first adaptive execution.
- The existing implementation plan breaks the work into routing, canonical contracts, thin concurrency runtime, proportional review, completion knowledge, installation migration, and product-baseline evaluation.
- The maintainer will use the completed redesign personally before deciding whether to publish it.
