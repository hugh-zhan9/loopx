---
name: spec
description: "Turn settled requirements into a concise, evidence-backed technical design with test seams and stable D-* decisions (技术方案、设计评审)."
disable-model-invocation: true
metadata:
  version: "0.7.0"
  when_to_use: "spec, technical design, design review, seams, D-* decisions, 设计方案, 技术方案, 设计评审"
---

# Spec

Turn settled requirements into clear, evidenced design decisions. Do not write
an implementation plan, edit production code, or invent business requirements.
Local implementation choices need no spec.

For a small accepted choice, write one short record (rule, source, protected
behavior, examples) instead of expanding full templates. For an explicit
review-only request, read [design-review.md](references/design-review.md) and
report findings without editing the design.

## Process

1. **Ground in code and authority.** Read the approved requirement/intake
   (`requirements.md` owns `AC-*`/`TC-*`), relevant `docs/loopx/specs/`,
   `GLOSSARY.md`, ADRs, and owning modules. Apply
   [domain-language.md](../shared/domain-language.md) when terms conflict.
   Return missing business rules or conflicting requirements to `/clarify`.
2. **Design deep modules and reuse first.** Before adding a new helper, service,
   or store, inspect the closest existing owning module and extension point.
   Prefer **deep modules** (rich behavior behind a small interface with high
   locality) over shallow pass-through wrappers. Name the reused capability,
   owning module, dependency direction, and state/failure boundary.
3. **Choose test seams up front.** Identify the highest public **seam(s)**
   where behavior will be verified without testing internals. Prefer existing
   seams; aim for as few seams as possible.
4. **Apply high-signal contracts when triggered:**
   - HTTP/API responses or schemas → [caller-driven-api.md](references/caller-driven-api.md)
   - Concurrent persisted state → [database-concurrency.md](../shared/database-concurrency.md)
   - Module flows, state machines, or data projections → [design-diagrams.md](references/design-diagrams.md)
5. **Write or update design artifacts in place.** For new designs use
   `docs/loopx/design/YYYY-MM-DD-<kebab-slug>/`:
   - `概要设计.md` ([REVIEW_BRIEF_TEMPLATE.md](REVIEW_BRIEF_TEMPLATE.md)):
     overall solution, core flows, module boundaries, tradeoffs, and high-level
     `D-*` decisions (required for public contracts, data models, state machines,
     cross-system changes, or stakeholder review).
   - `需求设计文档.md` ([DESIGN_SPEC_TEMPLATE.md](DESIGN_SPEC_TEMPLATE.md)):
     exact interfaces, fields, failure/compatibility boundaries, `Design Contract
     Index`, `Verification Strategy` (preserving source `AC-*`/`TC-*`), and
     `Planning Handoff`.
   Use templates as adaptable scaffolds — omit inapplicable chapters instead of
   writing placeholder rows. Keep each `D-*` decision in one authoritative home
   and link from the other document; label pending technical choices as
   `proposed`. Do not create a separate `设计提案.md` or discussion log.
6. **Self-check before handoff.** Walk key source `TC-*` scenarios through the
   contract using [design-quality.md](references/design-quality.md) to catch
   contradictions, broken links, or missing failure paths.

## Boundaries

- Include only applicable boundaries (invalid input, auth, duplicates,
  concurrency, partial failure, migration overlap, rollback). Add fallback or
  degraded modes only when named by a requirement.
- Never silently drop or weaken a source `AC-*`/`TC-*`; deferrals need explicit
  source-owner authorization.
- Report the artifact path(s), decision/review status, and concrete unresolved
  choices. An accepted design can guide implementation directly or feed `/plan2exec`.
