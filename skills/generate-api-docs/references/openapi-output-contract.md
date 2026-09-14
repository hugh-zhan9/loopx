# Optional OpenAPI YAML

## OpenAPI YAML

Read this reference only when the user explicitly requests OpenAPI/Swagger YAML
or an Apifox import artifact. It governs YAML output only. Markdown remains
organized by business scenario using its own output contract.

Use this portable shape:

```yaml
openapi: 3.1.0
info:
  title: Example API
  version: 1.0.0
servers:
  - url: https://api.example.test
tags:
  - name: Widgets
paths:
  /widgets/{id}:
    get:
      tags: [Widgets]
      summary: Get a widget
      operationId: getWidget
      parameters:
        - name: id
          in: path
          required: true
          description: Widget identifier.
          schema:
            type: string
      responses:
        "200":
          description: Success
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/Widget"
components:
  schemas:
    Widget:
      type: object
      required: [id]
      properties:
        id:
          type: string
          description: Widget identifier.
```

Requirements:

- Quote response-code keys and ambiguous YAML scalars.
- Keep all `$ref` values local (`#/...`) so the file imports without companion files.
- Define security schemes under `components.securitySchemes`; apply security globally or per operation according to runtime behavior.
- Model no-content responses without a fabricated JSON body.
- Express nullable values with OpenAPI 3.1 / JSON Schema syntax such as `type: [string, "null"]` or `anyOf`; do not use `nullable: true`.
- Represent file upload/download with actual media types and binary schemas.
- Include `deprecated: true` only when the source contract declares deprecation.
- Give every request and response property a non-empty `description`.
- Encode property requiredness in the parent schema's `required` list; add `null` to the JSON Schema only when the wire value may explicitly be null.
- Add examples at the media type, schema, or property level using actual requests/responses tested for the documented scenarios. Keep examples schema-valid; do not fabricate missing examples.
- Model localized or presentation enums as their actual response objects. Keep request enums in the scalar form accepted on input.
- Describe pagination defaults, maxima, normalization, and sort order; describe upload size/MIME limits and byte-based string limits where applicable.
- Model the final gateway/proxy success and error envelope, including trace IDs, compatibility fields, omitted fields, and actual HTTP status behavior.

## Relationship to Markdown

Markdown always follows [output-contract.md](output-contract.md), including separate
complete call descriptions for every business scenario. One real operation in YAML
may correspond to several Markdown sections with different parameter values and
examples. Keep YAML operations unique without imposing that restriction on Markdown.
Do not require Markdown headings or operation IDs to match YAML summaries/IDs.
Check scenario examples and field descriptions against their applicable HTTP contract.
The legacy Ruby pair validator's Markdown restrictions do not apply to this layout.

## Naming

Use `docs/api/<scope>.openapi.yaml` when requested, alongside the scenario Markdown
at `docs/api/<scope>.md`, following existing repository naming when present.
