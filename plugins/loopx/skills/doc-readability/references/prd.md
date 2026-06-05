# PRD Readability and Completeness

Use this reference only when the confirmed document type is `Requirements document / PRD`, or when the user explicitly asks to evaluate a document as a PRD.

## Core Standard

A PRD is readable only if it lets reviewers decide whether the product should be built and lets designers, engineers, QA, operations, and stakeholders understand what must be delivered. For PRDs, readability includes requirement completeness, not just prose clarity.

## Required Checks

Check the PRD across these areas:

| Area | What must be clear |
|---|---|
| Problem | What problem exists, who has it, why it matters now, and what current workaround or failure it replaces. |
| Goal | What outcome this release must achieve, and how success will be judged. |
| Non-goals | What is explicitly out of scope, deferred, or intentionally unsupported. |
| Users / roles | Which user roles exist, what each role can see or do, and which role owns each decision or operation. |
| Scope and priority | What is MVP / phase-one / required, what is optional, and what is future work. |
| Workflow | Trigger, preconditions, main path, branch paths, exception paths, and terminal states. |
| Functional requirements | Inputs, outputs, state changes, permissions, validation, dependencies, and failure handling. |
| Business rules | Who evaluates the rule, using which fields, at what time, and what happens when the rule fails. |
| Page / operation behavior | Entry point, displayed fields, action buttons, enable/disable conditions, submit validation, success/failure feedback, and audit logs. |
| Data / integration | Source systems, target systems, required fields, idempotency, versioning, retries, and consistency expectations. |
| Acceptance criteria | Testable Given/When/Then-style outcomes or equivalent concrete verification criteria. |
| Open questions | Unknowns, decision owners, deadlines, and whether they block delivery. |

## Detail Gap Patterns

Flag these as PRD detail gaps, even if the prose is readable:

- A feature says `support`, `process`, `identify`, `generate`, `sync`, `notify`, `confirm`, or `handle`, but does not define input, output, owner, timing, or terminal state.
- A workflow lists stages but omits trigger, precondition, branch conditions, exception handling, or completion criteria.
- A status is named but its transitions, allowed actions, owner, or exit condition are missing.
- A page lists fields but omits action behavior, button availability, validation, empty states, errors, permissions, or logs.
- A rule describes intent but not the exact field, calculation, priority, source of truth, or conflict handling.
- A Plan / task / event is generated, but the recipient, payload, idempotency, retry, cancellation, and failure handling are unclear.
- A dependency is mentioned but its contract, SLA, missing-data behavior, or fallback is undefined.
- A requirement cannot be tested because it lacks concrete examples or acceptance criteria.

## Ambiguity Probes

Use these probes to expose unclear requirements. Do not ask all of them to the user; use them to inspect the document and report the gaps that matter.

### Feature Scope

- What exactly does `support X` include and exclude?
- What is the minimum acceptable behavior for phase one?
- Is this automatic, manual, or semi-automatic?
- Who can trigger it, and from where?
- What happens if the user starts but does not finish?
- What behavior is intentionally not supported?
- What is the smallest shippable version of the feature?
- Which users, accounts, markets, regions, products, channels, or data types are included?
- Which cases are explicitly excluded even if they look similar?
- Does "support" mean display only, calculate, persist, send, execute, reconcile, notify, or audit?
- Does the requirement apply to historical data, only new data, or both?
- Is there a migration, backfill, or cleanup requirement?

### Actors and Ownership

- Which role owns each decision, confirmation, correction, and exception?
- Which actions are system actions, user actions, operator actions, or downstream-system actions?
- Who is allowed to override system output?
- Who reviews or approves high-risk actions?
- Who is notified when something is blocked, failed, revised, or completed?
- Who owns manual follow-up when automation cannot continue?

### Workflow and State

- What triggers the workflow?
- What preconditions must be true?
- What is the happy path?
- What branches exist and what condition selects each branch?
- What are the terminal states?
- Which states allow edit, retry, cancel, ignore, approve, reject, archive, or rollback?
- Who owns each state transition?
- What happens when two events, tasks, or users act on the same object concurrently?
- What is the first state after creation?
- What is the difference between draft, pending, confirmed, sent, failed, completed, archived, ignored, or cancelled?
- Which transitions are automatic and which require user action?
- Are any transitions irreversible?
- What events reopen or revise a completed item?
- What stale states require timeout handling or escalation?
- What should the system do if a workflow is interrupted mid-step?

### Timing and Snapshot

- Which date or time controls eligibility, calculation, display, execution, and notification?
- Is the date in user timezone, market timezone, system timezone, or source-system timezone?
- What snapshot is used for positions, balances, orders, customers, permissions, or source data?
- Can the snapshot be regenerated? If yes, does it replace or version prior results?
- What happens if source data arrives late, is revised, or is cancelled?
- What is the cutoff time for each action?
- What is allowed before cutoff, after cutoff, and after execution?

### Data and Rules

- What is the source of truth for each important field?
- Which field is required, optional, calculated, derived, or manually entered?
- What is the rule priority when multiple rules match?
- What happens when source systems disagree?
- What happens when required data is missing, stale, duplicated, revised, or cancelled?
- Are historical values preserved when current effective values change?
- Is there versioning, and which version is current?
- What is the unique key for deduplication?
- Which fields are immutable after creation?
- Which fields can be manually corrected, and how are original/system/manual/effective values preserved?
- What validation prevents invalid combinations?
- What precision, rounding, currency, unit, or formatting rule applies?
- What happens when two rules produce different outputs?
- What is the conflict priority between source data, manual confirmation, downstream return, and recalculation?
- Is the rule evaluated per user, per account, per task, per event, per order, or per item?

### Page and Operation Behavior

- Where is the entry point?
- What fields are visible by default, and what is hidden behind details?
- Which actions are available in each status?
- What disables an action button?
- What validation runs before submit?
- What confirmation, warning, or preview is shown before an irreversible operation?
- What success, failure, partial-success, retry, and timeout feedback does the user see?
- What audit log is written?
- What filters, sorting, grouping, search, export, or bulk actions are required?
- What empty, loading, error, no-permission, and no-data states are shown?
- What fields are editable, read-only, calculated, or drill-down only?
- What happens when a user edits data that has already changed in the background?
- What is the behavior for batch selection, partial selection, and disabled rows?
- What is the exact result of save, submit, approve, reject, retry, ignore, archive, cancel, rollback, or resend?
- Does the user need a preview of generated output before sending?

### Integration and Execution

- Who receives generated tasks, events, Plans, notifications, or files?
- What payload is sent?
- What idempotency key or duplicate-prevention rule exists?
- What is retryable and what requires manual intervention?
- What happens on partial success?
- What happens if the downstream system accepts the request but later reports failure?
- What cancellation, correction, reversal, or compensation path exists?
- Is execution synchronous, asynchronous, scheduled, or manual?
- What acknowledgement does the upstream system need?
- What return payload is expected?
- What retry policy applies: count, interval, backoff, manual retry, or no retry?
- What makes a request idempotent?
- How are duplicate sends, duplicate callbacks, or out-of-order callbacks handled?
- What monitoring, alerting, or reconciliation is required?
- What should happen when integration is unavailable but users continue operating?

### Permissions and Risk

- Who can view, create, edit, approve, send, retry, cancel, or archive?
- Which operations require dual review or elevated permission?
- What is the blast radius of a wrong operation?
- What guardrails prevent sending incomplete, stale, or unconfirmed data?
- What must be recoverable from logs?
- Which fields or actions are sensitive?
- Which roles can see customer-level, account-level, financial, or operational details?
- Is approval required before customer-facing or financially impactful actions?
- What is the rollback or compensation path for wrong execution?
- What operational dashboard or report proves the feature is healthy?
- What audit evidence must be retained for compliance or customer support?

### Notifications and External Visibility

- Who receives notifications: internal operators, downstream teams, customers, support, or all?
- What triggers notification creation?
- What template, channel, language, and timing are required?
- What fields are shown to customers versus internal users?
- What happens if notification delivery fails?
- Can notifications be resent, corrected, suppressed, or cancelled?
- What customer support or audit view is needed after notification?

## Acceptance Criteria Patterns

When a requirement is vague, propose a testable acceptance shape. Use domain language from the document.

```text
Given [precondition / status / role / data]
When [user action / system trigger / external event]
Then [observable result / state change / generated output]
And [audit / notification / error / retry behavior]
```

Include acceptance coverage for:

- Happy path.
- Missing or invalid input.
- Permission denied.
- Duplicate submission or duplicate event.
- External dependency failure.
- Partial success.
- Revised or cancelled source data.
- No impacted users / empty result.
- Manual override.
- Audit and traceability.

For page requirements, check:

```text
Given [task status and user role]
When [page opens or action is clicked]
Then [fields/actions visible]
And [disabled/enabled conditions]
And [validation / feedback / log behavior]
```

For rules, check:

```text
Given [source data and priority conditions]
When [rule evaluation runs]
Then [selected result]
And [fallback or conflict result]
```

## PRD Severity

Use this severity model in addition to the main skill's severity model:

| Severity | Meaning |
|---|---|
| Blocking requirement gap | A builder or reviewer cannot know what to implement, test, approve, or operate. |
| Important requirement gap | The requirement is implementable only with assumptions; different readers may implement it differently. |
| Optional refinement | The requirement is understandable, but examples, wording, or organization could reduce review effort. |

Do not label every missing detail as blocking. A missing detail is blocking only if implementation, testing, or review would require guessing.

## PRD Output Requirement

When assessing a PRD, include a section for requirement detail gaps. Use natural headings in the user's language. Cover:

- The gap.
- Why it affects delivery or review.
- What question must be answered or what detail must be added.
- A suggested acceptance or clarification shape when useful.

Example shape:

```text
Requirement detail gaps:
- [Gap]: ...
  Impact: ...
  Need to clarify: ...
  Suggested acceptance shape: ...
```

## Rewrite Guidance for PRDs

When rewriting a PRD, prefer this structure:

```text
1. Summary
2. Background / problem
3. Goals and non-goals
4. Users and roles
5. Scope and priorities
6. Core workflows
7. Functional requirements
8. Rules and edge cases
9. Page / operation requirements
10. Data and integration requirements
11. Acceptance criteria
12. Open questions
13. Appendix
```

Keep implementation contracts in the PRD only when they are needed for product review. Move exhaustive field tables, enum lists, API payloads, and state-machine details to appendices or companion engineering specs when they interrupt the product decision path.
