---
name: plan-reviewer
description: "Reviews a persistent implementation plan and its authoritative execution graph against the approved source, including coverage, dependencies, isolation claims, structural profile, review focus, and verification. Not for creating plans, reviewing implemented code, dispatching execution, or advancing workflow state."
when_to_use: "explicit plan review, execution graph audit, source-to-plan coverage, dependency and parallel-safety review, plan verification quality"
metadata:
  version: "0.4.0"
argument-hint: "<plan path and approved source>"
---

# Plan Reviewer

Use this support lens to review a persistent plan before execution handoff. It
does not edit the plan, dispatch implementation, or advance workflow state.

## Inputs

Read the plan and its named approved source. A current plan contains:

- outcomes and boundaries;
- exactly one authoritative `loopx.execution-graph.v1` block;
- dependencies, write scope, relevant paths, and exclusive resources;
- consumed and produced interfaces;
- acceptance, verification, expected evidence, and review focus;
- a selected structural profile.

If the approved source is missing or materially ambiguous, stop and identify
the exact source needed. Do not infer product or architecture decisions during
plan review.

## Review

Check:

1. Every accepted outcome and applicable `AC-*`, `TC-*`, or `D-*` anchor appears in a slice, acceptance item, or explicit deferred rationale.
2. Boundaries preserve explicit non-goals and protected behavior.
3. Human-readable slice prose and graph `tasks` agree one-to-one on ids, and the prose summary (outcome, dependencies, source anchors, acceptance, review focus) matches its graph entry; the graph alone carries field-level dispatch data, and prose slices that duplicate graph-only fields are a defect.
4. Slice ids are unique; dependencies exist, are non-self-referential, and form an acyclic graph.
5. Producer-consumer interfaces and shared mutable or generated resources have the required dependency or exclusive-resource constraint.
6. Write scopes are normalized and pairwise disjoint for unordered concurrent slices; relevant paths identify baseline inputs runtime must protect.
7. `parallel-strict-v1` is selected only when the graph proves a ready frontier of at least two and every concurrently ready pair has complete independence evidence.
8. `delegated-serial-v1` is selected for a width-one graph, coupling, conflicts, or uncertain independence. A persistent plan never selects inline execution.
9. Acceptance is observable; verification is feasible; expected evidence can prove the result; review focus names contract and integration risks.
10. The plan avoids implementation transcripts, code snippets, task microsteps, fixed launch schedules, and per-slice commits.

Treat missing or contradictory outcomes, invalid graph structure, graph/prose
mismatch, unproved parallel safety, write/resource conflict, missing evidence,
or missing review focus as blocking. Report narrower clarity or wording
improvements as non-blocking. `plan2exec` remains the owner of plan updates.

## Output

Report:

- reviewed plan and approved source;
- blocking findings with source evidence;
- non-blocking improvements;
- coverage of applicable anchors;
- graph validity and ready-frontier assessment;
- selected structural profile and whether its evidence is sufficient;
- assessment: ready, ready after named fixes, or blocked.

The reviewer is a read-only leaf worker. Include:

> You are a leaf worker. Do not spawn, delegate to, or wait for other agents.
> Review only; do not modify the plan or repository.

## STOP Conditions

Stop when the plan or approved source is unreadable, source authority is
unclear, a material decision belongs in `clarify` or `spec`, the graph cannot be
validated, or the request is actually for implementation or code review.
