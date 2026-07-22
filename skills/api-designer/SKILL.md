---
name: api-designer
description: "Applies loopx API design discipline for REST, GraphQL, OpenAPI, resource modeling, pagination, versioning, compatibility, and error models. Not for replacing clarify, spec, implementation planning, code review, or workflow state transitions."
when_to_use: "api-designer, API design, REST, GraphQL, OpenAPI, resource modeling, pagination, versioning, API errors, compatibility, 接口设计"
license: MIT
metadata:
  version: "0.3.7"
  forked_from: https://github.com/Jeffallan/claude-skills/tree/main/skills/api-designer
  maintained_by: loopx
---

# API Designer

API design discipline for REST, GraphQL, and OpenAPI 3.1 contracts.

## loopx Boundary

`api-designer` is a support lens, not a workflow state. Use it directly when the user asks for API design help, and use it from `spec`, `exec`, or `review` when work touches API contracts.

This skill does not replace `clarify`, `spec`, `plan2exec`, or `review`. If product behavior, permissions, compatibility, migration, or client contract decisions are unresolved, route those decisions through `clarify` or `spec` instead of deciding them inside this skill.

## Core Workflow

1. **Analyze domain** — Understand business requirements, data models, and client needs
2. **Choose API style** — State whether the contract is REST, GraphQL, or mixed, and why that style fits the client and evolution needs
3. **Model contract surface** — For REST, identify resources, relationships, URI patterns, HTTP methods, and request/response schemas. For GraphQL, identify object types, operations, inputs, resolver boundaries, and schema evolution rules.
4. **Specify contract** — For REST, create OpenAPI 3.1 and validate it with repository-pinned tooling. For GraphQL, define the schema and run the project's schema validation or code generation checks. If the repository has no validator, report degraded validation instead of fetching one without authorization.
5. **Mock and verify** — Exercise representative operations with the project's existing mock or local test facilities. If none exist, describe the verification gap; do not fetch a mock server with `npx` without explicit authorization.
6. **Plan evolution** — Decide whether endpoint versioning, additive evolution, deprecation, or a compatibility plan is required by the observed contract and callers.

## STOP Conditions

Stop before finalizing an API contract when:

- Product behavior, authorization, compatibility, or migration rules are unresolved.
- The request needs implementation planning rather than contract design; route to `plan2exec` after `spec`.
- Existing clients or public schemas may break and no approved deprecation or migration path exists.

## Reference Guide

Load detailed guidance based on context:

| Topic | Reference | Load When |
|-------|-----------|-----------|
| REST Patterns | `references/rest-patterns.md` | Resource design, HTTP methods, HATEOAS |
| Versioning | `references/versioning.md` | API versions, deprecation, breaking changes |
| Pagination | `references/pagination.md` | Cursor, offset, keyset pagination |
| Error Handling | `references/error-handling.md` | Error responses, RFC 7807, status codes |
| OpenAPI | `references/openapi.md` | OpenAPI 3.1, documentation, code generation |

## Constraints

### MUST DO
- For REST contracts, follow REST principles: resource-oriented URIs, proper HTTP methods, and HTTP status semantics.
- For REST contracts, include a comprehensive OpenAPI 3.1 specification.
- For GraphQL contracts, include schema definitions, resolver boundaries, operation examples, and validation or code generation checks.
- Use consistent naming conventions within each contract style.
- Design proper error responses with actionable messages: RFC 7807 for REST, and explicit GraphQL error shape and partial-success rules for GraphQL.
- Decide pagination, rate limiting, and endpoint versioning from product needs,
  expected cardinality, abuse risk, compatibility constraints, and observed
  callers. Document the decision, including when a mechanism is unnecessary.
- Prefer repository-pinned OpenAPI tooling. If it is unavailable, report
  degraded validation; do not use `npx` to fetch tooling without explicit
  authorization.
- Document authentication and authorization
- Provide request/response examples
- For state-changing operations, decide idempotency, duplicate suppression, and
  concurrent-update behavior. Use conditional requests or explicit version
  fields when lost updates are a material risk.
- For webhooks, define signature verification, replay protection, retry,
  ordering, deduplication, and delivery observability.
- Classify response-field changes by compatibility impact, including required
  fields, nullability, enum expansion, defaults, and unknown-field handling.

### MUST NOT DO
- For REST contracts, use verb-style resource URIs (use `/users/{id}`, not `/getUser/{id}`)
- Return inconsistent response structures
- Skip error code documentation
- For REST contracts, ignore HTTP status code semantics.
- Leave compatibility and evolution behavior implicit when clients or public
  schemas may be affected
- Expose implementation details in the API surface
- Create breaking changes without a migration path
- Omit abuse, capacity, pagination, or rate-limit analysis when the observed
  surface makes those concerns material

## GraphQL Discipline

When designing GraphQL APIs, provide the same contract rigor as REST:

- Model object types, input types, mutations, queries, and subscriptions around client use cases, not database tables.
- Define nullability, pagination, filtering, sorting, and authorization rules explicitly in the schema.
- Use stable node identifiers and connection-style pagination when clients need cursor traversal.
- Avoid unbounded nested queries; plan depth, complexity, batching, and caching controls.
- Version by additive schema evolution and documented deprecation, not parallel endpoint versions unless the product contract requires it.
- Specify error shape, partial-success behavior, and resolver-level authorization failures.

## Failure Handling

| Trigger | First action | If still blocked |
|---|---|---|
| REST resource model is unclear | Name candidate resources and the business operation each supports | Route unresolved product semantics through `clarify` or `spec` |
| OpenAPI or schema validation fails | Fix the contract artifact before treating examples as authoritative | Report validation errors with the command used |
| Compatibility impact is unknown | Inventory existing endpoints, clients, schemas, or SDKs from repo evidence | Do not approve breaking changes without migration notes |

## Templates

### OpenAPI 3.1 Resource Endpoint (copy-paste starter)

```yaml
openapi: "3.1.0"
info:
  title: Example API
  version: "1.1.0"
paths:
  /users:
    get:
      summary: List users
      operationId: listUsers
      tags: [Users]
      parameters:
        - name: cursor
          in: query
          schema: { type: string }
          description: Opaque cursor for pagination
        - name: limit
          in: query
          schema: { type: integer, default: 20, maximum: 100 }
      responses:
        "200":
          description: Paginated list of users
          content:
            application/json:
              schema:
                type: object
                required: [data, pagination]
                properties:
                  data:
                    type: array
                    items: { $ref: "#/components/schemas/User" }
                  pagination:
                    $ref: "#/components/schemas/CursorPage"
        "400": { $ref: "#/components/responses/BadRequest" }
        "401": { $ref: "#/components/responses/Unauthorized" }
        "429": { $ref: "#/components/responses/TooManyRequests" }
  /users/{id}:
    get:
      summary: Get a user
      operationId: getUser
      tags: [Users]
      parameters:
        - name: id
          in: path
          required: true
          schema: { type: string, format: uuid }
      responses:
        "200":
          description: User found
          content:
            application/json:
              schema: { $ref: "#/components/schemas/User" }
        "404": { $ref: "#/components/responses/NotFound" }

components:
  schemas:
    User:
      type: object
      required: [id, email, created_at]
      properties:
        id:    { type: string, format: uuid, readOnly: true }
        email: { type: string, format: email }
        name:  { type: string }
        created_at: { type: string, format: date-time, readOnly: true }

    CursorPage:
      type: object
      required: [next_cursor, has_more]
      properties:
        next_cursor: { type: [string, 'null'] }
        has_more:    { type: boolean }

    Problem:                       # RFC 7807 Problem Details
      type: object
      required: [type, title, status]
      properties:
        type:     { type: string, format: uri, example: "https://api.example.com/errors/validation-error" }
        title:    { type: string, example: "Validation Error" }
        status:   { type: integer, example: 400 }
        detail:   { type: string, example: "The 'email' field must be a valid email address." }
        instance: { type: string, format: uri, example: "/users/req-abc123" }

  responses:
    BadRequest:
      description: Invalid request parameters
      content:
        application/problem+json:
          schema: { $ref: "#/components/schemas/Problem" }
    Unauthorized:
      description: Missing or invalid authentication
      content:
        application/problem+json:
          schema: { $ref: "#/components/schemas/Problem" }
    NotFound:
      description: Resource not found
      content:
        application/problem+json:
          schema: { $ref: "#/components/schemas/Problem" }
    TooManyRequests:
      description: Rate limit exceeded
      headers:
        Retry-After: { schema: { type: integer } }
      content:
        application/problem+json:
          schema: { $ref: "#/components/schemas/Problem" }

  securitySchemes:
    BearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT

security:
  - BearerAuth: []
```

### RFC 7807 Error Response (copy-paste)

```json
{
  "type": "https://api.example.com/errors/validation-error",
  "title": "Validation Error",
  "status": 422,
  "detail": "The 'email' field must be a valid email address.",
  "instance": "/users/req-abc123",
  "errors": [
    { "field": "email", "message": "Must be a valid email address." }
  ]
}
```

- Always use `Content-Type: application/problem+json` for error responses.
- `type` must be a stable, documented URI — never a generic string.
- `detail` must be human-readable and actionable.
- Extend with `errors[]` for field-level validation failures.

## Output Checklist

When delivering an API design, provide:
1. Resource model and relationships (diagram or table)
2. API style decision: REST, GraphQL, or mixed
3. For REST, endpoint specifications with URIs, HTTP methods, and OpenAPI 3.1 YAML
4. For GraphQL, schema types, operations, resolver boundaries, authorization rules, query limits, and deprecation policy
5. Authentication and authorization flows
6. Error response catalog: 4xx/5xx responses with stable `type` URIs for REST, or GraphQL error shape, partial-success behavior, and resolver authorization failures
7. Pagination and filtering patterns
8. Versioning and deprecation strategy
9. Validation result: the repository-pinned OpenAPI or GraphQL validation command passes; if no such tool exists, record degraded validation and the missing check

## Knowledge Reference

REST architecture, OpenAPI 3.1, GraphQL, HTTP semantics, JSON:API, HATEOAS, OAuth 2.0, JWT, RFC 7807 Problem Details, API versioning patterns, pagination strategies, rate limiting, webhook design, SDK generation
