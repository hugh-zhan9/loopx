# Fowler Refactoring Reference

Use this only while preparing a behavior-preserving refactor plan. It is a reference for classifying smells and choosing tiny steps; it is not permission to change code during planning.

## Safety Rules

- Preserve externally observable behavior.
- Separate refactoring from feature changes.
- Prefer characterization tests before touching under-tested behavior.
- Keep each planned commit small enough that the codebase should compile and tests should pass after it.
- Use automated rename/extract/move tooling when the repository language and tooling support it.
- If a planned step can change semantics, call it out as a risk or move it out of the refactor.

## Smell Catalog

| Smell | Signal | Common Refactorings |
|---|---|---|
| Long Method | One function mixes several abstraction levels, has deep nesting, or is hard to name as one action. | Extract Method, Replace Temp with Query, Decompose Conditional. |
| Large Class / God Object | One class or module owns unrelated responsibilities. | Extract Class, Move Method, Move Field. |
| Primitive Obsession | Strings/ints represent domain concepts such as email, money, status, or quantity. | Replace Data Value with Object, Replace Type Code with Class. |
| Long Parameter List | Repeated groups of parameters or flags control behavior. | Introduce Parameter Object, Preserve Whole Object, Split Method. |
| Data Clumps | The same field group travels together across APIs. | Extract Class, Introduce Parameter Object. |
| Duplicate Code | Same knowledge appears in multiple places. | Extract Method, Pull Up Method, Form Template Method, Strategy. |
| Switch Statements / Type Codes | Repeated conditionals select behavior by type or status. | Replace Conditional with Polymorphism, Replace Type Code with State/Strategy. |
| Shotgun Surgery | One concept change forces many small edits across unrelated files. | Move Method, Move Field, Inline Class, consolidate ownership. |
| Divergent Change | One module changes for unrelated reasons. | Extract Class, split module by reason to change. |
| Feature Envy | A method uses another object more than its own object. | Move Method, Extract Method then Move Method. |
| Message Chains | Callers navigate through several objects to reach behavior. | Hide Delegate, Extract Method. |
| Middle Man | A class only forwards calls and adds no policy. | Remove Middle Man, Inline Method. |
| Speculative Generality | Abstractions exist only for hypothetical future needs. | Inline Class, Collapse Hierarchy, Remove Parameter. |
| Comments As Deodorant | Comments explain confusing code instead of decisions. | Rename, Extract Method, Introduce Assertion, delete stale comments. |
| Dead Code | Unused functions, imports, branches, or commented-out code. | Delete it after verifying no callers. |

## Refactoring Techniques

### Composing Methods

- **Extract Method:** name a coherent fragment after its intent, pass read-only locals as parameters, return modified values explicitly.
- **Inline Method:** replace a method with its body when the body is clearer than the indirection.
- **Extract Variable:** name a complex expression so the condition or calculation reads as intent.
- **Inline Temp:** remove a one-use variable when it adds no clarity.
- **Replace Temp with Query:** move a repeated calculation behind a query method.
- **Split Temporary Variable:** use separate variables for separate meanings.
- **Remove Assignments to Parameters:** assign to a local instead.
- **Replace Method with Method Object:** turn a very local-heavy method into an object so steps can be extracted.
- **Substitute Algorithm:** replace an algorithm with a clearer equivalent, with behavior tests first.

### Moving Features

- **Move Method:** move behavior to the type that owns the data or policy.
- **Move Field:** move data to the type that uses and protects it.
- **Extract Class:** split a type that has two responsibilities.
- **Inline Class:** remove a type that no longer justifies its existence.
- **Hide Delegate:** provide a focused method instead of exposing navigation chains.
- **Remove Middle Man:** call the delegate directly when forwarding adds no value.

### Organizing Data

- **Encapsulate Field / Collection:** prevent callers from mutating internals directly.
- **Replace Data Value with Object:** give validation and behavior to a domain value.
- **Replace Array With Object:** replace positional heterogeneous values with named fields.
- **Replace Type Code With Class/Subclasses/State:** make status/type behavior explicit.
- **Change Bidirectional Association to Unidirectional:** remove unused back-pointers to reduce coupling.
- **Replace Magic Number With Symbolic Constant:** name domain constants.

### Simplifying Conditionals

- **Decompose Conditional:** extract condition, then branch, and else branch into named operations.
- **Consolidate Conditional Expression:** combine checks that lead to the same result.
- **Consolidate Duplicate Conditional Fragments:** move repeated branch code outside the conditional.
- **Replace Nested Conditional With Guard Clauses:** handle special cases early.
- **Replace Conditional With Polymorphism:** put variant behavior on the variant.
- **Introduce Null Object:** replace repeated null checks with default behavior when the domain supports it.
- **Introduce Assertion:** make assumptions explicit where violation is a programming error.

### Simplifying Calls

- **Rename Method:** name by observable intent.
- **Separate Query From Modifier:** avoid methods that both answer and mutate.
- **Parameterize Method:** collapse similar methods that differ only by a value.
- **Replace Parameter With Explicit Methods:** split flag-selected behavior.
- **Preserve Whole Object:** pass an object instead of several extracted fields when the callee naturally depends on that object.
- **Introduce Parameter Object:** group parameters that represent one concept.
- **Remove Setting Method:** make immutable values constructor-owned.
- **Replace Constructor With Factory Method:** when construction needs naming, validation, or variant selection.

### Generalization

- **Pull Up / Push Down Field or Method:** move behavior to the level that actually owns it.
- **Extract Superclass / Interface:** introduce only when shared behavior or caller dependency exists now.
- **Collapse Hierarchy:** remove hierarchy that no longer differentiates behavior.
- **Form Template Method:** share an algorithm skeleton while leaving variant steps explicit.
- **Replace Inheritance With Delegation:** prefer composition when subclassing exposes too much.

## Planning Patterns

### Extract Method Sequence

1. Add characterization tests or identify existing behavior tests.
2. Extract one coherent block.
3. Name it by intent.
4. Wire parameters and return values explicitly.
5. Run targeted tests.

### Extract Class Sequence

1. Identify one cohesive responsibility.
2. Create the new type with no behavior change.
3. Move fields one at a time.
4. Move methods one at a time.
5. Keep the old public API delegating until callers can be moved safely.
6. Remove delegation only when no caller needs it.

### Replace Conditional With Polymorphism Sequence

1. Identify the discriminator and variants.
2. Add tests for each variant.
3. Introduce variant objects or strategy functions.
4. Move one branch at a time.
5. Remove the conditional after all branches move.

### Delete Dead Code Sequence

1. Prove no runtime or reflective caller exists.
2. Remove the smallest dead unit.
3. Run compile/type/test checks.
4. Repeat.
