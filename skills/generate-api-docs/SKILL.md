---
name: generate-api-docs
description: "Write docs for existing HTTP APIs by business scenario using actual HTTP calls (接口文档). Describe all fields and polish the prose. Export OpenAPI/Apifox YAML only on request."
when_to_use: "generate-api-docs, API documentation, OpenAPI YAML, Apifox import, Markdown API docs, request fields, response fields, 接口文档, 生成 OpenAPI, Apifox YAML, 出入参文档"
metadata:
  version: "0.1.7"
---

# Generate API Docs

Document the current final HTTP contract as a support lens, not a workflow state.
Default to one concise Markdown API documentation file, `<name>.md`.
Generate `<name>.openapi.yaml` only when the user explicitly requests OpenAPI/Swagger
YAML or an Apifox import artifact. Finding an existing OpenAPI/proto source does not
select YAML output. Do not generate temporary YAML just to validate Markdown.
Do not change implementation, invent future behavior, or use GraphQL alone as proof
of HTTP operations. Use `api-designer` for new API design and `codebase-spec` for
broader current-state documentation.

## Establish scope and authority

Read repository instructions and the requested API subset. Without a named subset,
cover externally callable HTTP APIs; exclude health, metrics, debug, and internal
endpoints unless the repository treats them as public. Preserve user changes and
existing documentation conventions.

Read [source-discovery.md](references/source-discovery.md). Trace the declared
OpenAPI/proto/schema or router contract through decoders, validators, handlers,
DTOs, serializers, auth, final error encoders, and gateway/proxy adapters. Use tests
and examples as supporting evidence. The documented response is what the HTTP
client receives, not an intermediate service object.

If declared authority and executable behavior disagree, report the conflict;
do not silently publish stale prose or guess which contract should win. Mark
unresolved facts explicitly and withhold claims of completeness for that surface.

## Build a scenario inventory

For each business scenario, trace the actual caller and record its calls separately,
even when another scenario uses the same method/path. Establish purpose, method,
literal public path, authorization, parameters, request body, success and failure
responses, media types, final
envelopes, and supported examples. Distinguish scenario-fixed values and fields
actually sent from optional API fields the caller does not use. Do not invent
callers or scenario mappings when evidence is absent; report the gap. In OpenAPI
mode, each real HTTP operation retains one stable unique `operationId`.

For fields, follow the wire-contract traps and evidence checklist in the discovery
reference: actual wire names, nested/array paths, type/format, requiredness versus
nullability, descriptions, constraints, enums, limits, units, and defaults. Distinguish
absent, null, empty, and zero. A database/proto enum does not establish its response
wire representation. Do not substitute a component name for its field inventory.

## Test each scenario before writing examples

Complete actual-call verification for all requested scenarios before creating or
updating deliverable documents. For each scenario, call its actual HTTP endpoint
with real, valid parameters for that scenario in an authorized test environment.
Use the caller's method, public path, headers, query/body, and current test records;
verify the received HTTP status, final envelope, and response fields. Test each
scenario independently even when it shares a route with another scenario.

Establish the test base URL, available authentication, real input records, and
permitted actions from the task context. Use existing credential mechanisms;
do not put credentials in documents or logs. A documentation request alone does
not authorize payments, notifications, destructive operations, or other consequential
writes. Execute writes only within the authorized test scope and honor required
cleanup. Do not substitute production access when a test environment is unavailable.

Capture the actual request and response as the example evidence, including the
scenario, environment, execution time, and actual status. Sanitize secrets and
sensitive identifiers before saving or publishing; label examples that were
redacted. Preserve field names, types, constraints, and the observed behavior.
Do not invent success from an error response or silently fix returned values.

If any requested scenario cannot be tested, stop the skill immediately. This
includes missing environment, authentication, real inputs, action authorization,
or an unavailable endpoint or unexpected failure that prevents verification.
Report `阻断` with the affected scenario/interface, concrete reason, and the
prerequisite needed to resume. Do not continue generation, publish partial results,
write `未实测` placeholders, fabricate examples, or silently exclude the scenario.
Preserve existing documents unchanged. Resume only after the blocker is resolved
or the user explicitly changes the requested scope. A captured expected error
can verify an error scenario; it does not verify an intended successful call.

## Write the documentation

Read [output-contract.md](references/output-contract.md) for the default simple
Markdown layout: business grouping, endpoint purpose, method/path, input fields
and example, output fields and example. Keep all request and response field
descriptions, including nested objects and array items; simplify the presentation,
not the contract coverage. Document each scenario independently; do not merge
calls into a public/common endpoint chapter or replace field tables with links to
another scenario. Repeat the actual method/path, applicable complete field tables,
and scenario-specific examples from the tested calls wherever the interface is
called. Operation IDs and fixed English headings are not required in Markdown.

Only for an explicit OpenAPI request, read
[openapi-output-contract.md](references/openapi-output-contract.md). Produce
self-contained OpenAPI `3.1.0` YAML (preserving a compatible existing 3.1 patch
version). Markdown keeps the same independent scenario layout in both modes;
YAML uniqueness rules do not govern Markdown sections.

Keep current documentation focused on the contract, not a changelog. Preserve
useful source evidence separately from the endpoint narrative when required by the
task. Derive restrained field descriptions from observed behavior; label unknown
business meaning `未说明`. Use only sanitized request/response examples captured
from actual calls tested for this task. Fixtures, source snippets, and guessed payloads are discovery
evidence, not a substitute for execution. Never invent production data, disclose
secrets, or call production merely for examples.

In update mode, preserve intentional prose and source-backed response variants.
An existing YAML file is not permission to regenerate it: update only Markdown
unless YAML is explicitly requested, and report any known companion drift. When
updating requested YAML, preserve stable operation IDs and check each scenario
against the corresponding HTTP operation.

## Simplify and humanize before delivery

After drafting in either output mode, apply these skills in order:

1. Read [lancet](../lancet/SKILL.md) and apply its smallest-correct-change principle
   to the documents: remove redundant sections, repeated explanations, and
   unnecessary structure within each scenario. Repeated endpoint descriptions
   across business scenarios are intentional and must remain. Keep this pass
   within documentation; it does not authorize implementation changes or removal
   of required contract information.
2. Read [humanize-doc](../humanize-doc/SKILL.md) and follow its direct-rewrite mode
   and referenced readability checks. Make endpoint purposes and field descriptions
   plain and concrete; remove filler, invented jargon, and narration about writing.

Preserve every field's wire name, meaning, type, requiredness, nullability, enum,
unit, default, constraint, and error behavior, along with domain terms and examples.
When YAML is requested, keep its descriptions consistent with the applicable
scenario descriptions. Do not merge Markdown sections to satisfy YAML constraints.
Reconcile the final documents with the source inventory and run the applicable
checks below after these edits.
These are editing passes within this skill, not separate workflow states or
approval gates; no standalone polishing report is required.

## Validate and report

For Markdown, check the endpoint inventory and every field against source evidence
for each scenario, reconcile every example with its captured call evidence, verify
references, and run repository-native document or contract checks where required. Ruby and the paired validator are not
prerequisites for scenario Markdown. Do not claim automated schema/parity
validation from this source-based review.

When YAML is requested, run repository-native OpenAPI/schema checks where
available and check it against the same HTTP inventory. Validate the scenario
Markdown against its callers and source evidence independently. The bundled Ruby
validator supports the older one-section-per-operation Markdown format only;
it is not a completion gate for scenario documentation. Do not change Markdown
headings, merge scenarios, or create an extra document to satisfy that validator.
Report which checks actually ran. Structural validation does not prove runtime
behavior or a successful live import. Import into Apifox only when explicitly
in scope and available.

Report the actual output path(s), scenario/call count and distinct endpoint count,
authority, actual call coverage, checks performed, exclusions, and unresolved gaps.
Deliver only after every requested scenario has actual-call evidence. Source or
schema checks do not replace execution; missing evidence triggers the blocking
rule above. No separate generated implementation
is needed.
