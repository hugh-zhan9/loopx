# loopx Skill Resolver

Governance index for loopx bundled skills. Keep this file in sync with every
bundled `skills/<name>/SKILL.md`. It is not installed host guidance or runtime
routing authority; installs route from the managed working-agreement block and
installed skill frontmatter.

loopx is docs-first and uses a dual-channel invocation split:

- **Model-invoked (3 skills):** kept in host context for autonomous discovery
  or Skill-tool calls (`debug`, `tdd`, `go-kratos`).
- **User-invoked (12 skills):** marked `disable-model-invocation: true` (Claude
  Code) and `policy.allow_implicit_invocation: false` (Codex) for zero
  always-on context load. Use `/ask-loopx` when choosing among them.

## Canonical Workflow Intents (User-invoked)

| Trigger | Skill |
|---|---|
| Broad requirements need bounded assignments and handoffs | `skills/task-split/SKILL.md` |
| Unresolved intent, scope, acceptance, permissions, or domain meaning | `skills/clarify/SKILL.md` |
| Technical design, test seams, deep-module boundaries, `D-*` decisions, or design review | `skills/spec/SKILL.md` |
| Explicit planning, approval boundary, recovery, or vertical-slice plan (`loopx-plan/v1`) | `skills/plan2exec/SKILL.md` |

## Optional Plan Execution & Specialized Workflows (User-invoked)

| Trigger | Skill |
|---|---|
| Execute one ready `loopx-plan/v1` plan via isolated leaf subagents | `skills/exec/SKILL.md` |
| Current-state reverse specification of an existing codebase from source evidence | `skills/codebase-spec/SKILL.md` |
| Hot-spot deepening audit or behavior-preserving refactor RFC | `skills/refactor-plan/SKILL.md` |
| Release runbook preparation, review, or authorized rollout/resumption | `skills/release-readiness/SKILL.md` |
| Existing HTTP API scenario documentation backed by real tested HTTP calls | `skills/generate-api-docs/SKILL.md` |
| Document readability assessment and de-AI prose rewriting | `skills/humanize-doc/SKILL.md` |
| Independent two-axis diff review (Standards vs Spec) + deterministic guardrails | `skills/code-review/SKILL.md` |
| Human-facing router to pick the right loopx skill | `skills/ask-loopx/SKILL.md` |

## Model-Invoked Engineering Disciplines

| Trigger | Skill |
|---|---|
| Tight-loop bug diagnosis, root-cause repair, regression verification, or read-only diagnosis | `skills/debug/SKILL.md` |
| Vertical-slice red-green test-driven development at public seams | `skills/tdd/SKILL.md` |
| High-signal Go and Go-Kratos engineering redlines | `skills/go-kratos/SKILL.md` |

## Deterministic Guard

Run before release or when changing bundled skills:

```bash
node scripts/verify-skills.mjs
```
