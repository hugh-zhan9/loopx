---
schema_version: 1
workflow_id: <workflow id>
stage: plan
source_spec_path: spec.md
stage_owner: plan
---

# loopx Plan: <task name>

## Requirements Summary

- translate the approved loopx spec into an execution-ready package

## Deliverables

1. produce the loopx plan package
2. keep approvals explicit
3. define verification that can prove the run is ready for build

## Implementation Steps

1. update runtime and artifacts as needed
2. keep the loop bounded and deterministic
3. verify outputs before review

## Risks

- skipping approval or verification would break the loopx contract

## Verification

- run contract tests
- run CLI checks
