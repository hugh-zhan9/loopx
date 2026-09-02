# Output Contract

## OpenAPI YAML

Default to this portable shape:

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
- Add examples at the media type, schema, or property level when verified examples exist. Keep examples schema-valid.
- Model localized or presentation enums as their actual response objects. Keep request enums in the scalar form accepted on input.
- Describe pagination defaults, maxima, normalization, and sort order; describe upload size/MIME limits and byte-based string limits where applicable.
- Model the final gateway/proxy success and error envelope, including trace IDs, compatibility fields, omitted fields, and actual HTTP status behavior.

## Markdown

Start with title, scope/base URL, authentication, shared conventions, and an endpoint summary table. Use exactly this syntax for every operation section:

```markdown
### GET /widgets/{id}

- Operation ID: `getWidget`
- Authentication: Bearer token
```

The heading must be `### METHOD /literal/path`, with no backticks around the path. The first matching Operation ID line in that section must be `- Operation ID: \`value\``. Method, path, and operation ID must exactly match the YAML.

Recommended section content:

1. Purpose and noteworthy behavior.
2. Authentication/authorization.
3. Parameters table: field name/path, location, type/format, required/nullable, description, constraints/example.
4. Request body field table and valid JSON/form example.
5. Response overview table: status, meaning, media type, body/schema.
6. A response-field table for every materially different response body.
7. Complete success response content and representative error response content.

Keep the document focused on the current callable contract. Omit commit IDs, implementation history, generator notes, and source-evidence appendices unless explicitly requested.

Use these exact fourth-level headings inside every endpoint section so completeness can be checked mechanically:

````markdown
#### Request fields

| Field | Location | Type | Required / Nullable | Description | Example |
|---|---|---|---|---|---|
| `id` | path | string | required / non-null | Widget identifier. | `wdg_123` |

#### Response fields: 200

| Field | Type | Required / Nullable | Description | Example |
|---|---|---|---|---|
| `data.id` | string | required / non-null | Widget identifier. | `wdg_123` |

#### Response content: 200

```json
{"data":{"id":"wdg_123"}}
```
````

If an operation has no request fields, keep `#### Request fields` and write `None.`. Create one `#### Response fields: <status>` and one `#### Response content: <status>` section for every materially different response body. For a bodyless response, write `No response body.` under both headings rather than fabricating fields or JSON.

Use dotted paths and array markers to make nested structures unambiguous:

```markdown
| Field | Type | Required / Nullable | Description | Example |
|---|---|---|---|---|
| `data.id` | string | required / non-null | Widget identifier. | `wdg_123` |
| `data.labels[]` | array<string> | optional / non-null | Labels attached to the widget. | `["new"]` |
| `data.owner.name` | string | required / non-null | Display name of the owner. | `Alex` |
```

For an array of objects, document both the collection (for example `data.items[]`) and every item field (for example `data.items[].id`). If success and error envelopes differ, document each separately.

Shared field tables may be defined once and linked from multiple endpoints only when the exact wire schema is identical. The endpoint must still identify which shared table applies. Do preserve required fields, descriptions, enums, formats, units, nullable/optional behavior, defaults, constraints, and pagination semantics.

## Naming

Unless the user or repository specifies names, write paired files under the repository documentation area:

```text
docs/api/<scope>.md
docs/api/<scope>.openapi.yaml
```

If the repository already has an API documentation location or naming scheme, follow it.
