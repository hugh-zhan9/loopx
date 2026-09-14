# Write current-state documentation

Organize the document around the requested system, module or interface. Follow an
existing useful structure when updating it; a new document needs no fixed chapter
count or numbering. Do not copy this reference as a form with empty sections.

For a small module, a useful document often contains:

```markdown
# <Module or interface>

<What it does and the callers it serves. State the inspected version and scope.>

## Current behavior
<Inputs, observable outputs, important rules, errors and boundaries.>

## Relevant implementation
<Owners, entry points and dependencies that explain the behavior, with source links.>

## Verification and gaps
<Checks actually run, what they establish, and unresolved source conflicts or unknowns.>
```

Adapt or omit those headings. Keep evidence beside the claim when practical rather
than maintaining a second full explanation in an appendix. Distinguish observation,
inference and unknowns in ordinary prose; confidence scores are not required.

Expand only the areas needed to explain the requested subject:

- Public CLI/API/library contracts: exact commands or routes, fields, defaults,
  validation, permissions and failure behavior.
- Stateful behavior: persisted data, transitions, concurrency, idempotency,
  recovery and compatibility rules actually implemented.
- Configuration and operations: relevant defaults, dependencies, install/deploy
  behavior and the effects of failures.
- Architecture: actual owners, dependencies and canonical/generated sources.

A whole-repository request needs an overview of its major surfaces and their
relationships; state any sampled or inaccessible areas. A reconstruction or
migration brief also needs the behavior a replacement must preserve, when requested.
None of these topics requires a separate chapter if it fits clearly in the main text.

Identify the inspected commit and relevant uncommitted state, when available,
and the evidence date and scope. Link significant claims to files, symbols, tests
or configuration. A test file proves neither that it passed nor that production
matches it. State actual checks, important unknowns and contradictions without
silently rewriting approved requirements to match current code. Redact secrets.
