---
name: go-kratos
description: "High-signal Go and Go-Kratos engineering redlines: exact numeric precision, domain subpackages, proto/wire boundaries, concurrency safety, and MySQL/Ent conventions (Go / Kratos 开发规范)."
metadata:
  version: "0.1.0"
  when_to_use: "go-kratos, Go, golang, .go files, Go-Kratos, proto, buf, biz layer, data layer, goroutine, race, pprof, Go开发, Kratos微服务"
---

# Go & Kratos Guardrails

High-signal engineering rules for handwritten Go and confirmed Go-Kratos
projects. Preserve clear local repository conventions; apply Kratos rules only
when `go.mod` or imports confirm `github.com/go-kratos/kratos/v2`.

## Non-negotiable redlines

1. **Exact numeric precision:** never use `float32` or `float64` for money,
   shares, quantities, inventory, points, quotas, ratios, or rates unless the
   domain explicitly accepts approximation. Use integer minor units or the
   project's decimal type; convert external floats at the ingestion boundary and
   test rounding/division explicitly.
2. **Domain subpackages (no flat dumping ground):** group code by business
   domain (`internal/biz/<domain>`, `internal/data/<domain>`). Put a new flow in
   its own subpackage rather than appending to a package that already mixes
   unrelated flows. Define each repo interface in the `biz` subpackage that
   consumes it. Ask before moving/exporting existing packages.
3. **Never edit generated files as source:** edit `.proto`, Ent schemas, or
   generator inputs and regenerate via the repository's documented command
   (`make`, `buf generate`, etc.), never hand-edit `.pb.go` or generated clients.
4. **No application-controlled DB locks:** follow
   [database-concurrency.md](../shared/database-concurrency.md) — prefer unique
   keys, idempotency keys, and optimistic CAS over `SELECT ... FOR UPDATE`.
5. **Preserve layer and error semantics:** keep protocol handling in `service`,
   use cases in `biz` (without leaking proto types unless established), and
   persistence/clients in `data`. Put `context.Context` first and propagate it;
   wrap errors with `%w` only when it preserves required Kratos/transport error
   types and codes. Return errors in reusable packages instead of log-and-return.
6. **MySQL / Ent schema comments:** where the repository requires schema
   comments, include table `COMMENT`, persisted-column comments, and matching
   Ent `.Comment(...)` annotations on touched tables (never retrofit unrelated tables).
7. **Target Go version:** stay within `go.mod`'s declared `go` directive and
   keep the existing DI/startup framework (`wire`/`fx`/manual) intact.

## Focused references (load only when triggered)

- Concurrency, races, goroutine lifecycle, cancellation → [references/concurrency.md](references/concurrency.md)
- Benchmarks, `pprof`, allocations, latency/GC tuning → [references/performance.md](references/performance.md)
- Explicit Go version upgrade or `go fix` modernization → [references/modernization.md](references/modernization.md)
- Kratos middleware, auth, config, error troubleshooting → [references/kratos-ops.md](references/kratos-ops.md)

## Verification

Format only edited files, run static guardrails, and verify with the narrowest
authoritative checks before broadening:

```bash
gofmt -w <edited-go-files>
node skills/code-review/scripts/check-guardrails.mjs --diff HEAD
go test -race <affected-packages>
go vet <affected-packages>
```

Use repository Make targets or `buf lint` / `buf generate` when authoritative.
