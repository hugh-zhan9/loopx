# Release Runbook Template

Use this as a coverage guide, not a requirement to fill unrelated sections.
Keep an existing document's useful structure. Remove irrelevant detail or record
why a category does not apply. Replace prompts with evidence, an explicit unknown,
or a concrete remaining action. Do not copy example business fields or historic
environment values into a new release.

## Release identity and outcome

- Intended outcome and links to original requirements/accepted decisions.
- Repository/service, source branch and commit, target branch and observed commit,
  comparison base, final integrated candidate and artifact when available.
- Target environment and verified resource identities; inspection time/timezone.
- Preparation, deployment and acceptance results separately; blockers and owner
  when known. State whether this document currently records preparation or execution.

## Change scope and protected behavior

Summarize the release increment, target-only changes to retain, affected callers,
and excluded changes. Link source evidence and relevant checks. Include each
repository's fixed version when a release spans services. Record outstanding
workspace changes that are not in the candidate.

## Prerequisites by environment

| Target / item | Expected state | Observed state and check time | Evidence | Status / remaining action |
|---|---|---|---|---|

Use verified, pending, unknown, or not applicable with a reason. Include only
categories relevant to the change:

- Database: actual database/version, columns/indexes and definitions, historical
  values/backfill, migration script, repeatability, locking/algorithm constraints,
  and pre/post queries. Distinguish schema preparation from data migration.
- Configuration: actual application/namespace/key or file, desired delta,
  published vs draft values, permissions and conflicting pending edits. Preserve
  unrelated configuration; verify effective values after publication.
- Dependencies: service identity/discovery, versions, connectivity, credentials
  availability without values, storage and access permissions.
- Callers: affected APP/H5/admin/services, protocol or generated-code versions,
  existing client behavior and rollout coordination.
- Operations: jobs, feature flags, resource capacity or traffic controls when
  the change requires them. Name real controls and owners, not assumed switches.

Record each environment independently. Prefer one target for a single rollout;
use multiple columns or rows when cross-environment preparation is requested.

## Release order and stop conditions

| Step / target | Prerequisites | Operation / script / executor | Success evidence | Failure response / safe resume | Result |
|---|---|---|---|---|---|

Include migration/configuration, final candidate checks, caller coordination,
rollout, actual running-version verification, and business acceptance as applicable.
State the effects of mixed old/new instances, required write controls and when
they can be lifted. A failed step blocks its dependents, not unrelated work.
Commands must come from the project's actual tools and specify the intended
target. An unresolved command is pending work, not an executable placeholder.

## Acceptance

| Scenario / source requirement | Expected observable result | Method / authorized inputs | Actual result / evidence / time |
|---|---|---|---|

Cover changed behavior and protected callers, including relevant failures,
historical data and boundary cases. Identify local-test, read-only environment,
and business-write coverage separately. Name authorized test records and write
scope when required; never count an unperformed write test as passed.

## Rollback or forward repair

Name the usable application/client artifacts and activation conditions. Explain
schema, data and configuration compatibility, mixed-version behavior, irreversible
steps and required coordination. Record recovery operations and their verification;
if rollback is invalid, state the forward-repair path and remaining decisions.
Keep application reversal distinct from destructive data/schema cleanup.

## Execution evidence and remaining work

Record each action's target, time, exact version/job/configuration revision when
available, outcome and bounded evidence link. Preserve failed/partial outcomes.
On interruption, state the last verified checkpoint, uncertain effects to inspect,
remaining prerequisites and next safe action. Link the detailed release report
when present, and reconcile its outcome with this document's preparation status.
