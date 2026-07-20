# Behavioral Model Extraction Guide

Use this reference when the requirement involves stateful entities, multi-step processes, approval chains, async tasks, or lifecycle management. Skip for simple CRUD, static pages, or single-action features.

## Activation Keywords

Activate behavioral model extraction when the requirement contains any of:

- Chinese: 状态、流程、审批、生命周期、任务、执行、工单、流转、阶段、步骤、链路、回退、重试
- English: state, workflow, approval, lifecycle, pipeline, job, task, step, phase, transition, retry, rollback, saga

## 2a. State Model

Extract all states from the requirement. States may be explicit (named in the document) or implicit (implied by described behavior).

### What to extract

| Element | Description |
|---------|------------|
| Entity | The object that has states (order, task, event, application, etc.) |
| States | All named or implied states |
| State hierarchy | Whether states are flat or layered (main state + sub-state) |
| Initial state | The state upon creation |
| Terminal states | States from which no further transition is possible |
| Error/exception states | States representing failure, timeout, or manual intervention |
| Stale states | States that require timeout or escalation handling |

### How to find implicit states

- A verb like "confirm", "approve", "reject", "cancel", "complete", "fail" implies a state AFTER the action.
- "Pending X" implies a waiting state and a triggering event.
- "Draft" or "temporary" implies a mutable pre-commitment state.
- Any retry or rollback implies an error state and a recovery path.
- "In progress" without a completion event implies a potential stale state.

### Output format

```markdown
### State Model: [Entity Name]

| State | Type | Description | Timeout/Escalation |
|-------|------|-------------|--------------------|
| draft | initial | Created but not submitted | None |
| pending_review | intermediate | Awaiting approval | 48h → auto-escalate |
| approved | intermediate | Approved, awaiting execution | None |
| executing | intermediate | Processing in progress | 1h → mark failed |
| completed | terminal | Successfully finished | N/A |
| failed | error | Execution failed | Manual retry available |
| cancelled | terminal | Cancelled by user or system | N/A |

State hierarchy: [flat / layered]
- If layered: describe main state vs sub-state relationship
```

## 2b. Transition Matrix

Map every state change the requirement defines or implies.

### What to extract

| Column | Description |
|--------|------------|
| From | Source state |
| Action/Trigger | What causes the transition (user action, system event, timeout, external callback) |
| To | Target state |
| Actor | Who/what performs the action (role, system, external service) |
| Guard condition | What must be true for the transition to occur |
| Failure path | What happens if the transition fails or the guard is not met |

### How to find transitions

- Every action verb in the requirement implies a transition.
- Conditional language ("if", "when", "only when", "unless") implies a guard condition.
- "After X, then Y" implies a sequential transition.
- Exception/error descriptions imply failure paths.
- Timeout language implies automatic transitions.

### Gap signals

Flag as a gap when:

- A state has no outgoing transition (dead-end, unless explicitly terminal).
- A transition has no defined failure path.
- A guard condition references undefined data or undecidable criteria.
- Two transitions from the same state with the same trigger but different targets (non-determinism).
- A transition exists but the reverse (rollback/undo) is not addressed.

### Output format

```markdown
### Transition Matrix: [Entity Name]

| From | Action/Trigger | To | Actor | Guard | Failure Path |
|------|----------------|-----|-------|-------|--------------|
| draft | submit | pending_review | user | all required fields filled | validation error, stay in draft |
| pending_review | approve | approved | reviewer | reviewer has permission | N/A (action blocked) |
| pending_review | reject | draft | reviewer | rejection reason provided | N/A |
| pending_review | timeout(48h) | pending_review | system | no action taken | escalate to manager |
| approved | execute | executing | system | dependencies ready | mark failed, notify owner |
| executing | complete | completed | system | all steps passed | mark failed |
| executing | timeout(1h) | failed | system | no completion signal | notify owner + ops |
| any | cancel | cancelled | admin | not in terminal state | N/A |

Gaps found:
- [ ] ...
```

## 2c. Operation Matrix

For each state, enumerate what operations are allowed and forbidden.

### What to extract

| Column | Description |
|--------|------------|
| State | The current state |
| Allowed operations | Actions the user/system CAN perform in this state |
| Forbidden operations | Actions explicitly or implicitly NOT available |
| Role/Permission | Which role can perform each allowed operation |
| Entry point | Where the operation is triggered (UI button, API endpoint, scheduled job, event) |

### How to find operations

- Buttons, links, or actions described in UI sections.
- API endpoints that accept the entity as input.
- Batch jobs or scheduled tasks that act on entities in a specific state.
- Notifications that enable recipient actions.

### Gap signals

Flag as a gap when:

- An operation is described but its available states are not defined.
- A state has no available operations and is not terminal (dead state).
- The same operation is described differently in different parts of the document.
- Permission/role for an operation is not specified.
- A destructive operation (delete, revoke, override) lacks confirmation or audit.

### Output format

```markdown
### Operation Matrix: [Entity Name]

| State | Allowed Operations | Forbidden | Role | Entry Point |
|-------|--------------------|-----------|------|-------------|
| draft | edit, delete, submit | approve, execute, cancel | owner | UI form, API |
| pending_review | approve, reject, reassign | edit, delete, execute | reviewer | review panel |
| approved | execute, cancel | edit, approve, reject | system, admin | auto/manual trigger |
| executing | monitor, cancel(force) | edit, approve, reject | admin, ops | ops dashboard |
| completed | view, export, archive | edit, delete, re-execute | any | detail page |
| failed | retry, cancel, investigate | approve | owner, ops | alert link, ops dashboard |

Gaps found:
- [ ] ...
```

## 2d. Data Mutation Matrix

For each operation, describe what data changes occur.

### What to extract

| Column | Description |
|--------|------------|
| Operation | The action being performed |
| Creates | New data entities or records created |
| Updates | Existing data fields modified |
| Deletes | Data removed or soft-deleted |
| External side effects | Calls to external systems, messages sent, files generated |
| Audit/Notification | Audit log entries, notifications triggered |
| Idempotency | What happens if the operation is performed twice |

### How to find mutations

- "Generate", "create", "produce" → Creates
- "Update", "modify", "set", "change" → Updates
- "Remove", "delete", "clear", "revoke" → Deletes
- "Send", "notify", "call", "sync", "publish" → External side effects
- "Log", "record", "track" → Audit
- Any async callback or webhook → potential duplicate delivery

### Gap signals

Flag as a gap when:

- An operation's data mutation is not described (we know the state changes, but not what else happens).
- External side effects are mentioned but failure handling is not.
- Idempotency is not addressed for operations that can be retried or receive duplicate triggers.
- Audit requirements are stated generically ("all operations are audited") without specifying what fields are logged.
- A notification is mentioned but channel, recipient, timing, and opt-out are undefined.

### Output format

```markdown
### Data Mutation Matrix: [Entity Name]

| Operation | Creates | Updates | Deletes | Side Effects | Audit/Notify | Idempotency |
|-----------|---------|---------|---------|--------------|--------------|-------------|
| submit | review_task | entity.status, entity.submitted_at | - | notify reviewer | audit: submitted by {user} | safe: re-submit overwrites |
| approve | execution_plan | entity.status, entity.approved_by | - | notify owner | audit: approved by {reviewer} | safe: no-op if already approved |
| execute | result_records, settlement_entries | entity.status, entity.executed_at | - | call downstream API | audit: execution started | UNSAFE: must check idempotency key |
| cancel | - | entity.status, entity.cancelled_at | pending_tasks (soft) | cancel downstream | notify stakeholders | safe: no-op if already cancelled |

Gaps found:
- [ ] ...
```

## 2e. Existing Implementation Fit

When a repository root is provided, compare the behavioral model against existing code.

### How to compare

1. Search for the entity in the codebase (models, schemas, types, enums).
2. Find state definitions (enum values, status constants, state machine configs).
3. Find transition logic (state machine handlers, status update code, event handlers).
4. Find operation handlers (API endpoints, service methods, command handlers).
5. Compare each element against the requirement's behavioral model.

### Status values

| Status | Meaning |
|--------|---------|
| covered | Implementation matches requirement |
| partial | Implementation exists but incomplete (missing states, transitions, or operations) |
| conflict | Implementation contradicts requirement (different states, different transitions) |
| missing | No implementation found for this element |

### Output format

```markdown
### Implementation Fit: [Entity Name]

| Element | Requirement | Implementation | Status | Evidence |
|---------|------------|----------------|--------|----------|
| States | 7 states defined | 5 states in enum | partial | `src/models/entity.go:StatusEnum` missing `executing`, `failed` |
| Transition: submit | draft → pending_review | draft → pending | partial | `src/service/entity.go:Submit()` no validation guard |
| Operation: cancel | available in non-terminal states | only available in `pending` | conflict | `src/api/entity.go:Cancel()` checks `status == pending` only |
| Mutation: execute | creates settlement_entries | creates entries + updates balances | conflict | `src/service/execute.go` mutates balance (not in requirement) |

Summary:
- Covered: X/Y elements
- Partial: X/Y elements
- Conflict: X/Y elements (REQUIRE CLARIFICATION)
- Missing: X/Y elements
```

## Analysis Boundary

This guide extracts and validates the behavioral model that the requirement DEFINES or IMPLIES. It does NOT:

- Design the state machine implementation (that belongs to `spec`).
- Choose between saga, event sourcing, or direct state mutation (that belongs to `spec`).
- Write code or propose APIs (that belongs to `plan` or `exec`).
- Resolve contradictions between requirement and implementation (that belongs to `clarify`).

When conflicts or gaps are found, report them as P0/P1 issues in the main analysis report. The behavioral model output is evidence that supports the gap assessment.
