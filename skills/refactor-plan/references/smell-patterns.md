# Smell Investigation Patterns

Use this reference after the deterministic audit identifies a relevant area or the user requests a focused smell review. A pattern is a search heuristic, not a finding. Confirm behavior, ownership, scale, and intentional tradeoffs before reporting it.

## Architecture and Boundaries

- **Dependency-direction violation**: an inner/domain package imports transport, storage, framework, or generated implementation details. Confirm the repository's intended dependency direction and whether the import is an approved composition boundary.
- **Circular dependency**: package/module import cycles or two components that cannot change or deploy independently. Build an actual dependency graph; do not infer a cycle from mutual data references.
- **Distributed monolith**: services require coordinated deployment, synchronous chains, or a shared database. Verify deployment, data ownership, and runtime call paths before recommending decoupling.
- **Over-layering or pass-through**: multiple layers forward calls without adding policy, transformation, or ownership. Count the boundary crossings for a representative workflow and identify which layer can be removed safely.
- **Over-abstraction or speculative generality**: interfaces, factories, hooks, flags, or extension points with one implementation and no current variation. Check callers and change history before inlining.
- **Leaky abstraction**: a port exposes SQL, vendor query syntax, transport DTOs, implementation-specific errors, or storage configuration. Identify the consumer contract that should replace the leak.
- **Anemic domain model**: domain records are passive data while invariants and transitions are scattered across services. Treat this as a risk only when behavior is duplicated or invariants can be bypassed; data carriers and read models may be intentional.

## Coupling and Cohesion

- **God object / divergent change**: a module has multiple unrelated reasons to change. Lines and method counts are triage signals only; use Git history, callers, and responsibility groups.
- **Shotgun surgery**: one behavior change requires edits across unrelated modules. Use representative commits or a traced change path as evidence.
- **Common/content coupling**: hidden global mutable state or direct access to another package's internals. Show the shared state and the ownership violation.
- **Stamp coupling / data clump**: callers repeatedly pass a large structure or the same group of fields while using only a subset. Verify that a value object or narrower contract would preserve semantics.
- **Feature envy / inappropriate intimacy**: a function navigates or manipulates another component's state more than its own. Prefer moving behavior only when the target owns the invariant.
- **Message chain / middle man**: long object navigation or wrappers that only delegate. Confirm that the delegation is not an intentional authorization, transaction, or compatibility boundary.
- **Parallel or alternative interfaces**: equivalent roles have separate hierarchies or incompatible method names. Confirm interchangeable semantics before unifying them.

## Design and Code

- Repeated type-code switches, boolean behavior flags, primitive domain values, magic literals, long methods, long parameter lists, temporary fields, lazy classes, refused bequests, dead code, and commented-out code are candidates for inspection.
- Use the repository's domain types, naming, error behavior, and public contracts as the standard. Do not prescribe polymorphism, value objects, or a parameter object merely because a pattern exists.

## Testing

- **Missing behavior tests**: important business paths have no test through a stable public interface. Distinguish missing coverage from intentionally trivial wiring or generated code.
- **Implementation-coupled tests**: tests assert private state, exact helper calls, or incidental ordering rather than observable behavior. Preserve assertions that protect a real contract.
- **Environment-dependent tests**: tests use wall clock, filesystem, network, or a live database without controlled seams. Check whether the dependency is an intentional integration test and whether cleanup and determinism are explicit.

## Complexity and Performance

- **Nested or pairwise iteration**: nested loops may be O(n²) or worse. Establish the collections, bounds, duplicate behavior, and whether the path is hot before proposing an index, sort, sweep, or hash structure.
- **Repeated linear scan**: `find`, `includes`, `indexOf`, or equivalent inside a loop may be O(n*m). Verify equality semantics and whether a `Set`/`Map` preserves order and duplicate handling.
- **Sort in loop**: repeated sorting may be avoidable, but incremental sorted state or loop-dependent comparators can be intentional.
- **N+1 I/O**: database, RPC, HTTP, or filesystem calls inside a loop may multiply round trips. Preserve authorization, tenancy, pagination, missing-record behavior, ordering, retries, and error semantics when evaluating batching.
- **Repeated recomputation**: identical expensive work in a hot path may need indexing, memoization, or precomputation. Check invalidation, mutation, memory cost, and whether the input is actually stable.
- **Wrong data structure**: an array/list used for frequent membership, keyed lookup, queue operations, or priority selection may have the wrong asymptotic cost. Measure expected size and access pattern first.
- **UI render-path recomputation**: filter/map/sort/reduce chains in a render function may be costly for large collections. Check framework lifecycle and dependency correctness before adding memoization.

## Required Caveats

Do not flag a cold path, tiny bounded input, generated/vendor code, already-batched access, or a clear linear implementation merely because a more complex algorithm exists. Report estimated complexity as an inference, and separate mechanical evidence from architectural judgment.
