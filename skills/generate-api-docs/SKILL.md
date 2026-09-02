---
name: generate-api-docs
description: "Generates synchronized Markdown API documentation and self-contained OpenAPI 3.1 YAML for Apifox from verified final HTTP behavior. Covers request/response fields, enums, nullability, limits, pagination, authentication, gateway envelopes, errors, and examples. Use for API docs, OpenAPI/Apifox YAML, endpoint docs, field inventories, 接口文档, 生成 OpenAPI, and 出入参文档. Not for new API design, implementation changes, GraphQL without explicit HTTP operations, or replacing codebase-spec."
when_to_use: "generate-api-docs, API documentation, OpenAPI YAML, Apifox import, Markdown API docs, request fields, response fields, 接口文档, 生成 OpenAPI, Apifox YAML, 出入参文档"
metadata:
  version: "0.1.1"
---

# Generate API Docs

## loopx Boundary

Use this as a support lens, not a workflow state. Document the current HTTP contract from repository evidence. Do not design a future API, resolve product or compatibility decisions, or mutate implementation. Use `api-designer` for new API design and `codebase-spec` for a broader current-state system specification.

## Required Outputs

Generate two views of one verified HTTP API contract:

- `<name>.openapi.yaml`: the machine-readable source of the delivered documentation.
- `<name>.md`: the human-readable companion derived from the same endpoint inventory.

Do not invent endpoints, fields, enum values, examples, authentication rules, or error behavior. Mark unresolved facts explicitly and stop before publishing a misleading contract.

## Workflow

### 1. Read repository instructions and establish scope

Read the repository's agent instructions and documentation policy before inspecting APIs. Infer the requested API subset from the prompt. If no subset is given, document the repository's externally callable HTTP API and exclude health, metrics, debug, and internal-only endpoints unless the repository treats them as public.

Preserve unrelated working-tree changes. Do not modify generated source code or application behavior.

### 2. Find the authoritative contract

Read [references/source-discovery.md](references/source-discovery.md). Search with `rg`/`rg --files`, then inspect the authority and every layer needed to establish actual wire behavior.

Prefer, in order, while tracing through to the final public HTTP boundary:

1. A repository-declared authoritative OpenAPI/proto/schema contract, verified against its runtime adapter.
2. Router or transport declarations plus the concrete request and response DTOs used by the operation.
3. Controllers/handlers, custom serializers, validators, middleware, gateway/proxy wrappers, and final error encoders.
4. Contract/integration tests and executable examples.
5. Existing prose documentation as corroboration.

The documented response is the payload observed by the HTTP client, not an intermediate service result. A proto or response DTO does not establish the final envelope when a gateway rewrites it. When executable sources and declared documentation disagree, report the conflict and follow the user's approved scope; never silently copy stale prose into the generated contract.

### 3. Build one endpoint inventory

Before writing either artifact, record for each operation:

- HTTP method and literal path
- stable, unique `operationId`
- summary, description, and tag/module
- authentication and authorization behavior
- path, query, header, and cookie parameters
- request body media types and schemas
- success and failure responses, media types, envelopes, and schemas
- examples that are accepted by the declared schemas

For every request and response field, record its wire name, full object path, type/format, requiredness or nullability, description, constraints, and example when evidence provides one. Expand nested objects and array items until scalar fields are documented; a schema name alone is not a field inventory.

Include shared schemas, enums, nullability/optionality, formats, pagination, timestamps, idempotency, and error codes only when supported by evidence.

For frontend-facing completeness, explicitly verify:

- request enums separately from response enums; do not assume a stored numeric code is also returned as a number
- custom JSON marshalers, presentation DTOs, localized enum objects, and unknown/null enum behavior
- final success and error envelopes, HTTP status behavior, trace/request IDs, compatibility fields, and omitted fields
- language values, aliases, defaults, and fallback behavior
- pagination defaults, maxima, normalization/clamping, and deterministic sort order
- upload media type, form field name, binary encoding, size limit, MIME allowlist, and whether type is detected or trusted
- string limits and whether they are measured in bytes, characters, or code points
- closed string keys used for steps, reasons, categories, and other frontend routing or display decisions

### 4. Write the OpenAPI YAML first

Read [references/output-contract.md](references/output-contract.md) and write a self-contained OpenAPI `3.1.0` YAML file. Preserve a newer compatible 3.1 patch version when the repository already uses it. Use JSON Schema null unions or `anyOf`; do not emit the OpenAPI 3.0 `nullable` keyword.

Use reusable `components` and local `$ref` values. Give every operation a stable, unique `operationId`. Include concrete request and response examples where the code or tests establish them. Never encode an HTTP response envelope that exists only in prose if runtime serialization differs.

### 5. Write Markdown from the same inventory

Use the YAML and endpoint inventory as inputs; do not rediscover the API independently. Follow the exact endpoint heading and Operation ID syntax in [references/output-contract.md](references/output-contract.md), because the validator uses them to detect drift.

Explain authentication, common conventions, errors, pagination, timestamps, and enum meanings once in shared sections, then document each endpoint's parameters, body, responses, and examples.

Write a current contract, not a change log. Do not include commit IDs, migration history, generation notes, implementation evidence lists, or prose about how an endpoint was changed unless the user explicitly requests historical documentation. Prefer shared field and enum sections over repeating explanatory prose, while keeping every operation's concrete field inventory verifiable.

Every endpoint section must contain:

- all path, query, header, and cookie inputs
- every request-body field, including nested object fields and array item fields
- every success-response field, including envelope and pagination fields
- fields of each materially different error response
- response status, media type, body structure, and representative response content

Each field table must include field name/path, type, required/nullable state, and description. Include constraints, enum meanings, units, formats, defaults, and examples when established by the source. Referencing a component without exposing its fields is insufficient.

### 6. Validate and reconcile

Run:

```bash
ruby "<installed-skill-directory>/scripts/validate_api_docs.rb" \
  path/to/api.openapi.yaml path/to/api.md
```

Resolve `<installed-skill-directory>` from the loaded skill location; do not assume a particular host home directory. The validator checks YAML structure, supported OpenAPI version, unique operation IDs, local `$ref` resolution, path-parameter declarations, field descriptions, required Markdown field/content sections, and exact method/path/operationId parity. Fix every reported error.

Ruby is a required runtime for the bundled validator. If `ruby --version` fails, report the missing prerequisite and do not claim documentation validation passed. A loopx installation reports this dependency through `loopx doctor`.

Also run repository-native OpenAPI lint, generation, or contract tests when present. If Apifox is available and import verification is explicitly in scope, import the YAML and inspect the preview; otherwise state that structural validation passed and that no live Apifox import was performed.

### 7. Report the result

Report both output paths, the documented endpoint count, the authority used, validation commands, and any intentionally excluded surface. Do not claim the runtime was verified unless relevant application or contract tests actually ran.

## Update mode

When either artifact already exists, preserve stable `operationId` values and intentional descriptions. Diff the code authority against the existing YAML, update the endpoint inventory, regenerate both views, and validate parity. Do not replace carefully maintained prose merely to normalize style.

## Hard rules

- Produce YAML, not JSON, for the Apifox artifact.
- Keep one operation per method/path pair; OpenAPI cannot represent duplicate operations with the same pair.
- Use protobuf JSON field names or the runtime serializer's actual wire names, not language struct field names.
- Distinguish absent, nullable, empty, and zero values when the runtime does.
- Do not omit field descriptions. If authoritative sources contain no description, write a restrained description derived from verified behavior and label genuinely unknown semantics as `未说明`; never guess business meaning.
- Put secrets only in security-scheme placeholders, never examples.
- Do not make network or production calls merely to obtain examples.
- Do not mutate API implementation while performing a documentation-only request.
- Do not use a database or proto enum declaration as proof of a response field's wire type; inspect the response serializer or DTO.
- Do not document an intermediate service error or success object when a gateway/proxy produces a different client-visible envelope.
