# Governance Rules

Use these rules to turn scanner signals into safe recommendations.

## What counts as a real reuse candidate

Prefer extraction only when all of the following are true:

1. The implementations represent the same business or technical responsibility.
2. Their invariants and failure behavior are the same.
3. They change for substantially the same reasons.
4. One team or module can own the resulting contract.
5. The new interface is narrower than the combined implementations.

The fact that two functions have similar control flow is evidence to investigate, not permission to merge them.

## Signal interpretation

| Signal | What it can mean | What to verify |
| --- | --- | --- |
| Repeated text window | Copy/paste or shared boilerplate | Same semantics, inputs, side effects, and change cadence |
| High Git touch count | Change hotspot or unstable ownership | Defects, cross-module changes, and whether the file is generated |
| Large file or method | Mixed responsibilities or simply a stable data-heavy file | Cohesion, test surface, and whether splitting improves locality |
| Many TODO/FIXME markers | Unfinished work or harmless historical notes | Whether the marker is actionable, owned, and still valid |
| Many callers of a helper | Useful capability or accidental coupling | Contract stability and whether callers actually need different behavior |
| `common`, `utils`, or `base` directory | Existing reuse or an abstraction junk drawer | Ownership, dependency direction, and semantic cohesion |

## Safe extraction sequence

Use the smallest sequence that establishes safety:

1. Capture current behavior with a public-interface or characterization test.
2. Name the responsibility in domain or technical terms already used by the repository.
3. Define the smallest useful contract and its owner.
4. Move or extract one implementation without changing behavior.
5. Migrate callers and delete the old path.
6. Add a guard so new callers use the owner rather than recreating the logic.

If step 1 is impossible because there is no usable test interface, report that as a risk and consider a narrow seam before doing a broad refactor.

## Reasons to leave code separate

Do not combine code when:

- the business terms differ even if the shapes match;
- one path is synchronous and the other asynchronous;
- authorization, transaction, retry, or idempotency rules differ;
- the only way to combine them is a large set of flags or callbacks;
- the callers need different release or ownership boundaries;
- the code is generated, vendored, or maintained by another system.

## Prioritization heuristic

Use this qualitative matrix rather than a fabricated precise score:

| Change frequency | Blast radius | Confidence | Default priority |
| --- | --- | --- | --- |
| High | High | High | Do soon |
| High | High | Low | Investigate and add tests first |
| High | Low | High | Opportunistic |
| Low | High | High | Schedule when touching the area |
| Low | Low | Any | Defer |

Increase priority for repeated rules that can silently diverge, especially permissions, money, state transitions, validation, and persistence behavior.

