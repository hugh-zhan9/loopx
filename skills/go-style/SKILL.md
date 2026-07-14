---
name: go-style
description: "Applies loopx Go coding style for .go edits, tests, errors, context, naming, and interface boundaries. Not for non-Go code or Kratos-specific architecture by itself."
when_to_use: "go-style, Go, golang, .go files, go tests, gofmt, idiomatic Go, Go style, Go 代码"
metadata:
  version: "0.3.7"
---

# Go Style

## Purpose

`go-style` is a lightweight Go coding discipline skill. It should guide edits to `.go` files without overriding the repository's established conventions.

Use it as a support skill from `subagent-exec` or `exec` when Go files are created or modified, and directly when the user asks for Go style, idiomatic Go, or Go code cleanup.

## Core Rules

- Preserve local project style first. If nearby code conflicts with this skill, follow the local pattern unless it is clearly broken.
- When modernizing Go idioms or APIs, read the project's `go.mod` first and do not use syntax or standard-library APIs newer than the declared `go` directive.
- Treat Go modernization as behavior-preserving cleanup. Prefer project lint/tool output and official Go tooling over broad manual rewrites.
- Keep the happy path straight down. Return early for errors and guard clauses.
- Put `context.Context` first in functions that accept a context.
- Wrap propagated errors with operation context using `%w` when the caller benefits from the cause.
- Do not wrap errors when returning framework/status errors that must preserve exact type or code semantics.
- Use sentinel errors, typed errors, or framework errors according to the existing project pattern; do not force sentinel errors everywhere.
- Avoid shadowing Go predeclared identifiers such as `len`, `error`, `string`, `copy`, `new`, and `make`.
- Keep interfaces small and define them at the consumer boundary when practical.
- Prefer table-driven tests for behavior matrices.
- Run `gofmt` on edited Go files before verification.

## STOP Conditions

Stop before applying this skill when:

- The requested change is Kratos API, service, biz, data, middleware, or config architecture; use `kratos` with `go-style` as a support lens.
- The code change would alter behavior but no test or verification path exists.
- The repository's `go.mod` cannot be found or the target files are generated.

## Numeric Precision

- Do not introduce `float32` or `float64` for exact business quantities unless the domain explicitly accepts approximation.
- Treat money, share quantity, inventory, points, counts, quotas, ratios, and rates as exact unless the surrounding code or domain model says otherwise.
- Choose a precision-safe type that matches the domain: integer minor units, fixed-point values, decimal types, or the project's existing numeric type.
- Treat external float/double values as boundary data; convert them before they enter core business logic.
- Make division, rounding, formatting, and unit conversion rules explicit, with focused tests for important boundaries.

## Error Handling

Good default:

```go
user, err := repo.GetUser(ctx, userID)
if err != nil {
    return nil, fmt.Errorf("get user %s: %w", userID, err)
}
```

Use exact framework errors when the framework contract requires them:

```go
if !allowed {
    return nil, errors.Forbidden("PERMISSION_DENIED", "permission denied")
}
```

Expected error categories may be represented by:

- package-level sentinel errors with `errors.Is`
- typed errors with structured fields
- Kratos/API status errors
- existing project domain error helpers

Choose the one already used in the codebase.

## Comments

- Exported symbols should have Go doc comments that start with the symbol name.
- Short local comments are acceptable when they explain why, not what.
- Prefer complete sentences for package, exported type, exported function, exported method, and non-obvious behavior comments.
- Match new comments to the user's requested language. If the user asks in Chinese or explicitly requests Chinese comments, write new comments in Chinese while preserving Go doc naming conventions such as `// UserService ...` and `// CreateUser ...`.
- Do not translate existing comments unless the user explicitly asks for translation; preserve the surrounding file's established comment language when no user preference is stated.
- Remove comments that only restate syntax, names, or immediately obvious control flow.
- Add comments for non-obvious business rules, ordering constraints, compatibility behavior, concurrency assumptions, performance tradeoffs, and external API quirks.
- Check nearby existing comments when behavior changes; stale comments are worse than missing comments.
- Prefer clearer names, smaller functions, or stronger types over comments that explain avoidable confusion.

## Verification

For Go edits, prefer the narrowest meaningful verification first, then broaden if the touched surface is shared:

```bash
gofmt -w <edited-go-files>
go test ./...
go vet ./...
```

Use project-specific commands when present, such as `make test`, `make lint`, `golangci-lint run`, or repository scripts.

## Failure Handling

| Trigger | First action | If still blocked |
|---|---|---|
| `gofmt` changes unrelated files | Limit formatting to edited Go files | Report the unrelated formatting drift instead of sweeping it in |
| Tests fail outside touched behavior | Inspect failure scope and recent user changes | Report the pre-existing failure separately; do not claim completion |
| Error type semantics are unclear | Search existing callers and `errors.Is` / status handling patterns | Preserve the existing error shape rather than wrapping blindly |

## Anti-Patterns

- Do not modernize syntax beyond the module's declared Go version.
- Do not replace local idioms with generic Go advice when nearby code is consistent.
- Do not add abstraction around a single implementation unless current callers need it.
- Do not edit generated Go files as the source of truth.
- Preserve build constraints and platform-specific file selection. When adding
  or changing `//go:build` lines, verify the affected target combinations and
  keep the legacy `+build` form only when the repository's supported Go version
  requires it.
- When concurrency, goroutines, locks, channels, or cancellation behavior
  changes, run focused `go test -race` where the environment supports it and
  record goroutine ownership and shutdown behavior.
