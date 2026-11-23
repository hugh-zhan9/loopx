---
name: ask-loopx
description: "Help choose the right loopx skill for your current task (技能向导)."
disable-model-invocation: true
metadata:
  version: "0.1.0"
  when_to_use: "ask-loopx, which skill, loopx guide, 选哪个技能, 技能向导"
---

# Ask loopx

Recommend the smallest set of loopx skills for the user's request, or stay
prompt-first under the working agreement when no skill is needed. Do not execute
the user's task or invoke user-invoked skills on their behalf.

## Skill Map

### Model-invoked (agent reaches automatically, or invoke explicitly)

| Need | Skill |
|---|---|
| Bug diagnosis, failing test, regression, or read-only root-cause analysis | `debug` |
| Failing-test-first vertical slices at public seams | `tdd` |
| Go or Go-Kratos engineering redlines (precision, subpackages, proto, DB locks) | `go-kratos` |

### User-invoked (zero always-on context cost; invoke explicitly)

| Need | Skill |
|---|---|
| Independent two-axis diff review (Standards vs Spec) + static guardrails | `/code-review` |
| Broad requirement needs bounded task briefs and handoffs | `/task-split` |
| Unresolved requirements, scope, acceptance, or permissions | `/clarify` |
| Technical design, test seams, module boundaries, or design review (`D-*`) | `/spec` |
| Persistent vertical-slice plan for approval, recovery, or coordination | `/plan2exec` |
| Execute a ready `loopx-plan/v1` plan via isolated leaf subagents | `/exec` |
| Code health audit from git hot spots or behavior-preserving refactor RFC | `/refactor-plan` |
| Release runbook preparation, review, or authorized rollout/resumption | `/release-readiness` |
| Existing HTTP API scenario docs backed by real tested HTTP calls | `/generate-api-docs` |
| Improve document readability and remove AI-like wording | `/humanize-doc` |
| Reverse-engineer current codebase behavior from source evidence | `/codebase-spec` |

## Response rule

Reply in 3–6 lines: name the single best starting skill (or "no skill needed —
proceed directly under the working agreement"), why it fits, and the next
command to type.
