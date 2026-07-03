---
name: kratos
description: "Supports Go-Kratos microservices, proto/buf APIs, service/biz/data layers, middleware, auth, config, and troubleshooting. Not for generic Go style alone."
when_to_use: "kratos, Go-Kratos, proto, buf, service layer, biz layer, data layer, middleware, auth, config, Kratos 微服务"
metadata:
  version: "0.3.4"
---

# Kratos

## Purpose

`kratos` supports Go-Kratos microservice work while staying subordinate to the repository's existing architecture.

Use this skill when the user mentions Kratos, protobuf APIs, buf, service/biz/data layering, Kratos HTTP/gRPC servers, middleware, JWT/Casbin auth, or when the repository shows Kratos signals.

## Project Detection

Before applying Kratos-specific patterns, inspect for these signals:

- `buf.yaml` or `buf.gen.yaml`
- `api/**/*.proto`
- `internal/service/`
- `internal/biz/`
- `internal/data/`
- imports containing `github.com/go-kratos/kratos/v2`

If signals are weak, ask whether to proceed with Kratos conventions before creating framework-specific structure.

## STOP Conditions

Stop before applying this skill when:

- The repository has no Kratos, proto, buf, or `internal/{service,biz,data}` signals and the user did not explicitly ask for Kratos.
- The requested change is generic Go cleanup with no framework boundary; use `go-style` instead.
- API, permission, migration, or rollout behavior is unresolved; route those decisions through `clarify` or `spec`.

## Decision Map

Use only the reference file needed for the current task:

- New API / proto: `references/proto-api-design.md`
- Service, biz, data layering: `references/architecture.md`
- Configuration / startup: `references/configuration.md`
- HTTP response customization, WebSocket, files: `references/http-customization.md`
- JWT / Casbin / auth: `references/security-auth.md`
- Middleware / logging: `references/middleware-logging.md`
- Errors and troubleshooting: `references/troubleshooting.md`
- MCP / advanced extensions: `references/advanced-features.md`

## Architecture Defaults

- Keep protocol concerns in `internal/service`.
- Keep business rules and use cases in `internal/biz`.
- Keep persistence, repositories, and external clients in `internal/data`.
- Avoid leaking proto types into `biz` unless the existing project already does.
- Prefer existing dependency injection style. Use `fx` examples only when the project already uses `fx`.
- Preserve generated-code boundaries; edit source `.proto` or handwritten layers, not generated files.

## Proto/API Defaults

- Confirm package and `go_package` before adding proto files.
- Add HTTP annotations only when HTTP exposure is required.
- Use validation annotations when the project already uses `buf.validate` or `protovalidate`.
- Regenerate code with the repository's existing command, such as `buf generate`, `make api`, or project scripts.

## Database DDL

- MySQL `CREATE TABLE` statements must include a table-level `COMMENT`.
- MySQL column definitions in `CREATE TABLE` or `ALTER TABLE ... ADD COLUMN` statements must include column-level `COMMENT`.
- When using Ent schema for MySQL tables, add `.Comment(...)` to fields that are persisted as columns.
- Use `sql-style` for broader SQL/database discipline: schema semantics, migrations, indexes, dialect behavior, query plans, and performance-sensitive data access.

## Failure Handling

| Trigger | First action | If still blocked |
|---|---|---|
| Generated code does not match source `.proto` files | Inspect the repository's documented generation command and rerun it | Stop and report the missing or failing generator command instead of editing generated files by hand |
| Layer ownership is unclear | Read nearby `internal/service`, `internal/biz`, and `internal/data` examples | Route the ownership decision through `architecture-designer` or `spec` |
| Middleware/auth behavior is order-sensitive | Trace existing registration order and tests before changing code | Use `debug` to establish the failing request path before patching |

## Do Not

- Do not create Kratos layout in a non-Kratos repository without explicit user direction.
- Do not edit generated `.pb.go`, `.pb.validate.go`, or generated OpenAPI files as the canonical source.
- Do not move business rules into transport handlers to make a quick fix.
- Do not introduce new dependency-injection frameworks when the project already has one.

## Integration With Other loopx Skills

- Use `go-style` for handwritten `.go` edits.
- Use `tdd` for behavior changes when a meaningful failing test can be written before implementation.
- Use `debug` for Kratos runtime failures, generated-code mismatches, middleware ordering bugs, or request/response behavior that is not understood.
- Use `verify` before claiming the API, generated code, or service behavior is ready.

## Verification

Prefer project-native commands. Common Kratos verification commands include:

```bash
buf lint
buf generate
go test ./...
go vet ./...
```

If the project uses Make targets, prefer those over ad hoc commands.
