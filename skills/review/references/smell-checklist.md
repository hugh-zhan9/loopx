# Smell Checklist For Code Review

Use this checklist during code quality review when the change is broad, touches architecture, introduces new abstractions, or the user asks for smell/anti-pattern analysis. Do not list every possible smell in the final review. Report only evidence-backed issues that matter for the reviewed diff or affected code.

## Architecture Smells

| Smell | Evidence To Look For | Why It Matters |
|---|---|---|
| Big Ball of Mud | No clear module boundaries, unrelated code in one place, root-level sprawl. | Changes become hard to localize and reason about. |
| Violated Layer Boundaries | Domain/core imports infrastructure, UI calls persistence directly, adapters leak inward. | Business logic becomes coupled to frameworks and hard to test. |
| Missing Architecture | Handlers mix HTTP, validation, SQL, and business rules with no stable boundary. | The system cannot evolve without copy-paste and regressions. |
| Distributed Monolith | Services must deploy together, share databases, or rely on synchronous chains. | Operational independence is fictional. |
| Anemic Domain Model | Domain entities are only data bags while services hold all rules. | Rules scatter and invariants become unenforced. |
| CQRS/Event Sourcing Overuse | Separate read/write or event models for simple CRUD without scaling or audit need. | Complexity exceeds the problem. |
| Vertical Slice Contamination | Feature slices call each other directly or share broad services. | Slice independence erodes. |

## Coupling And Cohesion Smells

| Smell | Evidence To Look For | Common Fix Direction |
|---|---|---|
| Circular Dependencies | Import cycles or mutual module knowledge. | Extract shared interface/module, invert dependency. |
| Content Coupling | One module reaches into another's internals. | Use a public API, encapsulate state. |
| Common Coupling | Global mutable state, mutable singletons, ambient context. | Pass dependencies explicitly, isolate state. |
| Stamp Coupling | Large DTO passed when only one or two fields are used. | Pass focused values or a smaller interface. |
| God Object | One file/class owns unrelated responsibilities or grows far beyond peers. | Extract cohesive modules. |
| Shotgun Surgery | One logical change requires edits across unrelated files. | Move ownership closer to the concept. |
| Feature Envy | Function mostly interrogates another object/module. | Move behavior or introduce a domain operation. |
| Data Clumps | Same group of fields travels together repeatedly. | Extract value object or parameter object. |

## Code-Level Smells

| Smell | Evidence To Look For | Review Guidance |
|---|---|---|
| Long Method | Deep nesting, mixed abstraction levels, hard-to-name blocks. | Ask for extraction only when it improves behavior clarity. |
| Long Parameter List | Many params, repeated groups, boolean flags selecting behavior. | Prefer parameter object or split behavior. |
| Duplicate Code | Same business rule copied with slight variations. | Consolidate the knowledge, not just the syntax. |
| Primitive Obsession | Strings/ints for domain concepts like status, money, email, quantity. | Use stronger types or validated value objects when worth the weight. |
| Magic Numbers/Strings | Unnamed statuses, limits, field names, or protocol values. | Name constants when the value carries domain meaning. |
| Comments As Deodorant | Comments explain confusing code, stale TODOs, commented-out code. | Improve names/structure or move TODOs to tracked work. |
| Dead Code | Unused imports, branches, functions, or commented code. | Delete after verifying no dynamic caller. |
| Speculative Generality | Interfaces, factories, plugins, or options with one caller and no present need. | Remove or simplify unless an approved requirement needs it. |

## Testing Smells

| Smell | Evidence To Look For | Why It Matters |
|---|---|---|
| No Behavior Tests | Business logic, migrations, or public contracts changed without tests. | Regressions will be missed. |
| Test-Implementation Coupling | Tests assert private calls, internal ordering, or mocks instead of outcomes. | Refactors break tests without behavior changes. |
| Slow Or Flaky Tests | Real network, uncontrolled clock, real filesystem/db where not needed. | CI becomes unreliable and discourages testing. |
| Missing Regression Test | Bug fix has no test that fails before the fix. | The same bug can return unnoticed. |

## Complexity Smells

Treat complexity findings as important when input size is unbounded, user-facing latency matters, or the code sits in a hot path. Do not flag cold startup paths or tiny bounded lists as performance issues unless there is evidence.

| Smell | Evidence To Look For | Safer Direction |
|---|---|---|
| Nested Loops | Loop inside loop over growing collections. | Build a Map/Set index, group first, sort plus two-pointer, or justify small N. |
| N+1 Query/API Calls | Database/API/filesystem call inside loop. | Batch, eager-load, prefetch, or use DataLoader-style caching. |
| Repeated Linear Scan | `.find`, `.includes`, `indexOf`, `in_array`, or equivalent inside a loop. | Build Set/Map once, preserving equality semantics. |
| Sort In Loop | Sorting repeatedly inside iteration. | Sort once, maintain heap, or explain why intermediate order is observable. |
| Render-Path Recompute | Expensive filter/map/sort/reduce in UI render body. | Memoize, move to selector/loader/server, or virtualize. |
| Pairwise Comparison | Every item compared to every other item. | Sort, sweep-line, bucketing, spatial index, or union-find depending on domain. |
| Unnecessary Recompute | Same expensive pure computation repeated with same inputs. | Cache or memoize with explicit invalidation. |
| Wrong Data Structure | Array/list used for frequent membership, key lookup, queue, or priority queue behavior. | Use Set, Map, deque/queue, heap, or project equivalent. |

## Design Principle Checks

- **SRP:** Does this module have one reason to change?
- **OCP:** Are new variants added by editing a central conditional?
- **LSP:** Does a subtype weaken expectations of the base type?
- **ISP:** Do callers depend on methods they do not use?
- **DIP:** Do high-level policies depend on low-level details?
- **DRY:** Is the same business rule duplicated?
- **KISS/YAGNI:** Is the abstraction heavier than the current requirement?

## Reporting Rules

- Tie each smell to a file/line and the reviewed change.
- Explain the actual risk, not the textbook definition.
- Suggest the smallest behavior-preserving fix.
- Avoid broad rewrites unless the current change already crosses the architecture boundary.
- If the smell predates the diff and is not worsened by it, label it as pre-existing risk or omit it.
