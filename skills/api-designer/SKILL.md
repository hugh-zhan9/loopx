---
name: api-designer
description: "Design or review REST, GraphQL, and OpenAPI contracts (接口设计), including caller needs and compatibility. Use generate-api-docs for existing HTTP API documentation."
when_to_use: "api-designer, API design, REST, GraphQL, OpenAPI, resource modeling, pagination, versioning, API errors, compatibility, 接口设计"
license: MIT
metadata:
  version: "0.3.11"
  forked_from: https://github.com/Jeffallan/claude-skills/tree/main/skills/api-designer
  maintained_by: loopx
---

# API Designer

Apply REST, GraphQL, and OpenAPI 3.1 design discipline as a support lens in direct
API work, `spec`, implementation, or host-native review. This skill does not
advance workflow state or replace its source contract.

## Scope the contract work

Read the requested surface, existing API conventions, relevant callers, and
accepted product requirements. Reuse the established style unless a change is
part of the task. For new APIs, compare styles using client needs and evolution
constraints; label a proposal as a proposal until accepted where approval applies.

A naming review or one-endpoint question needs a focused answer. Produce OpenAPI
or GraphQL artifacts when the request or owning workflow calls for them, at the
requested scope. Do not generate a full API specification for every consultation.

Investigate unresolved behavior, authorization, compatibility, and migration
choices. Present evidenced options where useful; use `clarify` for remaining
owner decisions and `spec` for durable design decisions. Open technical choices
are design work, not a reason to stop before comparing alternatives. Do not
finalize a breaking contract without an accepted migration or deprecation path.

## Return only what callers need

Define response fields from accepted caller scenarios, not from database columns,
ORM entities, domain objects, or upstream payloads. For every new response field,
including nested fields, identify a concrete display, action, computation, or
required protocol use in the contract. Use caller code or accepted requirements
as evidence; do not invent consumers. Omit fields without that evidence. Storage
availability, possible future use, and debugging convenience do not justify them.

Choose fields separately for list, detail, and edit scenarios. Do not default to
one full object for all three. Explicitly select the response fields within the
existing API boundary; do not serialize an entire persistence object. Internal
snapshots, audit payloads, fingerprints, and diagnostic metadata require a named
consumer need before exposure. Even detail responses need that justification;
do not automatically move every rejected list field into a new detail endpoint.

When a caller needs to inspect structured data, return a defined object or array
with documented member types, meaning, and nullability. Do not JSON-encode it
inside a string field or use an unbounded object/map to avoid defining the
contract. Database storage as JSON text does not determine the wire type. Opaque
text is appropriate only when the accepted use needs the original text itself
(such as raw export), or an existing compatibility contract requires it; record
that reason. If stored JSON must be decoded, define validation and failure
behavior without inventing an empty-object or raw-string fallback.

For example, an exception list does not inherit `expectedJson`, `confirmedJson`,
and `differenceJson` snapshot columns merely because they exist. A requested
comparison view should expose only the defined changes that view consumes.
Parsing a full snapshot into an object does not make its unused fields necessary.

For existing APIs, inspect relevant consumers and compatibility promises before
removing fields or changing string fields to objects. One frontend's non-use is
not proof that every consumer can lose a field. Record an accepted migration or
deprecation path where needed. Judge sufficiency by the scenario, not a fixed
field-count limit; field selection parameters and new endpoints are not defaults.

## Inspect the relevant dimensions

| Surface | Decisions to establish |
| --- | --- |
| REST | Resources and relationships, methods, paths, status semantics, request/response schemas |
| GraphQL | Types, operations, inputs, resolver boundaries, nullability, error and partial-success behavior |
| Access | Authentication, operation/field authorization, sensitive output |
| Collections | Expected cardinality, filtering, stable ordering, pagination when needed |
| Writes | Idempotency, duplicates, concurrent updates, material lost-update risks |
| Evolution | Required fields, nullability, enum growth, defaults, unknown-field handling, existing clients |
| Capacity and abuse | Bounds, query cost, rate limits where the observed usage makes them material |
| Webhooks | Signature and replay policy, delivery failures, retries, ordering, deduplication, observability |

Do not add a mechanism just to fill the table. Preserve the existing error format
and naming conventions when required for compatibility. For a new error model,
define actionable errors and evaluate Problem Details for REST. Do not silently
convert an existing API's errors or impose a new retry policy.

For GraphQL, model client operations rather than database tables. Establish
resolver authorization and controls for unbounded nested queries. Prefer additive
schema evolution with deprecation unless a different versioning contract is
required. Describe pagination, batching, and caching where they affect behavior
or resource usage.

## Artifacts and validation

When drafting a contract, include representative success and failure examples,
field constraints, authorization, and applicable evolution rules. A requested
standalone REST artifact must be self-contained; a requested patch may cover the
changed slice and its dependencies. The [endpoint starter](references/endpoint-template.md)
is optional and does not supply product defaults.

Use repository-pinned schema validation or code generation, and existing local
mock/test facilities where useful. Fix artifact validation failures before
calling the contract valid. If tooling is missing, state exactly which checks
were unavailable; do not use `npx` to fetch tools or start new external services
without authorization. Previously granted authorization remains valid.

## Reference guide

Load only references relevant to the current decision:

| Topic | Reference |
| --- | --- |
| Resources and HTTP semantics | [rest-patterns.md](references/rest-patterns.md) |
| Compatibility and deprecation | [versioning.md](references/versioning.md) |
| Collection traversal | [pagination.md](references/pagination.md) |
| Error model design | [error-handling.md](references/error-handling.md) |
| OpenAPI artifacts and tooling | [openapi.md](references/openapi.md) |

## Deliver

Return the requested review, design decision, or artifact, with the compatibility
impact, unresolved choices, and actual validation result where applicable. Include
only applicable dimensions; a full resource map, rate-limit plan, and versioning
strategy are not mandatory for a local API question.
