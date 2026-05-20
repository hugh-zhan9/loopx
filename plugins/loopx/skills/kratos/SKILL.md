---
name: kratos
description: "Supports Go-Kratos microservices, proto/buf APIs, service/biz/data layers, middleware, auth, config, and troubleshooting. Not for generic Go style alone."
when_to_use: "kratos, Go-Kratos, proto, buf, service layer, biz layer, data layer, middleware, auth, config, Kratos 微服务"
metadata:
  version: "0.1.4"
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
