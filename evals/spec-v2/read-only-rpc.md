# Read-only RPC design fixture

This fixture distills the 2026-09-07 trading-restricted-symbols design feedback.
It supplies repository facts for a controlled document exercise; it is not an
approved replacement for the corporate-action project's requirements or design.
The two evaluated skills receive this same input and no earlier design output.

## Request

Write a reviewable overview and detailed design in Chinese for the RPC below,
using the assigned skill. Do not implement, write an execution plan, or change
any real project. The direction and technical choices stated here are accepted
for this exercise; no new proposal approval is needed. Design review has not
occurred. Mark material unknowns honestly and continue the independent parts of
the draft. Use the supplied facts as repository evidence; do not claim to have
inspected files or run implementation tests that this fixture does not provide.

## Repository facts and accepted choices

- `CorporateActionInnerService` already serves cluster-internal unary gRPC.
  `HasPendingExecutionToday` and `ListClearingReconciliationDetails` must retain
  their contracts. No HTTP/Gateway exposure or auth-boundary change is requested.
- `TradingRestrictionUsecase` owns restriction policy coordination. The service
  depends on biz through small query interfaces. Add one method on this owner
  and inject it through `Service` and `InnerUsecases`; no new usecase/service.
- `TradingRestrictionRepository.ListTradingRestrictionCandidates(businessDate)`
  reads US tasks whose date matches, delete_time is null/zero, status is neither
  completed nor no_action, and restriction_released_at is zero. It performs one
  query; do not change it. Record-only RIC records are outside the task source.
- `tradingRestrictionDecisionForTask` resolves the existing handler registry and
  validates its `TradingRestriction` result. Dividend/market-transfer handlers
  return Restricted=false. Split/reverse-split/delisting/symbol-change handlers
  restrict. A registry/strategy error fails the query; do not add a type whitelist.
- Existing Redis writers use `restrictedSymbolsFromTasks`: the same candidate
  and policy stages, then decision.Symbol normalized through the existing key
  contract, deduplicated in first-seen order. The new RPC instead selects stored
  task.Symbol exactly and sorts unique strings. Do not reuse the Redis projection
  or change Redis writes, release, or gate behavior. The RPC never accesses Redis.
- Accepted corruption rule: a Restricted task with an empty stored symbol fails
  the whole RPC; do not skip it or fall back to a normalized field.
- Dates use YYYY-MM-DD and existing `validateRequiredDateLayout`. Missing/invalid
  dates produce CodeError 427012 with business_date_required/business_date_invalid.
  Existing inner wire conversion maps these to gRPC Internal, message
  error_code=427012; the internal detail is not on the wire. Other errors propagate
  through existing conversion. Do not add error-normalization middleware.
- Task statuses can change between requests through other existing workflows.
  This query creates no snapshot, lock, cache or additional consistency guarantee.
- Add `CorporateActionInnerService.ListTradingRestrictedSymbols`, request
  business_date string, reply repeated string symbols. Service maps fields and
  propagates errors; validation and selection stay in biz. A failure has no reply.
- Add an inner proto generation script using protoc 34.1, protoc-gen-go v1.31.0
  and protoc-gen-go-grpc 1.3.0, matching the existing admin script's versions;
  inner generation omits go-http. Generated code is never edited by hand.
- No new schema, jobs, pagination, calendar checks, retries, compensation, logging
  infrastructure, or outbound-call audit. Existing repository/query and handler
  policy paths remain unchanged. A deployment rolls the service out before the
  caller; rollback may return Unimplemented and the caller must treat it as failure.

## Acceptance

- AC-001: Select the candidate tasks and handler policies above for business_date.
- AC-002: Invalid or missing date fails using the existing validation contract.
- AC-003: No matching restricted tasks succeeds with an empty list.
- AC-004: Deduplicate exact stored strings and sort ascending. AAPL and AAPL.US
  are distinct. Deterministic output means the same candidate data and policies;
  it does not freeze data across requests.
- AC-005: Deleted, terminal, released, non-US and record-only records do not appear.
- AC-006: Return task.Symbol, never decision.Symbol/normalized_underlying_symbol.
- AC-007: Any repository, registry, strategy, or empty-restricted-symbol failure
  fails the whole request with no partial list. False policy results are skipped.
- AC-008: Preserve the existing RPCs, Redis behavior and candidate/handler contracts.

## Scenarios

- TC-001 (AC-001, AC-004, AC-006): Candidate tasks include AAPL.US split,
  AAPL delisting-option, another AAPL.US symbol-change, TSLA dividend and XYZ
  market-transfer. Return ["AAPL", "AAPL.US"].
- TC-002 (AC-002): Empty date or 2026/09/07 fails before the repository call.
- TC-003 (AC-003): Zero candidates or only non-restricted candidates returns OK [].
- TC-004 (AC-005): Deleted/completed/released/non-US tasks and record-only RIC
  records never contribute a symbol.
- TC-005 (AC-007): A valid candidate is followed by an invalid handler or a
  Restricted task with empty stored symbol. The result is error and no reply.
- TC-006 (AC-008): Existing RPC registrations/contracts and Redis/repository/
  handler behavior remain intact.
- TC-007 (AC-004): The same underlying candidate data produces the same ordered
  output; after a task becomes terminal, the next request may return fewer symbols.
