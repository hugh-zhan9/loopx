---
name: refactor-plan
description: "Audit code health from git hot spots or write a behavior-preserving refactor RFC (重构检查、重构计划)."
disable-model-invocation: true
metadata:
  version: "0.7.0"
  when_to_use: "refactor-plan, refactoring audit, technical debt, deepening opportunities, behavior-preserving cleanup, 重构检查, 重构计划"
---

# Refactor Plan

Find high-leverage maintainability problems or write a behavior-preserving
refactor RFC. An audit request ends with supported findings; a planning request
produces an RFC. Behavior changes belong in `/clarify` or `/spec`.

## Audit mode (when the target is not yet known)

1. **Scope by hot spots (YAGNI).** Inspect recent `git log --oneline` churn
   (unless the user named a specific module) so refactoring pays back where
   code actually changes.
2. **Look for deepening opportunities.** Read [code-audit.md](references/code-audit.md)
   and run `scripts/audit_codebase.py` only when automated signals help rank
   candidates. Prioritize:
   - **Shallow modules** whose interface is nearly as complex as the body (apply
     the **deletion test**: would deleting it concentrate complexity or remove a
     pass-through?);
   - **Duplicated policy / split locality** where one logical change forces
     edits across many files;
   - **Untestable seams** where behavior can only be verified by mocking internals.
3. Deliver concrete findings ranked by leverage and stop (no RFC or code edits).

## Plan mode (behavior-preserving RFC)

1. **Establish the behavior baseline.** Read target modules, callers, tests,
   and `GLOSSARY.md`/ADRs. List observable behavior that must remain unchanged
   and add characterization tests wherever coverage cannot establish preservation.
   Stop if no practical baseline exists or unapproved external behavior changes
   are required.
2. **Choose the narrowest safe sequence.** Compare credible options and map
   each step to concrete surfaces, preservation checks, verification commands,
   and rollback notes. Consult [fowler-refactorings.md](references/fowler-refactorings.md)
   only when specific mechanics need naming.
3. **Write the RFC.** Use [REFACTOR_PLAN_TEMPLATE.md](REFACTOR_PLAN_TEMPLATE.md)
   at `docs/loopx/refactors/YYYY-MM-DD-<topic>.md` (unless another path is given).

An approved RFC can guide authorized implementation directly without conversion
to `plan2exec`. Use `/plan2exec` only when multi-owner or durable recovery
coordination is needed. Review-only requests end with findings.
