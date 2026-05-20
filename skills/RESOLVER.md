# loopx Skill Resolver

Central routing map for loopx bundled skills. Keep this file in sync with every bundled `skills/<name>/SKILL.md` and `plugins/loopx/skills/<name>/SKILL.md`.

Read the selected skill file before acting. If multiple skills match, read every likely candidate and use the disambiguation rules below.

## Public Workflow Skills

| Trigger | Skill |
|---|---|
| Ambiguous request, unclear scope, non-goals, decision boundaries, requirements interview | `skills/clarify/SKILL.md` |
| Approved clarify spec, direct requirements artifact, PRD/test/architecture planning, consensus planning | `skills/plan/SKILL.md` |
| Approved plan execution, implementation persistence, review-requested implementation fixes | `skills/build/SKILL.md` |
| Independent acceptance, code review, architecture-smell review, go/no-go after build | `skills/review/SKILL.md` |
| Completed workflow needs long-lived spec sync and ADR candidate | `skills/archive/SKILL.md` |
| User wants one bounded end-to-end loopx run over clarify/plan/build/review | `skills/autopilot/SKILL.md` |

## Support Skills

| Trigger | Skill |
|---|---|
| Bug, test failure, build failure, regression, unexpected behavior, root-cause investigation | `skills/debug/SKILL.md` |
| Feature or bugfix implementation where behavior should be covered by a failing test first | `skills/tdd/SKILL.md` |
| Completion, fixed, passing, review-ready, commit, or handoff claims need fresh evidence | `skills/verify/SKILL.md` |
| Editing `.go` files or reviewing Go style inside build/review | `skills/go-style/SKILL.md` |
| Go-Kratos proto, service, biz, data, middleware, auth, config, or Kratos troubleshooting | `skills/kratos/SKILL.md` |

## Disambiguation

1. If intent, scope, non-goals, or decision boundaries are unresolved, use `clarify` before `plan`.
2. If requirements are approved but execution has not started, use `plan` before `build`.
3. If implementation is broken or tests fail during build, use `debug` as the diagnostic lens before patching.
4. If code is already implemented and needs acceptance, use `review`; do not run new build work from review.
5. If review requests implementation-only fixes, route to `build --from-review`; route to `plan` only when the plan itself is wrong.
6. If the user asks for autonomous execution, use `autopilot` only when requirements are bounded enough to run without new human decisions.
7. Treat `tdd`, `verify`, `go-style`, and `kratos` as support lenses unless the user explicitly invokes them directly.
8. `archive` is only valid after `review -> done`.

## Deterministic Guard

Run this before release or when changing bundled skills:

```bash
node scripts/verify-skills.mjs
```
