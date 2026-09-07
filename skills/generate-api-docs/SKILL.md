---
name: generate-api-docs
description: "Generates synchronized Markdown API documentation and self-contained OpenAPI 3.1 YAML for Apifox from verified final HTTP behavior. Covers request/response fields, enums, nullability, limits, pagination, authentication, gateway envelopes, errors, and examples. Use for API docs, OpenAPI/Apifox YAML, endpoint docs, field inventories, 接口文档, 生成 OpenAPI, and 出入参文档. Not for new API design, implementation changes, GraphQL without explicit HTTP operations, or replacing codebase-spec."
when_to_use: "generate-api-docs, API documentation, OpenAPI YAML, Apifox import, Markdown API docs, request fields, response fields, 接口文档, 生成 OpenAPI, Apifox YAML, 出入参文档"
metadata:
  version: "0.1.3"
---

# Generate API Docs

Document the current final HTTP contract as a support lens, not a workflow state.
Produce synchronized `<name>.openapi.yaml` and `<name>.md` from one endpoint
inventory. Do not change implementation, invent future behavior, or use GraphQL
alone as proof of HTTP operations. Use `api-designer` for new API design and
`codebase-spec` for broader current-state documentation.

## Establish scope and authority

Read repository instructions and the requested API subset. Without a named subset,
cover externally callable HTTP APIs; exclude health, metrics, debug, and internal
endpoints unless the repository treats them as public. Preserve user changes and
existing documentation conventions.

Read [source-discovery.md](references/source-discovery.md). Trace the declared
OpenAPI/proto/schema or router contract through decoders, validators, handlers,
DTOs, serializers, auth, final error encoders, and gateway/proxy adapters. Use tests
and examples as supporting evidence. The documented response is what the HTTP
client receives, not an intermediate service object.

If declared authority and executable behavior disagree, report the conflict;
do not silently publish stale prose or guess which contract should win. Mark
unresolved facts explicitly and withhold claims of completeness for that surface.

## Build one inventory

For each operation, establish method, literal public path, stable unique
`operationId`, description/tag, authorization, parameters, request body, success
and failure responses, media types, final envelopes, schemas, and supported examples.

For fields, follow the wire-contract traps and evidence checklist in the discovery
reference: actual wire names, nested/array paths, type/format, requiredness versus
nullability, descriptions, constraints, enums, limits, units, and defaults. Distinguish
absent, null, empty, and zero. A database/proto enum does not establish its response
wire representation. Do not substitute a component name for its field inventory.

## Write and synchronize

Read [output-contract.md](references/output-contract.md). Write self-contained
OpenAPI `3.1.0` YAML first, preserving an existing compatible 3.1 patch version.
Use local `$ref` and reusable components; represent null with JSON Schema unions
or `anyOf`, not the OpenAPI 3.0 `nullable` keyword.

Write Markdown from the same inventory and YAML. Preserve the reference's exact
summary heading, interface URL, and Operation ID syntax because the validator
uses them. Include complete request examples, bare primary response headings, and
referenced common default errors; preserve all materially different response fields
and content.
Explain shared conventions once; shared tables must identify their exact wire schema.

Keep current documentation focused on the contract, not a changelog. Preserve
useful source evidence separately from the endpoint narrative when required by the
task. Derive restrained field descriptions from observed behavior; label unknown
business meaning `未说明`. Use sanitized, schema-valid source examples; never
invent production data, disclose secrets, or call production merely for examples.

In update mode, preserve stable operation IDs and intentional prose, update the
inventory from source changes, regenerate both views, and check parity.

## Validate and report

Run the bundled validator from the loaded skill's location:

```bash
ruby "<installed-skill-directory>/scripts/validate_api_docs.rb"   path/to/api.openapi.yaml path/to/api.md
```

It checks supported OpenAPI/YAML structure, operation IDs, local references, path
parameters, descriptions, request examples, referenced common default errors,
Markdown field/content sections, and summary/method/path/ID parity. Fix reported errors. Ruby is required; `loopx doctor` reports that dependency.
If unavailable, report the prerequisite and do not claim validation passed.

Run repository-native contract or schema checks where required. Import into Apifox
only when that verification is explicitly in scope and available. Structural
validation does not prove runtime behavior or a successful live import.

Report both output paths, endpoint count, authority, actual validation commands,
exclusions, and unresolved gaps. Default paths and exact field/table syntax are in
the output contract; no separate generated implementation is needed.
