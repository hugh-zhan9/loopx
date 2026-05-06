---
name: ralplan
description: Compatibility alias for the default consensus-first loopx plan skill
---

# Ralplan

`ralplan` is a compatibility alias for `$plan`.

loopx `plan` is consensus-first by default, so `ralplan` must not define or maintain a separate planning workflow.

## Canonical Invocation

Use:

```text
$plan <arguments>
$plan --interactive <arguments>
$plan --deliberate <arguments>
```

Legacy invocations remain accepted as user intent:

```text
$ralplan <arguments>
$ralplan --interactive <arguments>
$ralplan --deliberate <arguments>
```

## Delegation Rule

When invoked, immediately follow `skills/plan/SKILL.md` as the canonical contract.

Do not duplicate or reinterpret:

- pre-context intake
- RALPLAN-DR summary
- Planner -> Architect -> Critic sequencing
- closed re-review loop
- deliberate mode
- interactive approval boundaries
- execution bridge
- runtime state machine

## Must Not

- Do not pass a consensus flag to `plan`; consensus is already the default plan behavior.
- Do not maintain a separate ralplan artifact schema.
- Do not launch execution directly from this alias.
