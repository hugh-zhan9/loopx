# Source Discovery

Use this guide to find the real HTTP contract without assuming a language or framework.

## Search sequence

1. Read repository instructions and active API documentation.
2. List likely contract and transport files:

   ```bash
   rg --files | rg '(^|/)(api|apis|routes?|routers?|controllers?|handlers?|transport|proto|openapi|swagger|schema|spec|docs?)(/|\.|$)'
   ```

3. Search for route and contract signals:

   ```bash
   rg -n 'openapi:|swagger:|operationId:|google\.api\.http|HandleFunc|Methods\(|@(Get|Post|Put|Patch|Delete)|router\.|routes?\.|app\.(get|post|put|patch|delete)|Map(Get|Post|Put|Patch|Delete)|path\('
   ```

4. Trace each route into its request decoder/validator, handler, response serializer, error mapper, and authentication middleware.
5. Read contract and integration tests for exact wire names, status codes, envelopes, omitted fields, and examples.

Adapt searches to the repository. A generated client or generated server file is useful evidence but is not automatically authoritative.

## Common authority patterns

| Repository style | Start with | Verify against |
|---|---|---|
| OpenAPI-first | OpenAPI source, not bundled/generated copies | lint/generation config and contract tests |
| Protobuf HTTP annotations | `.proto` source and gateway mapping | JSON transcoding rules, interceptors, error mapping |
| Framework routes | router registration | validators, DTO/schema types, serializers, middleware |
| GraphQL-only | GraphQL schema | Do not translate to REST/OpenAPI unless HTTP operations are explicitly defined |
| Multiple services | per-service route roots and version prefixes | gateway/ingress rewrites and public exposure |

## Conflict handling

Classify a disagreement before writing:

- **Generated drift:** source contract and generated artifact differ. Use source and report stale generation.
- **Docs drift:** executable contract/code/tests agree and prose differs. Update documentation.
- **Runtime ambiguity:** routes, serializers, and tests disagree or no source establishes behavior. Record the unresolved item and do not invent a schema.
- **Public-boundary ambiguity:** an endpoint exists but gateway/auth configuration does not establish public reachability. Exclude it or label it internal according to repository policy.

## Evidence checklist

For every documented operation, be able to point to evidence for:

- method and effective public path, including gateway prefix/rewrites
- field wire names and requiredness
- serialization envelope and media type
- success and error status codes
- authentication/security behavior
- enum values and formats

Examples must satisfy the documented schema and should come from tests or sanitized fixtures when available.
