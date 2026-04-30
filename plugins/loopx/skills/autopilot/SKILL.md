---
name: autopilot
description: Richer internal-phase LoopX autonomous orchestration over the public clarify/plan/build/review flow.
argument-hint: "<workflow slug>"
---

# LoopX Autopilot

<Purpose>
`autopilot` is LoopX's autonomous orchestration surface. It upgrades the current bounded composition model by adding richer internal phases while keeping LoopX's public stage model authoritative.

Externally, the user still reasons about:

- `clarify`
- `plan`
- `build`
- `review`

Internally, `autopilot` may orchestrate richer phases such as expansion, planning, execution, QA, and validation.
</Purpose>

<Use_When>
- One owner wants LoopX to run end-to-end with internal autonomous orchestration.
- A clarified or workflow-local spec already exists, or the workflow is ready to begin from LoopX stages.
- The task benefits from richer internal planning/execution/QA/validation behavior without exposing a more complex public stage surface.
</Use_When>

<Do_Not_Use_When>
- The user wants manual control over each stage gate.
- The task should stop after planning or execution rather than run end-to-end.
- Requirements are too ambiguous for bounded autonomous orchestration.
</Do_Not_Use_When>

<Core_Principles>
- LoopX public stage truth remains authoritative.
- Richer internal phases are allowed, but they stay internal.
- Internal stage approvals may be auto-consumed and must be recorded as control events.
- Canonical LoopX artifacts remain the source of truth; `run.json` is an orchestration ledger.
- Reuse strengthened LoopX stage runtimes rather than re-implementing contradictory truths.
</Core_Principles>

<Internal_Phases>
Suggested internal phase model:

- `expansion`
- `planning`
- `execution`
- `qa`
- `validation`

Phase-to-stage alignment:

- `expansion` -> clarified-spec reuse or clarify preparation
- `planning` -> LoopX `plan`
- `execution` + `qa` -> LoopX `build`
- `validation` -> pre-review validation plus LoopX `review`
</Internal_Phases>

<Control_Plane>
- one autopilot invocation authorizes one bounded autopilot run
- autopilot may internally consume stage approvals for:
  - `clarify -> plan`
  - `plan -> build`
  - `build -> review`
  - `review -> done`
- these decisions must be recorded as internal control events
</Control_Plane>

<Artifact_Contract>
Canonical stage artifacts remain authoritative:

- clarify spec artifacts
- `.LoopX/plans/prd-<slug>.md`
- `.LoopX/plans/test-spec-<slug>.md`
- canonical build `execution-record.md`
- canonical review `review-report.md`

Autopilot also writes an orchestration ledger:

- `.LoopX/autopilot/<slug>/run.json`

`run.json` may include internal phase progression, blockers, and control events, but it must not replace canonical stage artifacts as the source of truth.
</Artifact_Contract>

<Must_Not_Decide_Automatically>
- do not create a new public stage family
- do not bypass LoopX canonical artifacts
- do not fork a second workflow truth that contradicts LoopX stages
- do not literally port the parent autopilot where it conflicts with LoopX runtime contracts
</Must_Not_Decide_Automatically>
