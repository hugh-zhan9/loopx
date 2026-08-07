---
name: go-style
description: "Applies loopx Go engineering discipline and routes Go work to focused modernization, performance, or concurrency references. Use for .go edits, reviews, tests, package/API design, idiomatic cleanup, Go upgrades, benchmarks, pprof, races, locks, channels, and goroutine lifecycle. Not for non-Go code or Kratos-specific architecture by itself."
when_to_use: "go-style, Go, golang, .go files, Go review, idiomatic Go, modernize Go, go fix, benchmark, pprof, performance, race, deadlock, goroutine, mutex, channel, context"
metadata:
  version: "0.4.0"
---

# Go Style

## Purpose

`go-style` is the single public Go engineering facade. Apply its general rules
to handwritten Go changes, then load only the focused reference required by the
task. It adds domain discipline without creating workflow state or deciding how
the host executes the work.

## Route The Task

Choose one primary route from the user's intent and repository evidence:

| Primary intent | Load |
|---|---|
| Ordinary implementation, package/API design, review, errors, config, logging, tests, docs, or layout | No reference; use this file |
| Explicit idiom modernization, Go version upgrade, deprecated API cleanup, or `go fix` work | [references/modernization.md](references/modernization.md) |
| Latency, throughput, allocation, GC, CPU, compiler, cache, benchmark, `pprof`, trace, or PGO work | [references/performance.md](references/performance.md) |
| Race, deadlock, goroutine lifecycle, cancellation, lock, atomic, channel, `sync`, or concurrent design work | [references/concurrency.md](references/concurrency.md) |

For a genuinely mixed task, load a second reference only for the part that
crosses that boundary. Do not load all references by default, and do not route
ordinary Go work to a separate Go skill.

## Core Rules

- Read the target package, its callers, tests, and `go.mod` before editing.
- Preserve clear local conventions over generic house style unless the local
  pattern is demonstrably incorrect.
- Keep public APIs and observable behavior stable unless the task explicitly
  changes them.
- Do not use syntax or standard-library APIs newer than the module's declared
  `go` directive.
- Do not edit generated Go files as source. Find and change the generator input.
- Keep the happy path straight down with early returns for errors and guards.
- Avoid shadowing predeclared identifiers such as `len`, `error`, `string`,
  `copy`, `new`, and `make`.

## Package And API Design

- Keep packages cohesive and domain-focused. Follow the repository's layout;
  do not impose `pkg/`, `internal/`, or another house structure.
- Keep application entry points focused on wiring, lifecycle, and process-level
  policy. Put reusable logic in testable packages.
- Make dependencies explicit. Prefer the standard library when it is clear and
  sufficient; add a dependency only when its maintained abstraction earns the
  operational and transitive cost.
- Prefer validated, package-owned configuration over hidden globals. Use the
  repository's established constructor style rather than forcing `Config`,
  functional options, or dependency injection everywhere.
- Keep interfaces small and define them at the consumer boundary when practical.
  Constructors normally return concrete types unless callers need a stable
  abstraction or runtime-selected implementations.
- Do not add an abstraction around one implementation without a current caller
  or boundary that benefits from it.

## Errors, Context, And Logging

- Put `context.Context` first in functions that accept it. Propagate the caller's
  context instead of replacing it with `context.Background()` in library code.
- Wrap propagated errors with operation context using `%w` when callers benefit
  from the cause.
- Preserve exact framework/status errors when wrapping would change their type,
  code, or transport semantics.
- Use sentinel, typed, framework, or domain errors according to existing caller
  branching; do not create a public error contract without a demonstrated need.
- Reusable packages normally return errors instead of logging and returning the
  same failure. Inject logging only when the package owns asynchronous work or
  another failure surface that cannot be returned.
- Keep `recover` at an owning application or worker boundary, not as routine
  package-level error handling.

## Tests And Documentation

- Prefer table-driven tests for behavior matrices and focused tests for boundary,
  misuse, and error paths. Use fuzzing for parsers and other input-heavy code when
  it materially increases confidence.
- Treat coverage as a signal, not proof. Test the behavior changed by the diff.
- Exported symbols should have Go doc comments that start with the symbol name.
  Explain contracts, invariants, ownership, compatibility, and surprising tradeoffs;
  remove comments that only narrate syntax.
- Match new comments to the requested or surrounding language. Do not translate
  existing comments unless asked.

## Numeric Precision

- Do not introduce `float32` or `float64` for exact business quantities unless
  the domain explicitly accepts approximation.
- Treat money, share quantity, inventory, points, counts, quotas, ratios, and
  rates as exact unless the surrounding domain model says otherwise.
- Use the project's precision-safe representation and make division, rounding,
  formatting, and unit conversion explicit with boundary tests.
- Convert external floating-point data before it enters exact core logic.

## STOP Conditions

Stop before applying this skill when:

- The request concerns Kratos API, service, biz, data, middleware, auth, or config
  architecture; use `kratos` with `go-style` as its handwritten-Go lens.
- A behavior-changing edit has no meaningful verification path.
- The module's target Go version cannot be established, or the apparent source
  file is generated and its generator cannot be found.
- A modernization would change a public format, schema, API, error contract, or
  compatibility guarantee without an explicit ruling.

## Verification

Format only edited Go files, then run the narrowest meaningful checks before
broadening to the affected module:

```bash
gofmt -w <edited-go-files>
go test ./...
go vet ./...
```

Use repository commands such as `make test`, `golangci-lint run`, or a narrower
package target when they are authoritative. For concurrency changes, follow the
race and lifecycle checks in the concurrency reference. For performance claims,
follow the before/after evidence contract in the performance reference.

## Failure Handling

| Trigger | First action | If still blocked |
|---|---|---|
| Formatting changes unrelated files | Restrict formatting to edited Go files | Report existing drift without sweeping it in |
| Tests fail outside touched behavior | Inspect failure scope and existing worktree changes | Separate the baseline failure; do not claim completion |
| Error semantics are unclear | Inspect callers and `errors.Is` or status handling | Preserve the existing error shape |
| A reference conflicts with repository behavior | Follow the repository contract | Record the conflict in the handoff |

## Anti-Patterns

- Do not modernize syntax beyond the module's declared Go version.
- Do not replace coherent local idioms with generic advice.
- Do not make performance or concurrency claims without task-relevant evidence.
- Preserve build constraints and target-specific file selection.
