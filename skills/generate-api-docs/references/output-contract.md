# Markdown Output Contract

Default to `docs/api/<scope>.md`, following the repository's existing documentation
location and naming when present. Generate no OpenAPI YAML unless explicitly
requested; the optional YAML format is in [openapi-output-contract.md](openapi-output-contract.md).

## Layout

Use the user's language and organize interfaces by business scenario. Document
each call where it is used, even when the same method/path appears in another
scenario. Each scenario must stand alone: repeat its purpose, method/path, full
applicable input/output field tables, and its own examples. Do not extract a
common endpoint chapter or replace the local description with “see common API”.
For each call, lead with a meaningful name, the
literal `METHOD /path`, and one or two sentences explaining what it does and when
to use it. State relevant prerequisites, side effects, asynchronous completion,
and limitations in plain language, based on verified behavior.

Follow with input fields, a concrete request example, output fields, and a response
example. Prefer short labels such as `入参`, `入参示例`, `出参`, and `出参示例`.
No fixed heading level, English section names, Operation ID, schema component IDs,
or endpoint summary table is required for Markdown, including when YAML is requested. Add a summary only
when it helps navigate a larger document. Put base URL
and general authentication conventions once where relevant; keep each call's
input/output envelope and field descriptions local. Avoid empty boilerplate.

Illustrative layout only: derive fields and constraints from the source, and
replace the sample request/response below with captured calls from the authorized
test environment. Never copy these illustrative values as untested examples.

````markdown
## 商品

### 查询商品详情

`GET /widgets/{id}`

按商品 ID 获取名称和标签，用于详情页展示。

**入参（Path）**

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `id` | string | 是 | 商品 ID。 |

**入参示例**

```http
GET /widgets/wdg_123 HTTP/1.1
```

**出参（HTTP 200）**

| 字段 | 类型 | 必返 / 可空 | 说明 |
| --- | --- | --- | --- |
| `id` | string | 是 / 否 | 商品 ID。 |
| `name` | string | 是 / 否 | 商品名称。 |
| `labels[]` | array<string> | 否 / 否 | 标签列表；无标签时可省略。 |

**出参示例**

```json
{"id":"wdg_123","name":"示例商品","labels":["new"]}
```
````

## One route used by two scenarios

If two verified callers both use `GET /tasks`, one with `event_family=split` and
one with `event_family=reverse_split`, write a “拆股” section and a “合股” section.
Each contains its own list-call description, the real `GET /tasks` path, input
fields with that scenario's fixed filter value, output fields, and complete
request/response examples. Do not collapse them into “公共任务列表” plus a table of
parameter differences. These are two documented uses of one HTTP operation;
do not invent separate routes or infer different response schemas from filters.

## Field coverage and examples

- Describe every input and output field, not just those shown in examples. Record
  input location by grouping Path/Query/Header/Cookie/Body fields or adding a
  location column. Show requiredness and explicit nullability separately where
  applicable; output presence may be conditional and must be explained.
- Use actual wire names, dotted paths, and array markers (`data.items[]`,
  `data.items[].id`). Document both containers and all nested/item fields. For
  maps, describe the key set or dynamic keys and the value structure.
- Keep each field's meaning, enum values, default, limits, units, format, and
  absent/null/empty/zero semantics in its description or a relevant column.
  Label business meaning that cannot be established from evidence `未说明`.
- Repeat field tables in each scenario, including the response envelope, even
  when structures are identical. A shared table link or DTO/schema name alone
  does not describe the local call. Mark fixed values, caller-selected options,
  and unused optional inputs; do not imply unused fields are forbidden by the API.
- Request and response examples must come from an actual call tested for this
  task in the relevant scenario, using real parameters and records in an authorized
  test environment. Include required inputs and the actual received response;
  never assemble a plausible example from a DTO, fixture, or guessed values.
  Redact secrets and sensitive values and label that redaction. If any requested
  scenario cannot be tested, stop the skill and report `阻断` with the reason and
  missing prerequisite. Do not write placeholders or deliver a partial document;
  keep existing documents unchanged until every requested scenario is verified.
  A short Query string is sufficient for a simple query; use JSON for a JSON
  body, and HTTP/curl when headers, multipart, or other encoding needs showing.
  Include effective public prefixes and replace path placeholders in examples.
- Show the final response envelope and actual status/media type. Use the actual
  captured response; any shortened excerpt must be explicitly labeled and remain
  faithful to the received fields and values. Partial examples never replace
  complete field tables. Document materially
  different success/error bodies within the scenario.
- Write `无入参` for no-input operations. For bodyless responses, state the actual
  status and `无响应体`; do not invent a JSON body. Explain binary/file responses
  using the actual media type and relevant headers instead of JSON examples.
- Keep error conditions and code meanings that callers need. Document common
  errors once and reference them from applicable endpoints; avoid repeated tables.

## Updates and verification

Verify all requested scenarios with actual calls before creating or updating the
deliverable. Any untestable scenario blocks the entire requested document; only
an explicit user scope change can exclude it.

Preserve intentional prose and all verified response variants while simplifying
existing documents. Preserve separate business scenarios during lancet and
humanize-doc passes; repetition across scenarios is intentional. Check each
call's method/path, field table, constraints, and examples against its caller
and the HTTP contract. Verify that every published example has matching actual-call
evidence for its scenario; DTO/schema agreement alone is insufficient. The legacy Ruby validator
requires a different Markdown layout; do not apply it to these scenario documents
or merge scenarios to pass it. This remains true when YAML is also requested.
