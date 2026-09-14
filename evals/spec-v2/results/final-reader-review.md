# Informed reader comparison: final flexible spec-v2 vs canonical spec

Baseline: `/tmp/loopx-spec-baseline-xJrXVI/`. Candidate: `/tmp/loopx-spec-flexible-ekxlgwy1/`. Reviewed the fixture and all supplied Markdown, plus baseline `CHECKS.md`, `document-check-results.json`, and `check_documents.py`. This comparison is informed, not blind. No real corporate-action repository was inspected. No implementation, rendering, or baseline check-script execution was performed; that script writes its result file, so I inspected it and used a separate read-only structural check instead.

## Findings

1. **Baseline architecture arrows contradict its stated ownership.** Baseline overview §2, lines 43–45, draws repository → handler → new projection → service; line 51 says the diagram expresses responsibilities and call relationships. The same document’s D-001 says biz owns selection and calls the repository and handler. The fixture likewise places coordination on TradingRestrictionUsecase. The diagram therefore cannot be accepted as a correct call/dependency view without changing those edges or explicitly redefining it as data movement. Candidate overview “职责保持在现有边界内” gives separate biz → repository and biz → policy call edges, labels their reuse, and retains ownership in D-001. This is a semantic improvement, not a diagram-count preference.

2. **Baseline requires readers to reconcile repeated versions of the main algorithm.** Baseline overview §3.2 recites date validation → one candidate query → policy per item → skip/select/deduplicate/sort → fail-whole. Detailed §4.1.2 expands the same rule across D-003–D-006, then §4.1.3 repeats the whole ordered algorithm again; §4.1.4 repeats its boundary outcomes. The D contracts and boundary examples contain necessary precision, but the separate five-step list adds little beyond those contracts and the overview. Candidate overview D-002 owns the runtime branch diagram; detail D-003 owns candidate conditions and exact projection, and D-004 owns wire behavior. Short failure/skip reminders remain, but there is no second complete algorithm or compulsory service/generator step chapter. No required field, error, candidate, or protected-behavior contract was lost in that reduction.

3. **Baseline author QA does not document a concrete scenario walkthrough.** Baseline CHECKS.md records mechanical checks and an author comparison of specific contracts against the fixture; it explicitly distinguishes that from implementation tests and independent review. Its detail §11.3 lists useful expected results, but labels them future implementation verification. These are valid checks and must not be dismissed as “no verification”; however, they do not tell the reader which concrete normal/exceptional scenario was actually traced or what intermediate/result observation was obtained. Candidate Verification Strategy records source-backed outcomes for TC-001–TC-007, including discarding previously collected symbols on TC-005, and separately labels future implementation tests and render limitations.

No open candidate contradiction with the fixture was found in this review. The source-identifier wording discussed during review was a clarity improvement, not demonstrated loss of a behavioral contract: the source itself uses general `delisting` in repository facts and specific `delisting-option` in TC-001. I re-read candidate overview line 61 after its edit; it now preserves both names and the other exact handler identifiers, while explicitly retaining policy dispatch instead of a whitelist.

## Reader questions

| Question | Baseline | Candidate | Evidence and interpretation |
|---|---|---|---|
| 1. Entry, skip, empty success, whole failure, normal result together | partial | supported | Baseline §3.2 and detail §4.1.3–4.1.4 collectively recover all exits, including discarding accumulated results, but its overview diagram omits branches. Candidate overview D-002 flow view shows validation, query failure, policy failure, false skip loop, restricted-empty failure, loop completion including zero candidates, and successful unique sorted result; adjacent D-002 explicitly denies partial replies. |
| 2. Shared stages and RPC/Redis divergence without false Redis access | partial | supported | Baseline detail D-006 explains both projections and overview §2 separates the Redis component, so it does not imply RPC Redis access. It lacks a single comparison exposing common candidate/policy stages; its call arrows also have the ownership defect above. Candidate detail D-003 compares common stages, source fields, transformations, ordering, destinations and examples, explicitly says the paths execute independently, and declines to invent an unspecified Redis key mapping. |
| 3. Raw values, deduplication, ordering, mutable data, internal/wire errors | supported | supported | Baseline D-002/D-006/D-008 and candidate D-003/D-004/D-005 preserve exact task.Symbol; no trimming, case folding or substitution; AAPL/AAPL.US remain distinct. Same-data determinism does not imply snapshot consistency or stable cross-request contents. Both distinguish internal 427012 details from wire Internal / error_code=427012 and leave other mappings unknown. |
| 4. Overview serves mixed readers without dense implementation details | supported | supported | Baseline §1–§5 already explains goal, mechanism, costs, protections and cooperation; exact generators and wire tables live in detail. Candidate makes runtime branches easier to locate and moves injection/signature/field details into detail; it retains necessary owner names and domain identifiers. The improvement is the more direct behavior account, not simply fewer sections. |
| 5. Avoid repeated algorithms while retaining precision | partial | supported | See finding 2. Candidate D-003 retains all repository predicates and both projections; D-004 retains request/reply shape, validation order, internal-versus-wire error table and unknowns; D-006 retains every fixed generator version and no-go-http/no-hand-edit requirements. |
| 6. One D home, working index, source traceability, status and boundaries | supported | supported | Baseline index §11.4 links ten uniquely defined D targets; candidate Design Contract Index links six uniquely defined D targets. Both preserve every AC/TC and implementation limits. Candidate states accepted exercise direction at decisions while both document headers retain pending design review; neither claims implementation approval or completion. Some baseline body cross-references are bare section/ID references, but its D index links are functional. |
| 7. Actual semantic checking versus rendering and implementation limits | partial | supported | Baseline CHECKS.md and JSON truthfully describe structural/source comparisons, no rendering and no implementation tests; they do not prove semantic walkthrough outcomes. Candidate Verification Strategy explicitly records TC inputs/outcomes and separate static-link/source checks. Candidate also states no Mermaid parser or visual render validation, and does not use missing rendering to excuse semantic checks. Neither output establishes real system correctness. |

## Fixture coverage and independent semantic checks

Both source copies are byte-identical to `evals/spec-v2/read-only-rpc.md`, SHA-256 `c3b93794d44c459c9051c35644a659e06795a9f6d627bae3d5a64fef8ab496f5`.

| Fixture acceptance | Baseline location | Candidate location | Reader result |
|---|---|---|---|
| AC-001 candidate/policy selection | detail D-004/D-005 | detail D-003, overview D-002 | US/date/deletion/status/release predicates, one unchanged query and existing policy path preserved. |
| AC-002 validation | detail D-003/D-008 | detail D-004 | Missing and malformed dates fail before repository access; internal detail is not a wire field. |
| AC-003 empty success | detail D-006/D-007 | overview D-002, detail D-003/D-004 | Zero candidates and all-false candidates are OK empty list, distinct from failed query. |
| AC-004 exact dedup/sort, changing data | overview D-002, detail D-006 | detail D-003, overview D-005 | Exact strings remain distinct; later external terminal-state changes may reduce results. |
| AC-005 exclusions | detail D-004 | detail D-003 | Includes no_action and record-only RIC exclusion, as well as the TC-004 examples. |
| AC-006 original task field | detail D-006 | detail D-003 | No decision.Symbol/normalized field substitution or Redis projection reuse. |
| AC-007 all failure cases | detail D-005/D-006/D-008 | overview D-002, detail D-003/D-004 | Repository, registry, strategy and restricted-empty errors fail whole request; successful false policy skips. |
| AC-008 preserve old contracts | overview D-001; detail D-004/D-005/D-009/D-010 | overview D-001/D-005; detail D-003/D-006 | Existing RPCs, owner/dependency, Redis, query/policy, generation and deployment boundaries retained. |

Reader trace of TC-001: AAPL.US split contributes AAPL.US; AAPL delisting-option contributes AAPL; duplicate AAPL.US symbol-change adds no new exact string; dividend and market-transfer skip; sorting yields `["AAPL", "AAPL.US"]`. Reader trace of TC-005: after collecting a valid symbol, a failed policy or restricted empty stored string terminates with error/no reply; no persistent write exists to roll back, and the temporary symbols never become a partial response. TC-002, TC-003, TC-004 and TC-007 outcomes follow the candidate table and both underlying contracts. TC-006 remains a protected-behavior obligation, not evidence that unchanged implementation passed tests.

The candidate explicitly preserves unknown real proto metadata, signatures, paths, tool output and non-date wire mappings. The baseline also records these and additionally asks to investigate load, timeout and release ownership; the fixture supplies no measured SLO or load threshold, so that extra inventory is not evidence of a missing candidate acceptance requirement. Neither document invents a snapshot, cache, lock, retry, fallback, pagination, schema or middleware to make the design work.

## Structural evidence and limits

A fresh read-only Python check found 36 candidate relative links and 17 baseline relative links resolvable, including explicit anchors, with no broken links; candidate D-001–D-006 and baseline D-001–D-010 each have one explicit definition. These numbers are diagnostic observations, not quality scores. Baseline’s auxiliary 28-check result is consistent with its script, but checks for chapters and subsections do not establish readability or detect its call-arrow contradiction.

No visual readability claim is made: diagrams were inspected as source, not rendered. No statistical conclusion or general model-quality claim follows from this single informed comparison.

## Artifact hashes at final read

- `/tmp/loopx-spec-baseline-xJrXVI/概要设计.md`: `93d8c7009767a1034d4bc0dfe4ae416efa11a7c2a7ad0cca8461690580940d3e`
- `/tmp/loopx-spec-baseline-xJrXVI/需求设计文档.md`: `da1e6f4994cec7b7fb050c307c97cd6b405e8c141a1f742f3560fb456f15823b`
- `/tmp/loopx-spec-flexible-ekxlgwy1/概要设计.md`: `efb5a6c5e27a86340fdffbc70b24b675d424c30996e4891846115353bd12d6ad`
- `/tmp/loopx-spec-flexible-ekxlgwy1/需求设计文档.md`: `38185155cc77e319d199ce274df8cb14b38197baae115acbbfa5f701df9ab384`
