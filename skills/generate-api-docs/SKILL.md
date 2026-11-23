---
name: generate-api-docs
description: "Document existing HTTP APIs by business scenario using real tested HTTP calls (接口文档). Export OpenAPI/Apifox YAML only on request."
disable-model-invocation: true
metadata:
  version: "0.2.0"
  when_to_use: "generate-api-docs, HTTP API docs, OpenAPI YAML, Apifox import, 接口文档, 出入参文档"
---

# Generate API Docs

Document the current, executable HTTP contract by business scenario. Default
output is one concise Markdown file (`<name>.md`). Generate `<name>.openapi.yaml`
only when the user explicitly requests OpenAPI/Swagger or Apifox YAML. Do not
modify implementation code or invent future behavior.

## 1. Trace actual HTTP contracts

Read [source-discovery.md](references/source-discovery.md) and trace declared
routes/proto/schemas through decoders, validators, handlers, DTOs, serializers,
auth, and error encoders. Document what the HTTP client actually receives, not
an intermediate service object. If docs/schemas conflict with executable code,
report the conflict instead of guessing.

Group by business scenario. Record every scenario's calls independently even
when two scenarios share a method/path. Capture literal public path, method,
auth, request/response fields (including nested objects, array items,
requiredness vs nullability, enums, units, limits, defaults), and actual
status/error envelopes. Label unknown business meaning `未说明`.

## 2. Hard gate: real HTTP call verification before writing docs

Before creating or updating output files, call every requested scenario's
actual HTTP endpoint with real, valid inputs in an authorized test environment:

- Confirm base URL, credentials (never print secrets in docs/logs), real test
  records, and permitted write scope. Never call production just for examples.
- Test each scenario independently and capture the real request/response
  (sanitize secrets and mark redacted examples).
- **Fail closed (`阻断`):** if ANY requested scenario cannot be tested (missing
  environment, auth, valid input, write permission, unavailable endpoint, or
  unexpected error), **stop immediately**. Report `阻断` with the affected
  scenario, exact reason, and prerequisite to resume. Leave existing docs
  untouched — never publish partial results, `未实测` placeholders, or
  fabricated examples.

## 3. Write, polish, and validate

- Follow [output-contract.md](references/output-contract.md) for the scenario
  Markdown layout (repeat full field tables and tested examples per scenario;
  never collapse shared routes into a link to another scenario).
- For explicit YAML requests only, also follow
  [openapi-output-contract.md](references/openapi-output-contract.md) (OpenAPI
  `3.1.0`, unique `operationId`, while keeping Markdown scenario-independent).
- Edit prose for plain, concrete wording without dropping any wire name, type,
  nullability, enum, unit, constraint, or tested example.
- Reconcile every documented field and example against source and captured call
  evidence, run repository-native schema checks if available, and report output
  path(s), scenario/endpoint counts, actual call coverage, and any gaps.
