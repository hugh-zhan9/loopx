# Architecture Conformance Contract

Use this contract across brownfield design, planning, and implementation. The
goal is evidence-backed fit with the repository, not maximum abstraction or
reuse at any cost.

## Evidence Before A Decision

- Locate applicable architecture specs, ADRs, repository guidance, and owning
  modules.
- Inspect relevant extension points, analogous implementations, callers,
  dependencies, tests, and shared state before choosing where new behavior
  belongs.
- Cite concrete paths, symbols, or contracts in durable design and plan
  artifacts. During direct execution, report the exact evidence used.
- If no reusable capability or governing architecture is found, record what
  was searched; absence is a finding, not permission to invent silently.

## Required Judgments

### Reuse

Prefer an existing capability when its semantics, lifecycle, ownership, and
failure behavior match the requirement. Do not create a parallel helper,
service, store, workflow, or abstraction without naming the closest existing
candidate and why extension is unsafe or insufficient. Do not force reuse when
it would couple unrelated responsibilities or weaken a boundary.

### Isolation

State the owning module, public interface, allowed dependency direction, data
or shared-state owner, and failure blast radius. Account for concurrency,
partial failure, deployment, and permission boundaries when relevant. Work
that shares a mutable resource, generated output, migration, or hidden
interface is not independent merely because file paths differ.

### Maintainability

Choose the smallest change surface that has a clear owner, test boundary,
diagnostic path, and extension or removal path. Record the accepted maintenance
cost and avoid speculative generalization. A smaller diff is not maintainable
when it duplicates policy, bypasses the owning module, or creates a second
source of truth.

## Layer Responsibilities

- **Design (`spec`)** records current architecture evidence, reuse candidates
  and decisions, ownership and isolation boundaries, and maintenance costs.
  Implementation-relevant conclusions receive `D-*` anchors.
- **Planning (`plan2exec`)** preserves those conclusions in global constraints
  and each affected slice's `architecture` meta line. It models shared state or
  interfaces as dependencies instead of claiming false parallelism.
- **Execution (`exec` or prompt-first work)** rechecks cited evidence against
  the current tree before editing, gives implementers the applicable
  constraints, and reviews the integrated diff for duplication, boundary
  violations, widened blast radius, and unsupported maintenance burden.

## Stop Or Escalate

Return to `spec` rather than guessing when repository evidence and the approved
design conflict, a new architecture decision is required, an existing owning
module cannot be identified, a parallel capability lacks an evidence-backed
rationale, or safe dependency and state boundaries cannot be stated. Local
implementation choices that preserve established architecture stay with the
implementer.
