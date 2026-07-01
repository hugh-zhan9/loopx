# Model Selection And Retry

Always specify the model explicitly when dispatching a subagent.

## Model Tiers

Use the least powerful model that can safely do the job, but bias upward when
classification is uncertain.

- cheap:
  isolated, mechanical implementation with a complete brief and low integration
  risk
- standard:
  multi-file coordination, repo pattern matching, test design, prose-driven
  requirements, or ordinary review work
- most-capable:
  architecture judgment, final review, subtle invariants, risky compatibility
  work, migration, security, data-loss, concurrency, or cross-task review

If a task sits between cheap and standard, choose standard. If a review sits
between standard and most-capable, choose most-capable.

## Uncertainty Bias

Bias one tier upward when the task classification is uncertain. Total turn
count matters more than nominal per-token price.

## Implementer Status Handling

### DONE

Generate the review package with `scripts/review-package BASE HEAD`, then
dispatch the task reviewer.

### DONE_WITH_CONCERNS

Read the concerns before review. If they affect correctness or scope, address
them before review. Otherwise note them and continue into review.

### NEEDS_CONTEXT

Provide the missing context and re-dispatch.

### BLOCKED

Assess the blocker before retrying:

1. if context is missing, provide it and re-dispatch with the same model
2. if the task requires more reasoning, move up one model tier
3. if the task is too large, split it into smaller pieces
4. if the plan is wrong, escalate the plan defect to the user

Never force the same retry without changing context, scope, or model.

## Retry Options

Valid retry moves are:

- more context
- a more capable model
- smaller task scope
- plan-defect escalation

Do not ignore unresolved `BLOCKED` or `NEEDS_CONTEXT` states.
