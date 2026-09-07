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

Start with title, scope/base URL, authentication, shared conventions, and an endpoint summary table. Use the OpenAPI operation summary as the heading and put method/path on a separate metadata line:

```markdown
### Get a widget

- 接口 URL：`GET /widgets/{id}`
- Operation ID: `getWidget`
```

The heading must be `### <operation summary>`, matching the OpenAPI `summary`.
The interface line is `- 接口 URL：\`METHOD /literal/path\`` and the operation ID
line is `- Operation ID: \`value\``. Summary, method, path, and ID must match YAML.
These are document-format rules, not changes to the API itself.

Recommended section content:

1. Purpose and noteworthy behavior.
2. Authentication/authorization.
3. Parameters table: field name/path, location, type/format, required/nullable, description, constraints/example.
4. Complete request content using concrete, sanitized values for required inputs.
5. Response overview table: status, meaning, media type, body/schema.
6. Field tables and examples for every materially different non-default response.
7. A reference to a common default error section, when the operation defines one.

Keep the document focused on the current callable contract. Omit commit IDs, implementation history, generator notes, and source-evidence appendices unless explicitly requested.

Use these exact fourth-level headings inside every endpoint section so completeness can be checked mechanically:

````markdown
#### Request fields

| Field | Location | Type | Required / Nullable | Description | Example |
|---|---|---|---|---|---|
| `id` | path | string | required / non-null | Widget identifier. | `wdg_123` |

#### Request content

```http
GET /widgets/wdg_123 HTTP/1.1
```

#### Response fields

| Field | Type | Required / Nullable | Description | Example |
|---|---|---|---|---|
| `id` | string | required / non-null | Widget identifier. | `wdg_123` |

#### Response content

```json
{"id":"wdg_123"}
```
````

For no-input operations, write `None.` under Request fields and
`No request parameters or body.` under Request content. Otherwise provide a
non-empty fenced example. Use a `json` fence for JSON bodies (including `+json`).
When path/query/header/cookie inputs exist, also provide an `http` fence with the
concrete request line and required inputs; include the effective server base path
(operation servers override path/root servers) and replace route placeholders with
sample values. Query values may contain encoded JSON or other literal data. Multipart/form examples may use `http` or `bash`. Check binary/form data,
parameter value constraints, and serializer-specific behavior against the source;
the bundled validator does not validate every serialization or JSON Schema keyword.

Use bare `#### Response fields` and `#### Response content` for the first declared
2xx response in YAML (including `2XX`). Put the intended primary success first.
Suffix additional responses with `: <status>`. If there is no 2xx response, suffix
all response headings; do not invent success behavior. For a bodyless response,
write `No response body.` in both sections.

### Shared default errors

Keep default error fields, content, and error-code meanings in the common section
once per exact wire contract. In YAML, reference a local `components.responses`
entry from each operation's `default`. In each Markdown endpoint, add:

```markdown
- Default error: `#/components/responses/DefaultError`
```

After the endpoints, document that reference using this shape:

````markdown
## Common errors

### Default error: #/components/responses/DefaultError

#### Response fields

| Field | Type | Required / Nullable | Description | Example |
|---|---|---|---|---|
| `code` | string enum | required / non-null | FAILED: operation failed. | FAILED |

#### Response content

```json
{"code":"FAILED"}
```
````

Use the actual schema and code meanings. Different default envelopes need different
references and common sections; do not merge them by name alone. The validator
checks the referenced common fields and content against each operation's default.
Do not duplicate `Response fields: default` / `Response content: default` inside
endpoints. Explicit non-default errors still require their status-specific sections.

### Updating older Markdown

Replace `### METHOD /path` with the summary heading and interface URL line, add
request examples, use bare primary response headings, and move default errors to
referenced common sections. Preserve existing operation IDs, all response variants,
and intentional prose. The validator reports old headings as a migration error;
it does not silently accept an incomplete old document.

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
