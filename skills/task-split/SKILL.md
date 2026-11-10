---
name: task-split
description: "Split a broad requirement into bounded development tasks with focused context and handoffs (需求拆分). Use when one assignment is too large to reason about reliably, for serial or parallel work, or to refine a supplied task breakdown."
metadata:
  version: "0.1.0"
  when_to_use: "task-split, broad requirement decomposition, serial task handoff, refine an existing task breakdown, 需求拆分"
---

# Task Split

Define separate assignments that people or agents can complete and hand over.
Do not write their implementation plans, dispatch workers, or start development.

## Decide whether to split

Read the overall goal, scope, protected behavior, main business flows, relevant
repository owners and existing task breakdown. Apply [task scope](../shared/task-scope.md).
A broad requirement first needs enough shared understanding to divide responsibly,
not exhaustive clarification of every future task. Keep uncertain boundaries
provisional and name the questions that prevent confirming them.

Split when focused assignments can reduce the rules, decisions and unfinished
work one executor must hold at once, or create useful delivery boundaries. Serial
dependencies are valid. Do not split solely by files, technical layers, duration,
token budget or number of agents. Keep a small, clear request prompt-first and
explain briefly when no split is useful; create no task package in that case.

When the user supplies tasks, preserve the valid breakdown and fill material gaps.
Keep the accepted status of those boundaries; mark only newly proposed choices as
proposed, rather than relabeling the whole supplied breakdown as unapproved.
When work has started, split remaining work around actual accepted results and
identify its version; do not restart completed work. A review-only request yields
findings without changing the task map or its status.

## Form the assignments

For each task, specify its observable deliverable, source scope, inputs/outputs,
local decisions, shared contracts, required context and acceptance. Keep tightly
coupled work together when splitting merely causes repeated negotiation. Assign
cross-task contract decisions to their owner; a task brief cannot decide a new
architecture or business rule. Resolve only questions needed for the affected
boundary or current work; retain other questions with ownership and due points.

Record whether each dependency needs a contract, an implementation artifact or
integration evidence, and what is needed to start versus finish. Do not call two
tasks independent merely because paths differ. Keep a requirement-level owner for
coverage and integration; task-level passes alone never complete the requirement.

## Deliver documents

Read [task documents](references/task-documents.md) when a split is useful.
Reuse existing task/work-item documents where possible. Otherwise write one index
and a brief per task under `docs/loopx/tasks/<requirement-slug>/`. A task brief
references its authoritative source rather than copying the whole PRD or parent
plan. Shared constraints and delivery interfaces remain available to every consumer.

Each task may use clarify/spec as needed and plan2exec only when a persistent plan
is justified. Do not pre-generate a detailed plan for every task. The person/model
and host decide execution and sessions; this skill adds no CLI runtime, mandatory
pipeline or permission to mutate external trackers.

Check source coverage, shared constraints, feasible starts/finishes, ownership and
whether a fresh executor can locate enough evidence without the prior transcript.
Do not invent missing answers to make the split appear ready. Report the task
boundaries, dependency order, unresolved decisions and integration owner. Treat a
proposed breakdown as proposed until accepted or within already authorized routine
coordination; never describe discussion alone as approval.
