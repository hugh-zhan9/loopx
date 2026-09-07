---
name: plan-reviewer
description: "Reviews a persistent implementation plan and its authoritative execution graph against the approved source, including architecture conformance, coverage, dependencies, isolation claims, review focus, and verification. Not for creating plans, reviewing code, dispatching execution, or advancing workflow state."
when_to_use: "explicit plan review, execution graph audit, source-to-plan coverage, dependency and parallel-safety review, plan verification quality"
metadata:
  version: "0.6.2"
argument-hint: "<plan path and approved source>"
---

# Plan Reviewer

Use this support lens to review a persistent plan before execution handoff. It
does not edit the plan, dispatch implementation, or advance workflow state.

## Inputs

Read the plan, its named approved source and linked authoritative `概要设计.md`
(including overview-owned `D-*` anchors), relevant repository evidence, and
[the architecture conformance contract](../shared/architecture-conformance.md).
A current plan contains:

- YAML frontmatter with `schema: loopx-plan/v1` and the slice graph: stable `P-*`
  identifiers, explicit `depends` entries, and per-slice `status`;
- a narrative `Goal And Boundaries` section with outcomes and boundaries;
- one body section per slice with prose acceptance and a `writes` / `anchors` /
  `architecture` / `verify` meta block (plus a `review` line on high-risk slices);
- integration verification and handoff sections.

If the approved source is missing or materially ambiguous, stop and identify
the exact source needed. Do not infer product or architecture decisions during
plan review.

## Review

Check:

1. Every accepted outcome and applicable `AC-*`, `TC-*`, or `D-*` anchor appears in a slice, acceptance item, or explicit deferred rationale.
2. Boundaries preserve explicit non-goals and protected behavior.
3. Every slice section carries a prose outcome with observable acceptance and a meta block with `writes`, `anchors`, `architecture`, and `verify` (`review` for high-risk slices), and no two slices claim overlapping `writes` paths without a dependency between them.
4. Slice ids are unique; frontmatter slices and body sections match one-to-one; every slice declares `depends` explicitly; dependencies exist, are non-self-referential, and form an acyclic graph.
5. Each `architecture` line is supported by source or repository evidence and preserves the reuse or extension point, owning module, dependency direction, state and fault boundary, and maintenance check; any new architecture decision routes back to `spec`.
6. Producer-consumer interfaces and shared mutable or generated resources have the required dependency or exclusive-resource constraint; `writes` paths and architecture boundaries make any parallelism safe.
7. Acceptance is observable; verification is feasible; expected evidence can prove the result; the `review` line on a high-risk slice names contract and integration risks.
8. The plan avoids implementation transcripts, code snippets, task microsteps, fixed launch schedules, and per-slice commits.

Treat a missing or unknown schema, missing architecture evidence, unexplained
parallel capability, contradictory outcomes, invalid graph structure, graph/prose
mismatch, unproved parallel safety, write/resource conflict, missing evidence,
or a missing `review` line on a high-risk slice as blocking. Report narrower clarity or wording
improvements as non-blocking. `plan2exec` remains the owner of plan updates.

## Output

Report:

- reviewed plan and approved source;
- blocking findings with source evidence;
- non-blocking improvements;
- coverage of applicable anchors;
- architecture conformance assessment for reuse, isolation, and maintainability;
- graph validity and ready-frontier assessment;
- assessment: ready, ready after named fixes, or blocked.

The reviewer is a read-only leaf worker. Include:

> You are a leaf worker. Do not spawn, delegate to, or wait for other agents.
> Review only; do not modify the plan or repository.

## STOP Conditions

Stop when the plan or approved source is unreadable, source authority is
unclear, a material decision belongs in `clarify` or `spec`, the graph cannot be
validated, or the request is actually for implementation or code review.
