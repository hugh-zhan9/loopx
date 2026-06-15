---
name: api-designer
description: "Applies loopx API design discipline for REST, GraphQL, OpenAPI, resource modeling, pagination, versioning, compatibility, and error models. Not for replacing clarify, spec, implementation planning, code review, or workflow state transitions."
when_to_use: "api-designer, API design, REST, GraphQL, OpenAPI, resource modeling, pagination, versioning, API errors, compatibility, 接口设计"
license: MIT
metadata:
  version: "0.2.10"
  forked_from: https://github.com/Jeffallan/claude-skills/tree/main/skills/api-designer
  maintained_by: loopx
---

# API Designer

API design discipline for REST, GraphQL, and OpenAPI 3.1 contracts.

## loopx Boundary

`api-designer` is a support lens, not a workflow state. Use it directly when the user asks for API design help, and use it from `spec`, `exec`, `review`, or `final-review` when work touches API contracts.

This skill does not replace `clarify`, `spec`, `plan-to-exec`, `review`, or `final-review`. If product behavior, permissions, compatibility, migration, or client contract decisions are unresolved, route those decisions through `clarify` or `spec` instead of deciding them inside this skill.

## Core Workflow

1. **Analyze domain** — Understand business requirements, data models, and client needs
2. **Choose API style** — State whether the contract is REST, GraphQL, or mixed, and why that style fits the client and evolution needs
3. **Model contract surface** — For REST, identify resources, relationships, URI patterns, HTTP methods, and request/response schemas. For GraphQL, identify object types, operations, inputs, resolver boundaries, and schema evolution rules.
4. **Specify contract** — For REST, create OpenAPI 3.1 and validate with `npx @redocly/cli lint openapi.yaml`. For GraphQL, define the schema and run the project's schema validation or code generation checks.
5. **Mock and verify** — For REST, use a mock server such as `npx @stoplight/prism-cli mock openapi.yaml`. For GraphQL, exercise representative operations against the project schema or a local GraphQL test server.
6. **Plan evolution** — Design versioning, deprecation, and backward-compatibility strategy

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
- Implement pagination for all collection endpoints or collection fields.
- Version APIs with clear deprecation policies
- Document authentication and authorization
- Provide request/response examples

### MUST NOT DO
- For REST contracts, use verb-style resource URIs (use `/users/{id}`, not `/getUser/{id}`)
- Return inconsistent response structures
- Skip error code documentation
- For REST contracts, ignore HTTP status code semantics.
- Design APIs without a versioning strategy
- Expose implementation details in the API surface
- Create breaking changes without a migration path
- Omit rate limiting considerations

## GraphQL Discipline

When designing GraphQL APIs, provide the same contract rigor as REST:

- Model object types, input types, mutations, queries, and subscriptions around client use cases, not database tables.
- Define nullability, pagination, filtering, sorting, and authorization rules explicitly in the schema.
- Use stable node identifiers and connection-style pagination when clients need cursor traversal.
- Avoid unbounded nested queries; plan depth, complexity, batching, and caching controls.
- Version by additive schema evolution and documented deprecation, not parallel endpoint versions unless the product contract requires it.
- Specify error shape, partial-success behavior, and resolver-level authorization failures.

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
        next_cursor: { type: string, nullable: true }
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
9. Validation result: `npx @redocly/cli lint openapi.yaml` passes with no errors for OpenAPI contracts, or project GraphQL schema validation passes for GraphQL contracts

## Knowledge Reference

REST architecture, OpenAPI 3.1, GraphQL, HTTP semantics, JSON:API, HATEOAS, OAuth 2.0, JWT, RFC 7807 Problem Details, API versioning patterns, pagination strategies, rate limiting, webhook design, SDK generation
