# Design Proposal Reference

Use this reference when `spec` needs a design proposal before or alongside the detailed design. A design proposal is a decision artifact. It aligns readers on facts, tradeoffs, compatibility, and direction before the implementation contract is written.

## Boundary

A design proposal answers:

- What should we build?
- Why this approach?
- Which alternatives did we reject?
- What compatibility, migration, operational, or security costs do we accept?
- What still needs a decision before detailed design or planning?

It is not a task plan and not a field-level implementation contract. If the user needs exact tables, endpoints, state transitions, or rollout checklists, also write the detailed design spec using `DESIGN_SPEC_TEMPLATE.md`.

## When To Produce A Proposal

Produce a proposal when any of these are true:

- More than one credible technical approach exists.
- The change affects public APIs, data schemas, state machines, plugin contracts, install behavior, security boundaries, or operational behavior.
- The decision is hard to reverse.
- Compatibility, migration, rollout, or rollback is a first-order concern.
- The user asks for a design proposal, design doc, technical proposal, 设计提案, 方案取舍, or Go proposal style.
- The detailed implementation would be premature until reviewers agree on the direction.

For straightforward, low-risk work with settled direction, skip the proposal and write only the detailed design.

## Input Handling

Use the PRD, clarified requirements, existing docs, and repo evidence as source material. If the input is thin, ask only for the missing decisions that materially change the proposal. Do not invent product requirements.

Before writing, identify the real forks in the road:

- Where should the logic live?
- Is the change additive or breaking?
- What compatibility promise must hold?
- What data or state must not be rewritten?
- Which users, callers, or operators are affected?
- What is the simplest baseline approach, and why is it insufficient?

Each meaningful fork should become either a chosen decision, a rejected alternative, or an open question.

## Output Template

```markdown
# <一句话结论式标题>

Author(s): <author or team>
Last updated: <YYYY-MM-DD>
Status: Draft | Under review | Accepted | Rejected
Discussion: <link or 不涉及>
Source requirements: <PRD / clarify output / issue / notes>
Support lenses: <none | api-designer, architecture-designer, sql-style, cli-developer, go-style, kratos>

## Abstract / 摘要

State the whole proposal in one short section: what changes, roughly how, and the most important promise or constraint.

## Background / 背景与动机

Explain the real pain with concrete evidence. Use examples from the codebase, user workflow, operations, incidents, or current implementation. Avoid vague claims such as "the current system is inefficient" unless you can name the inefficiency.

## Goals And Non-Goals / 目标与非目标

List what this proposal must achieve and what it intentionally does not solve.

## Proposal / 设计方案

Describe the chosen approach from simple to complex.

For each important API, state, data, or workflow decision:

- State the rule or shape.
- Give a concrete example.
- Name the boundary where the rule stops applying.
- Distinguish new behavior from unchanged behavior.

## Support Lens Checks / 专项设计检查

List each support lens triggered by the proposal and summarize what it changed or confirmed in the design.

| Support lens | Trigger | Design checks applied | Result |
|---|---|---|---|
| <api-designer/sql-style/etc. or none> | <why it applies> | <specific checks> | <decision, risk, or not applicable> |

## Boundary Scenarios / 边界场景

List scenarios that prove the proposal has real boundaries, not just a happy path.

Cover relevant categories:

- invalid, missing, duplicated, stale, or conflicting input
- permission denied, ownership mismatch, tenant/org boundary, or unauthorized caller
- repeated operation, retry, idempotency, concurrency, or out-of-order events
- partial failure, timeout, downstream dependency failure, or compensation path
- legacy data, migration overlap, backward compatibility, rollback, or downgrade
- limits, quotas, pagination boundaries, empty states, max/min values, and overflow
- unchanged behavior that must not regress

For each scenario, state whether the design handles it now, rejects it, defers it, or treats it as unchanged. If a category does not apply, write `不涉及` or `not applicable` with a short reason.

## Rationale / 理由与取舍

Explain why this approach is the best fit for the stated constraints. Include rejected alternatives.

| Alternative | Why Not |
|---|---|
| <option> | <specific reason> |

Do not only argue for the chosen design. A useful rationale prevents future readers from reopening the same discarded options without new evidence.

## Compatibility / 兼容性

State directly whether the proposal is breaking.

Cover:

- Existing callers or users.
- Existing data and serialized formats.
- Public APIs, CLI flags, config keys, schemas, events, plugin contracts, or generated artifacts.
- Migration path, feature flags, opt-in/opt-out, fallback, rollback, and deprecation behavior.

If the proposal is purely additive, say so and identify the unchanged surfaces.

## Operational And Security Impact / 运行与安全影响

Cover deployment, observability, failure modes, recovery, access control, data exposure, and support burden when relevant.

## Implementation And Transition / 实现与过渡

Describe the high-level landing path without turning it into a task plan. Include sequencing only when it affects compatibility or risk.

## Open Questions / 待决问题

List questions that block acceptance, detailed design, or planning. If no questions remain, write `无`.

## Detailed Design Handoff / 详细设计交接

State whether a detailed design spec should be written now. If yes, list the decisions that the detailed design must treat as fixed constraints.

## Appendix / 附录

Put extended examples, evidence, FAQs, or comparison notes here.
```

## Writing Rules

- Use headings that carry claims, not vague labels, when the claim is clear.
- Put conclusions before explanation.
- Use "we" for decisions when writing in English, and "我们" for decisions when writing in Chinese.
- Use concrete examples instead of abstract benefits.
- Be honest about costs. A proposal that hides migration or compatibility costs is not reviewable.
- Keep exact domain names, statuses, commands, field names, and invariants.
- Mark assumptions and unresolved questions explicitly.
- Avoid passive, ownerless wording such as "it is suggested" or "应当被处理".

## Quality Check

Before considering the proposal complete, verify:

- The abstract names the chosen direction and the main promise.
- Background includes a concrete pain point or evidence.
- Proposal explains the smallest useful version before complex cases.
- Boundary scenarios cover the important reject, retry, failure, compatibility, and unchanged-behavior cases.
- Rationale lists at least one rejected alternative unless the decision is truly mechanical.
- Compatibility states whether the change is breaking.
- Open questions are either resolved or clearly marked as blockers/non-blockers.
- Detailed Design Handoff says whether to write the detailed design now.
