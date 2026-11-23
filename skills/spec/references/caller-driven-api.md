# Caller-Driven API Response Contract

Load when designing or reviewing HTTP/RPC response shapes and API evolution.

## Return only what callers need

1. **Derive fields from caller scenarios, not DB tables.** Every new response
   field (including nested fields) needs an evidenced display, action,
   computation, or protocol use. Omit fields justified only by "already in the
   table", "might be useful later", or "handy for debugging".
2. **Never serialize persistence entities directly.** Select fields explicitly at
   the API boundary. Choose fields separately for list, detail, and edit views.
   Internal snapshots, audit blobs, trace fingerprints, and diagnostic metadata
   require an explicit consumer requirement before exposure.
3. **No JSON-in-string for structured data.** If callers inspect structured
   data, return a typed object or array with explicit member names, types, and
   nullability — regardless of whether the database stores it as JSON text.
   Define decode failure behavior explicitly; never invent an empty-object or
   raw-string fallback.
4. **Protect existing consumers.** Inspect callers before removing fields,
   narrowing types, or changing wire formats. Breaking changes require an
   explicit compatibility or deprecation decision.
