---
name: plan
description: "Creates a consensus-first loopx plan package with Planner, Architect, and Critic review from an approved spec. Not for unresolved requirements or direct implementation."
when_to_use: "plan, planning, consensus planning, PRD, architecture plan, test plan, approved clarify spec, 规划, 方案, 架构评审"
metadata:
  version: "0.1.10"
argument-hint: "[--interactive] [--deliberate] [--direct <spec-path>] <clarified task or spec path>"
---

# loopx Plan

<Purpose>
`plan` is loopx's canonical planning gate. It turns an approved clarify result or execution-ready spec into a reviewed plan package before build or autopilot starts.

By default, `plan` includes the full consensus review loop formerly documented under `ralplan`: Planner -> Architect -> Critic. Planner creates the plan, Architect reviews it, Critic gates it, and the plan iterates until approved or the iteration cap is reached.
</Purpose>

<Use_When>
- A clarify spec exists and needs a concrete execution package.
- The user asks for `plan`, `ralplan`, consensus planning, PRD, test spec, implementation plan, or architecture review.
- The request is clear enough to plan, but execution should not start before architecture and verification shape are reviewed.
- The downstream path may be `build`, `autopilot`, or another execution lane, but still needs a stable plan artifact first.
</Use_When>

<Do_Not_Use_When>
- Requirements are still vague enough that intent, non-goals, or decision boundaries are unresolved. Use `clarify` first.
- The user explicitly asks to implement a concrete small change immediately and no planning gate is needed.
- A current approved plan package already exists and the next action is execution.
</Do_Not_Use_When>

<Core_Principles>
- Default planning is consensus-first, not lightweight-by-default.
- Treat the clarify spec as source of truth; do not re-interview unless the spec is incomplete or contradictory.
- Keep planning artifact-bound: produce PRD, architecture, development plan, and test plan outputs.
- Preserve accepted intent as durable change artifacts: proposal, spec delta, design, tasks, and artifact dependency graph.
- Separate planning approval from execution approval.
- Treat human review as a first-class product surface: planning Markdown and HTML views must be readable enough for a reviewer to approve or reject without opening runtime state JSON.
- Do not start implementation from `plan`.
- Prefer a smaller executable plan over a broad plan that cannot be verified.
- Preserve non-goals, decision boundaries, and residual-risk warnings from clarify.
</Core_Principles>

<Inputs>
Accepted inputs:

- an approved loopx clarify workflow slug
- `.loopx/intake/clarify-*.md`
- `.omx/specs/deep-interview-*.md`
- a direct task description when enough context is already present
- `--direct <spec-path>` to force a specific requirements artifact

If no requirements artifact is provided, derive a task slug and run pre-context intake before planning.
</Inputs>

<Flags>
- `--interactive`: ask the user at draft review and final approval boundaries.
- `--deliberate`: force high-rigor planning. Add pre-mortem and expanded test planning.
- `--direct <spec-path>`: use the given artifact as the planning source of truth.

`ralplan` is a compatibility alias for this default consensus behavior. It should not maintain a separate planning contract.
</Flags>

<Pre_Context_Intake>
Before planning:

1. Derive a task slug.
2. Reuse the latest relevant `.loopx/context/{slug}-*.md` snapshot when available.
3. If none exists, create `.loopx/context/{slug}-{timestamp}.md` with:
   - task statement
   - desired outcome
   - source requirements artifact
   - known facts / evidence
   - constraints
   - non-goals
   - decision boundaries
   - unknowns / open questions
   - likely codebase touchpoints
4. For brownfield tasks, inspect relevant repo files before finalizing the plan.
5. If ambiguity is still high, route back to `clarify` instead of inventing missing requirements.
6. If planning depends on unfamiliar SDKs, external APIs, or version-sensitive framework behavior, use official documentation or a researcher lane before final approval.
</Pre_Context_Intake>

<Consensus_Workflow>
## Step 1. Planner Draft

Planner creates the initial plan package and a compact RALPLAN-DR summary:

- Principles: 3-5 guiding constraints
- Decision Drivers: top 3 forces shaping the plan
- Viable Options: at least 2 options with bounded pros / cons
- Rejected Options: explicit invalidation when only one option remains viable
- Plan Package:
  - PRD / requirements translation
  - architecture approach
  - development plan
  - test plan
  - acceptance criteria
  - risk register

In `--deliberate` mode, also include:

- pre-mortem with 3 plausible failure scenarios
- expanded test plan covering unit, integration, e2e, and observability where applicable

## Step 2. Draft User Review (`--interactive` only)

If interactive mode is enabled, present the draft plus the DR summary and ask whether to:

- proceed to Architect review
- request changes
- reject / stop

Without `--interactive`, proceed automatically to Architect review.

## Step 3. Architect Review

Architect reviews the plan for soundness. This step must finish before Critic starts.

Architect must provide:

- strongest steelman objection to the plan
- at least one real tradeoff tension
- architecture risks and mitigations
- synthesis or recommended revision when the objection is valid
- deliberate-mode principle-violation checks when applicable

## Step 4. Critic Gate

Critic runs only after Architect review completes.

Critic evaluates:

- principle-option consistency
- fairness of alternatives
- clarity of risk mitigation
- testable acceptance criteria
- concrete verification steps
- execution-input completeness for each new or changed ingress / workflow entrypoint
- explicit non-goals and decision boundaries
- in deliberate mode: pre-mortem and expanded test plan quality

Critic verdicts:

- `APPROVE`
- `ITERATE`
- `REJECT`

## Step 5. Closed Re-Review Loop

If Critic returns `ITERATE` or `REJECT`, run a full closed loop:

1. collect Architect + Critic feedback
2. revise the plan with Planner
3. return to Architect review
4. return to Critic gate
5. repeat until `APPROVE` or 5 iterations

Do not patch only the Critic complaint in isolation if the Architect objection implies a deeper plan change.

## Step 6. Final Plan Package

On approval, write canonical planning artifacts:

- `.loopx/workflows/<slug>/plan.md`
- `.loopx/workflows/<slug>/architecture.md`
- `.loopx/workflows/<slug>/development-plan.md`
- `.loopx/workflows/<slug>/test-plan.md`
- `.loopx/workflows/<slug>/requirement-traceability.md`
- `.loopx/workflows/<slug>/plan-delegation-decision.md`
- `.loopx/plans/prd-<slug>.md`
- `.loopx/plans/test-spec-<slug>.md`
- `.loopx/changes/active/<change-id>/proposal.md`
- `.loopx/changes/active/<change-id>/spec-delta.md`
- `.loopx/changes/active/<change-id>/design.md`
- `.loopx/changes/active/<change-id>/tasks.md`
- `.loopx/changes/active/<change-id>/slices.json`
- `.loopx/changes/active/<change-id>/artifact-graph.json`

Also generate derived HTML reading views:

- `.loopx/workflows/<slug>/view/index.html`
- `.loopx/workflows/<slug>/view/plan.html`
- `.loopx/views/index.html`

The HTML files are derived reading views for human plan review. They are not canonical fact sources; Markdown and JSON remain authoritative.

The final plan must include:

- Chinese reviewer-facing Markdown for `plan.md`, `architecture.md`, `development-plan.md`, `test-plan.md`, canonical PRD/test spec, traceability, and delegation decision; English prose is allowed only for code paths, API names, commands, enum values, and source terms
- an HTML reading view that exposes stage status, human approval points, blockers, source coverage, and artifact summaries before the full Markdown bodies
- a source-requirement coverage matrix that maps the original requirements/PRD to plan, architecture, slices, spec delta, and tests
- a delegation decision with recommended mode `local|critic-only|parallel-review`, actual authorized mode, threshold, authorization source, score, triggers, and reason for whether subagent-style review is warranted
- ADR: Decision, Drivers, Alternatives considered, Why chosen, Consequences, Follow-ups
- concrete implementation steps sized to the actual task
- target long-lived spec domains and an OpenSpec-style requirements delta for archive
- vertical slices sized as independently verifiable tracer bullets, not horizontal layer-only task groups
- execution inputs mapped to concrete sources before build starts
- available execution lanes and recommended lane
- test and verification commands
- residual risks and assumptions
- explicit build/autopilot handoff guidance

Reviewer-facing document contract:

- `architecture.md` is the architecture document. It answers system boundaries and design tradeoffs, not implementation scheduling. It must include `文档定位`, `架构目标与非目标`, `上下文与系统边界`, `组件与职责`, `数据与状态模型`, `接口与集成契约`, `关键流程`, `质量属性与风险`, and `架构决策记录`.
- `development-plan.md` is the development plan. It answers execution order, slices, dependencies, verification, manual gates, rollback, and done criteria, not architecture selection. It must include `文档定位`, `交付切片`, `实施顺序与依赖`, `需求到开发切片`, `文件级变更清单`, `验证计划`, `人工确认点`, `回滚/降级策略`, and `完成定义`.
- `.loopx/changes/active/<change-id>/design.md` is the detailed design. It answers field/function/component-level implementation details and must include `文档定位`, `需求到设计映射`, `数据结构与字段`, `接口、函数与组件契约`, `状态机与流程细节`, `错误处理与边界条件`, `测试设计`, and `实现注意事项`.
- If any of these documents only contains a short summary or layer names without source-requirement mapping and concrete contracts, plan handoff must stay blocked.

## Step 7. Execution Bridge

`plan` stops at an approved plan package.

In `--interactive` mode, ask for the next lane:

- approve for `build`
- approve for `autopilot`
- request plan changes
- stop

Without `--interactive`, report the approved plan and recommended next command, but do not launch execution.
</Consensus_Workflow>

<Final_Response_Contract>
Default build handoff after an approved plan package:

```text
Next:
$build .loopx/plans/prd-<slug>.md
```

Use the artifact-first PRD path because it pins build to the approved plan package. Do not emit `$build <slug>` as the primary handoff when `.loopx/plans/prd-<slug>.md` is known. If execution is not approved or plan gates remain blocked, state the blocker instead of emitting a build handoff.

Also report the generated HTML reading entrypoint so the user can review the plan without running another command:

```text
HTML:
.loopx/workflows/<slug>/view/index.html
```
</Final_Response_Contract>

<Runtime_State_Machine>
`plan` must keep the planning gate machine-checkable. Runtime state should track:

- `plan_current_iteration`: starts at `1`
- `plan_max_iterations`: default `5`
- `plan_consensus_mode`: `true` by default
- `plan_deliberate_mode`: `true|false`
- `plan_principles_resolved`: `true` after principles are explicit
- `plan_options_reviewed`: `true` after alternatives are fairly compared
- `plan_architect_review_status`: `not-started|complete|changes-requested`
- `plan_critic_verdict`: `none|approve|iterate|reject`
- `plan_package_status`: `missing|partial|complete`
- `change_artifacts_status`: `missing|partial|complete|archived`
- `spec_delta_status`: `missing|partial|complete`
- `slice_artifacts_status`: `missing|partial|complete`
- `plan_acceptance_criteria_testable`: `true|false`
- `plan_verification_steps_resolved`: `true|false`
- `plan_execution_inputs_resolved`: `true|false`
- `source_requirements_status`: `complete|partial`
- `requirement_traceability_path`: `.loopx/workflows/<slug>/requirement-traceability.md`
- `plan_delegation_mode`: recommended `local|critic-only|parallel-review`
- `plan_delegation_recommended_mode`: `local|critic-only|parallel-review`
- `plan_delegation_actual_mode`: authorized actual `local|critic-only|parallel-review`
- `plan_delegation_authorization_status`: `disabled|below-threshold|manual-required|auto-authorized`
- `plan_delegation_decision_path`: `.loopx/workflows/<slug>/plan-delegation-decision.md`
- `requested_transition`: remains explicit before build/autopilot

The plan gate is blocked until:

- plan package artifacts exist
- Planner, Architect, and Critic evidence artifacts exist
- reviewer-facing planning docs and derived canonical PRD/test spec are Chinese-readable
- change proposal, spec delta, design, tasks, vertical slices, and artifact graph exist
- spec delta declares target domains and `## ADDED|MODIFIED|REMOVED|RENAMED Requirements` blocks
- every ADDED or MODIFIED requirement uses `### Requirement:`, contains SHALL or MUST text, and includes at least one `#### Scenario:`
- vertical slices contain at least one `AFK` or `HITL` end-to-end slice with acceptance criteria and verification signal
- Architect review is complete
- Critic verdict is `approve`
- acceptance criteria are testable
- verification steps are concrete
- execution inputs are fully mapped to concrete sources
- source requirements are covered by `requirement-traceability.md`; uncovered original PRD requirements block build handoff
- delegation decision is recorded in `plan-delegation-decision.md`; absence of an explicit recommended/actual local/critic/parallel-review rationale and authorization source blocks build handoff
- user approval exists for any execution transition
</Runtime_State_Machine>

<Must_Not_Decide_Automatically>
- Do not skip Architect review.
- Do not run Architect and Critic in parallel; Critic depends on Architect.
- Do not launch build/autopilot without explicit approval.
- Do not treat recommended subagent review as actual execution authorization. Actual subagent startup must be authorized by `.loopx/config.json` `agent_delegation.enabled=true`, `auto_start=true`, and a matching threshold.
- Do not widen scope beyond clarify non-goals because a broader redesign seems cleaner.
- Do not erase residual-risk warnings inherited from clarify.
- Do not treat a plan as approved when Critic returns `ITERATE` or `REJECT`.
</Must_Not_Decide_Automatically>

<Output_Contract>
Primary outputs:

- approved plan package under `.loopx/workflows/<slug>/`
- original source requirements and traceability matrix under `.loopx/workflows/<slug>/requirement-traceability.md`
- delegation decision under `.loopx/workflows/<slug>/plan-delegation-decision.md`
- canonical PRD and test spec under `.loopx/plans/`
- change artifacts under `.loopx/changes/active/<change-id>/`
- derived HTML reading views under `.loopx/workflows/<slug>/view/` and `.loopx/views/`
- consensus review summary with Planner / Architect / Critic evidence
- next-step recommendation

Status output must clearly state:

- current iteration
- Architect review status
- Critic verdict
- missing plan gates, if any
- whether execution is approved
</Output_Contract>
