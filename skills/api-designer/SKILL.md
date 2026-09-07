---
name: api-designer
description: "Applies loopx API design discipline for REST, GraphQL, OpenAPI, resource modeling, pagination, versioning, compatibility, and error models. Not for replacing clarify, spec, implementation planning, code review, or workflow state transitions."
when_to_use: "api-designer, API design, REST, GraphQL, OpenAPI, resource modeling, pagination, versioning, API errors, compatibility, 接口设计"
license: MIT
metadata:
  version: "0.3.9"
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
