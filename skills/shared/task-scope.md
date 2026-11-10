# Requirement, task, and plan scope

Read this when work has a task brief or is being divided into separate assignments.
It defines document responsibilities, not a scheduler or required workflow.

## Work unit

A requirement owns the overall outcome and integration acceptance. A task is a
bounded assignment with a deliverable, necessary context, decision authority and
acceptance. A plan describes how one assignment will be implemented; its P-*
slices are execution outcomes within that plan. A session is an execution context,
not a task identity. A task may resume across sessions, and a clear task may need
no persistent plan. Serial tasks can reduce context just as parallel tasks can.

Accept human-provided and agent-proposed boundaries on the same terms. Preserve
settled scope and completed work; inspect gaps instead of decomposing again by
default. Do not use file counts, token counts or estimated duration as hard task
boundaries. Strong coupling or repeated cross-task decisions may justify merging
assignments or giving their shared decision to the coordinator.

## Source and context

The user or coordinating agent keeps the requirement map: overall outcome,
shared constraints, requirement coverage, dependencies and integration evidence.
The task brief references that map and the original source sections it owns; it
is not another authoritative PRD. An existing issue tracker can own progress;
do not create a parallel status ledger. Identify who maintains coordination and
who checks the final integrated outcome, without assuming a particular host.
A role is sufficient: in a one-person assignment use the requester/current
coordinator. Do not ask for a person's name or extra approval merely to fill an
owner field. Ask about coordination ownership only when unresolved authority or
responsibility would materially affect the work.

For task-scoped clarification, design, planning, execution and review, read:

- the requirement's overall goal and all applicable shared constraints;
- the original source sections assigned to this task, including their acceptance;
- the current shared contracts and the actual delivered dependency artifacts;
- relevant repository rules, implementation and evidence.

This is how to read the original requirement at task scope, not permission to
trust a summary or omit a difficult requirement. Follow references when a decision
or interaction is unclear; widen inspection for a changed shared contract. Missing
or contradictory material source evidence blocks affected work. Do not preload
unrelated task plans, transcripts or failed experiments by default. The coordinator
still checks complete requirement coverage and final integration.

Shared decisions have one authoritative home. Task-local decisions stay local.
Before changing a shared contract, identify its producer, consumers and affected
acceptance; resolve material decisions with the owner, then update its authority
and affected task briefs. Reopen only affected work and review coverage. A previously
completed task is not proof that it satisfies a newly changed contract.

## Questions and dependencies

Requirement-level clarification establishes goal, boundaries, protected behavior
and enough shared meaning to divide work. It need not resolve every task's local
details. Task-level clarification is ready when decisions necessary for the current
work are settled. Neither label grants permission to implement undecided behavior.

For an unresolved question, record the owner or owner-to-be-confirmed, affected
task(s), and the point before which an answer is needed. Do not invent an owner or
answer. Local questions in a later task do not block unrelated current work; a
cross-task decision blocks its dependent implementation, even if files differ.
Pending work remains required unless the user authorizes deferral.

Distinguish a dependency on an agreed contract from a dependency on delivered
implementation or integrated behavior. Contract-compatible fixtures can unblock
local development but cannot prove a real integration. Each task says what is
needed to start and what is needed to finish. Parallel work also needs disjoint
write ownership and safe shared-state boundaries; serial is valid without claiming
independence. Cross-task integration is assigned explicitly, not left to chance.

## Handoff versus recovery

A finished task hands over the delivered behavior, artifact locations and exact
version/content identity, applicable contracts, completed verification and its
scope, limitations, unresolved dependencies and the downstream starting point.
Update the result section of the task brief or existing work item. Link evidence
instead of pasting debugging history. A consumer verifies that the delivered
identity and contract still match its needs; an upstream pass is not integration
acceptance. Use the existing evidence contract for claims and evidence reuse.

Unfinished work needs a recovery record: actual completed/remaining work, workspace
and base, attributable changes, current blockers and next action. Follow the
executor's existing checkpoint rules before mutation. A compact task handoff must
not erase dirty-workspace attribution or pretend unfinished changes are delivered.

When splitting an active assignment, retain its accepted decisions and verified
results, assign only remaining work, and identify the current source version and
unresolved interactions. Do not replay completed implementation or reviews merely
to fit the new structure. Task completion means local acceptance is supported;
requirement completion additionally requires coverage of all required outcomes and
actual integrated verification. No task map or plan expands Git or external-action
authorization.
