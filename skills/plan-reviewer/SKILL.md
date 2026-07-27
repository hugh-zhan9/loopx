---
name: plan-reviewer
description: "Reviews a persistent implementation plan and its authoritative execution graph against the approved source, including coverage, dependencies, isolation claims, review focus, and verification. Not for creating plans, reviewing implemented code, dispatching execution, or advancing workflow state."
when_to_use: "explicit plan review, execution graph audit, source-to-plan coverage, dependency and parallel-safety review, plan verification quality"
metadata:
  version: "0.6.0"
argument-hint: "<plan path and approved source>"
---

# Plan Reviewer

Use this support lens to review a persistent plan before execution handoff. It
does not edit the plan, dispatch implementation, or advance workflow state.

## Inputs

Read the plan and its named approved source. A current plan contains:

- YAML frontmatter with the slice graph: stable `P-*` identifiers, explicit
  `depends` entries, and per-slice `status`;
- a narrative `Goal And Boundaries` section with outcomes and boundaries;
- one body section per slice with prose acceptance and a `writes` /
  `anchors` / `verify` meta block (plus a `review` line on high-risk slices);
- integration verification and handoff sections.

If the approved source is missing or materially ambiguous, stop and identify
the exact source needed. Do not infer product or architecture decisions during
plan review.

## Review

Check:

1. Every accepted outcome and applicable `AC-*`, `TC-*`, or `D-*` anchor appears in a slice, acceptance item, or explicit deferred rationale.
2. Boundaries preserve explicit non-goals and protected behavior.
3. Every slice section carries a prose outcome with observable acceptance and a meta block with `writes`, `anchors`, and `verify` (`review` for high-risk slices), and no two slices claim overlapping `writes` paths without a dependency between them.
4. Slice ids are unique; frontmatter slices and body sections match one-to-one; every slice declares `depends` explicitly; dependencies exist, are non-self-referential, and form an acyclic graph.
5. Producer-consumer interfaces and shared mutable or generated resources have the required dependency or exclusive-resource constraint.
6. `writes` paths are normalized and pairwise disjoint for slices that could run concurrently; the schema's execution rules make any parallelism safe.
7. Acceptance is observable; verification is feasible; expected evidence can prove the result; the `review` line on a high-risk slice names contract and integration risks.
8. The plan avoids implementation transcripts, code snippets, task microsteps, fixed launch schedules, and per-slice commits.

Treat missing or contradictory outcomes, invalid graph structure, graph/prose
mismatch, unproved parallel safety, write/resource conflict, missing evidence,
or a missing `review` line on a high-risk slice as blocking. Report narrower clarity or wording
improvements as non-blocking. `plan2exec` remains the owner of plan updates.

## Output

Report:

- reviewed plan and approved source;
- blocking findings with source evidence;
- non-blocking improvements;
- coverage of applicable anchors;
- graph validity and ready-frontier assessment;
- assessment: ready, ready after named fixes, or blocked.

The reviewer is a read-only leaf worker. Include:

> You are a leaf worker. Do not spawn, delegate to, or wait for other agents.
> Review only; do not modify the plan or repository.

## STOP Conditions

Stop when the plan or approved source is unreadable, source authority is
unclear, a material decision belongs in `clarify` or `spec`, the graph cannot be
validated, or the request is actually for implementation or code review.
