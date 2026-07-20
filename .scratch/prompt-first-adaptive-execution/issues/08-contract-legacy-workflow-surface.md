# 08 — Contract the legacy workflow surface

**What to build:** Complete the expand-contract migration by removing obsolete executor, scheduler, adapter, mandatory-review, and finish-gate implementations; retain only temporary explicit compatibility aliases; and make installation, package governance, and bilingual documentation describe the six canonical intents consistently.

**Blocked by:** 05 — Preserve dirty workspaces and resume safely; 06 — Select independent review proportionally; 07 — Distill completion knowledge and narrow finish.

**Status:** ready-for-agent

- [ ] Automatic discovery exposes clarify, spec, plan, exec, review, and finish as the canonical workflow intents.
- [ ] Former planning, execution, final-review, and review-fix names remain explicit-only forwarding aliases for one release.
- [ ] Obsolete host-specific lifecycle wrappers, strict plan scheduler state, mandatory reviewer orchestration, and generic extraction gates are removed.
- [ ] Normal and plugin installations contain the same canonical payload and short routing guidance.
- [ ] Skill versions, package governance, compatibility checks, and English and Chinese documentation agree.
- [ ] Issue-driven workflows and support lenses remain available without reintroducing the fixed Golden path.
- [ ] The complete deterministic repository test suite remains green after the contract step.
