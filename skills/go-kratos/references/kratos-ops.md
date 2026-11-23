# Kratos Operations & Troubleshooting Reference

Load only when working on Kratos middleware, auth, config, error mapping, or
transport customization. Preserve the repository's existing DI (`wire`/`fx`)
and layout conventions.

## High-signal Kratos pitfalls

1. **Middleware execution order:** outer middleware wraps inner middleware.
   Register recovery first, then logging/tracing/metrics, then auth/JWT, then
   request validation (`protovalidate`) so panics are caught, auth runs before
   expensive business logic, and error encoders see final status errors.
2. **Error conversion:** construct Kratos `*errors.Error` from proto-generated
   error reason enums (e.g. `v1.ErrorUserNotFound(...)`). Avoid wrapping a
   Kratos status error with `fmt.Errorf("%w")` if callers inspect type directly
   without `errors.FromError`; verify with the project's error encoder.
3. **Proto & wire boundary:**
   - Edit `.proto` and run the repo's `buf lint` / `buf generate` or Make target.
   - Check `go_package`, HTTP bindings (`google.api.http`), and whether
     `protojson` `EmitUnpopulated` / `UseProtoNames` is configured in the HTTP
     encoder before assuming JSON field presence or casing.
4. **Configuration & startup:**
   - Validate required config at startup before serving traffic.
   - Never log raw DSNs, tokens, or signed URLs during config reload or error logging.
5. **Auth / JWT / Casbin:**
   - Confirm route selector white-lists (health/login/public endpoints) explicitly;
     missing a selector match silently bypasses auth.
   - Propagate caller identity through `context.Context` via typed keys, not raw strings.
6. **Troubleshooting checklist:**
   - 404 / route mismatch → check `google.api.http` path bindings and HTTP prefix registration.
   - Unexpected 500 on domain error → check custom `ErrorEncoder` and whether `*errors.Error` was converted.
   - Nil dependency at runtime → inspect `wire_gen.go` / `fx` provider sets and regenerate.
