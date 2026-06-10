---
name: go-style
description: "Applies loopx Go coding style for .go edits, tests, errors, context, naming, and interface boundaries. Not for non-Go code or Kratos-specific architecture by itself."
when_to_use: "go-style, Go, golang, .go files, go tests, gofmt, idiomatic Go, Go style, Go 代码"
metadata:
  version: "0.2.6"
---

# Go Style

## Purpose

`go-style` is a lightweight Go coding discipline skill. It should guide edits to `.go` files without overriding the repository's established conventions.

Use it as a support skill from `subagent-exec` or `exec` when Go files are created or modified, and directly when the user asks for Go style, idiomatic Go, or Go code cleanup.

## Core Rules

- Preserve local project style first. If nearby code conflicts with this skill, follow the local pattern unless it is clearly broken.
- Keep the happy path straight down. Return early for errors and guard clauses.
- Put `context.Context` first in functions that accept a context.
- Wrap propagated errors with operation context using `%w` when the caller benefits from the cause.
- Do not wrap errors when returning framework/status errors that must preserve exact type or code semantics.
- Use sentinel errors, typed errors, or framework errors according to the existing project pattern; do not force sentinel errors everywhere.
- Avoid shadowing Go predeclared identifiers such as `len`, `error`, `string`, `copy`, `new`, and `make`.
- Keep interfaces small and define them at the consumer boundary when practical.
- Prefer table-driven tests for behavior matrices.
- Run `gofmt` on edited Go files before verification.

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
