# Go Modernization

Use this reference only for explicit modernization, Go version migration, or
deprecated/verbose idiom cleanup. Modernization is behavior-preserving unless
the user has approved a compatibility change.

## Establish The Version Boundary

1. Read the module's `go.mod` and use its `go` directive as the language and
   standard-library compatibility floor.
2. Inspect any `toolchain` directive and CI/build images, but do not treat a
   locally installed newer toolchain as permission to raise the source baseline.
3. If there is no module or other explicit target version, stop and obtain the
   target instead of inventing a default.

## Prefer Go-Aware Transformations

- Use repository lint output, `go fix`, `gopls` modernization diagnostics, and
  compiler diagnostics before manual pattern matching.
- Scope automated fixes to the requested packages. Do not modernize an entire
  module when the task names one package or behavior.
- Use AST-aware tools or semantic inspection for imports, selector aliases,
  closures, build tags, and generic types. Text resemblance is not proof that a
  rewrite is valid.
- Run `gofmt`, tests, and `go vet` after the edits. Re-run generators only when
  their source contract changed.

## Low-Risk Candidates

Apply only when the declared Go version supports the replacement and the local
code does not intentionally use the older form:

- standard helpers that directly express an existing calculation, such as
  `time.Since`, `time.Until`, or `strings.Cut`;
- language aliases and built-ins such as `any`, `min`, `max`, or `clear`;
- `slices`, `maps`, and iterator helpers that preserve ordering, aliasing, nil,
  and mutation behavior required by callers;
- version-appropriate testing and synchronization helpers when their lifecycle
  and panic semantics match the old code;
- official build-constraint cleanup when every supported toolchain accepts it.

Treat this list as candidate families, not a version catalog. Confirm each API
against the target toolchain documentation or compiler.

## Review-Required Candidates

Do not auto-apply these merely because a newer API exists:

- JSON tag changes such as `omitempty` to `omitzero`;
- `math/rand` to `math/rand/v2`, which changes streams and seeding behavior;
- callback APIs to `iter.Seq`, which changes a public contract;
- `http.ServeMux` route rewrites, path matching, or method handling;
- `context` cause APIs when callers observe cancellation causes;
- `unsafe` pointer rewrites or typed atomic migrations;
- `strings.Clone`, `bytes.Clone`, or slice cloning, which intentionally changes
  allocation and aliasing;
- scanner-to-lines or split-to-sequence rewrites when delimiters, retained
  newlines, token limits, indexes, or full-slice reuse matter.

## Completion Evidence

Report the detected Go version, packages changed, transformations applied,
review-required candidates left untouched, formatting command, and fresh test
results. Do not claim a rewrite is idiomatic solely because it is newer.
