---
name: kratos
description: "Develop or troubleshoot confirmed Go-Kratos services: proto APIs, service/biz/data layers, middleware, auth, and configuration (Kratos 微服务)."
metadata:
  version: "0.3.8"
  when_to_use: "kratos, Go-Kratos, proto, buf, service layer, biz layer, data layer, middleware, auth, config, Kratos 微服务"
---

# Kratos

Apply Go-Kratos conventions to a confirmed Kratos project or an explicit request
to build with Kratos. This skill supplements the existing architecture; it does
not create workflow state or authorize framework adoption in unrelated code.

## Detect and route

Confirm Kratos through `go.mod`, imports such as
`github.com/go-kratos/kratos/v2`, or explicit repository guidance. `buf.yaml`,
`.proto` files, and `internal/service`, `internal/biz`, or `internal/data` alone
are not proof: other stacks use them too. If the task is ordinary Go work, use
`go-style`; ask about framework adoption only when the requested outcome actually
requires choosing a framework and no evidence or instruction settles it.

Load only references needed for the current task:

| Concern | Reference |
| --- | --- |
| Proto/API design | [proto-api-design.md](references/proto-api-design.md) |
| Service, biz, data, dependency injection | [architecture.md](references/architecture.md) |
| Configuration and startup | [configuration.md](references/configuration.md) |
| HTTP response, files, WebSocket | [http-customization.md](references/http-customization.md) |
| JWT/Casbin/auth | [security-auth.md](references/security-auth.md) |
| Middleware and logs | [middleware-logging.md](references/middleware-logging.md) |
| Errors and diagnosis | [troubleshooting.md](references/troubleshooting.md) |
| MCP/extensions | [advanced-features.md](references/advanced-features.md) |

## Preserve the project boundaries

Keep protocol handling in service, use cases in biz, and persistence/external
clients in data where the project follows that layering. Avoid leaking proto
types into biz unless this is the established contract. Inspect nearby callers
before moving responsibilities or adopting a new layer structure.

Use the existing dependency-injection and startup style. `fx` examples apply only
when the project uses `fx`; they do not justify replacing its current framework.
Use `go-style` for handwritten Go and `sql-style` for SQL, migration, and index work.

Confirm proto package and `go_package`, exposure requirements, and validation
conventions before editing. Add HTTP or validation annotations only where required
and supported. Edit `.proto` or other generator inputs, never generated `.pb.go`,
validation code, or OpenAPI as canonical source.

For MySQL DDL, follow the repository's table and column comment convention. Where
comments are required, include table-level `COMMENT`, persisted-column comments,
and corresponding Ent `.Comment(...)` declarations. Do not retrofit unrelated
schemas solely because the framework skill was loaded.

## Diagnose and verify

Trace middleware registration order, error conversion, serialization, and auth
checks when behavior depends on them. Resolve public API, permission, migration,
or rollout decisions through `clarify` or `spec` when not already settled.
Use `debug` or `tdd` when explicitly invoked or needed by the current task;
framework membership alone does not mandate extra steps. Check completion
evidence under the working agreement.

Regenerate using the repository's documented command and run relevant lint,
generation-drift, test, and vet checks. Common commands include `buf lint`,
`buf generate`, and `go test ./...`, but prefer authoritative Make targets or
scripts. If generation fails or tooling is missing, report it rather than editing
outputs by hand. Report the affected contract and checks actually performed.
