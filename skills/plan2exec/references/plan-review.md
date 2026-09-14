# Review an implementation plan

This review does not edit the plan or execute it. Read the plan, original approved
requirements, design and linked authoritative `概要设计.md` decisions, relevant
code and tests. Check actual progress first. If the work is implemented, review
its results and verification against the source; do not demand another readiness
review. A review-only request authorizes findings, not repairs or status changes.

For an independent reviewer, include:

> You are a read-only leaf reviewer. Do not modify files, spawn helpers, or execute
> the plan. Report findings with evidence and consequences. Judge their importance
> independently.

## What to check

- Compare each accepted outcome and applicable AC/D/TC scenario with the proposed
  behavior and expected verification. Matching IDs alone are not coverage. A
  deferred requirement needs explicit source-owner authorization.
- Preserve non-goals, public behavior, data and permission rules. A new architecture
  decision belongs in `spec`; inspect reuse, owning modules, dependency direction,
  state and fault boundaries using [the architecture contract](../../shared/architecture-conformance.md).
- For a `schema: loopx-plan/v1` plan, check slice IDs, dependencies and progress
  against the body and actual work. Missing or conflicting information matters
  when it leaves the executor unable to choose safe work, not because a heading
  or field differs from a template.
- Check producer/consumer ordering and shared resources, including generated
  output and migrations. Disjoint files do not prove independence. Serialize
  conflicting work when that preserves the approved result; do not force redesign
  merely because the initial plan claimed parallelism.
- Check whether verification can detect a failure of the original requirement.
  Tests that restate the implementation do not establish acceptance. For persisted
  concurrent state, apply [the database concurrency contract](../../shared/database-concurrency.md).

## Findings and follow-up

A blocking finding names the source or repository evidence, the concrete failure
or unapproved change, and the affected work. Examples include losing a required
result, breaking a consumer, unsafe migration order, unauthorized data changes,
or overlapping shared-state writes. Missing evidence blocks only when the missing
fact is necessary for safe execution. An unreadable source can be such a blocker.

Heading names, table layout, wording, an absent schema label with otherwise clear
meaning, and local implementation choices are not blockers. List useful suggestions
briefly. The owner can fix unambiguous metadata and add necessary local paths after
checking dependencies and overlap; do not turn that into an approval round.

Report actual findings, source coverage, relevant architecture and dependency
risks, and whether affected work can proceed. Do not manufacture a finding or
populate every category when there is no problem. The pending review itself is
not a finding.

After the first complete review, check fixes and affected decisions only. Earlier
resolved findings stay resolved unless new evidence contradicts them. New material
problems must still be reported with their evidence; wording preferences do not
restart the review. Unaffected safe work need not wait for an unrelated finding.
Record results in the same plan when its owner applies them. Review is complete
when findings are resolved or their remaining effect on work is explicit, not when
every optional suggestion has been adopted.
