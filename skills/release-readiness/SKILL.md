---
name: release-readiness
description: "Prepare or review a release runbook and follow it for authorized deployment or resumption (上线准备、发布清单、上线执行). Covers branch scope, environment prerequisites, operation order, acceptance, and rollback."
metadata:
  version: "0.1.0"
  when_to_use: "release preparation, deployment runbook, rollout readiness, execute an existing release document, resume a release, 上线, 部署, 上线准备, 发布前检查, 按文档上线"
---

# Release Readiness

Maintain a release runbook that connects the intended change to target-environment
prerequisites, ordered operations, acceptance, and recovery. The model follows the
document with host-native tools; this skill adds no execution runtime.

## Match the request

- Preparation: inspect sources and available environment evidence, then write or
  update the runbook. Preparation alone does not authorize external mutations.
- Review only: compare the supplied document with sources and evidence; report
  findings without editing or executing it.
- Execution or resume: read the runbook, refresh affected facts, and perform the
  authorized operations with verification and progress recorded in that document.
  If no runbook exists, prepare a concise one first within the same task.

Use an existing release document in place. Otherwise follow the repository's
convention, defaulting to `docs/releases/YYYY-MM-DD-<topic>.md`. Use the user's
language. Read [references/runbook-template.md](references/runbook-template.md)
when preparing or assessing coverage; adapt its depth to the release.
Every release handled by this skill needs an actionable document, but a small
release can use a short checklist with justified not-applicable entries.

## Establish the release scope

Read the original request, approved requirements and decisions, repository rules,
affected code, direct callers, migrations, configuration, and relevant tests.
Resolve discoverable facts yourself. Use `clarify` or `spec` only for unresolved
intent, permission, compatibility, data, or ownership decisions that would change
the release; keep independent investigation moving.

Record the repository, source and target branches, observed commits, comparison
base, uncommitted changes affecting the candidate, and intended environment.
Distinguish change since the common ancestor from the target's own changes; do
not mistake an old feature branch's missing mainline work for intended deletion.
The actual integrated candidate needs its own fixed commit and relevant checks.
Do not infer release scope or deployed version from branch names or doc location.
For multiple repositories, record each candidate and their ordering constraints.

Derive prerequisites from the actual change: database structure and historical
data; configuration and translations; secrets, permissions and connectivity;
protocols, generated code and dependency versions; clients and downstream services;
jobs, flags and traffic controls. Investigate only applicable categories. Reuse
existing repository and environment tooling, including available operational skills;
do not assume a particular provider, database, platform, maintenance switch, or CLI.

## Write concrete prerequisites and operations

For each applicable prerequisite, record expected state, observed state, target,
check time, evidence and remaining action. Separate verified, pending, unknown,
and not applicable. Query failure means unknown, not absent. Test, QA and production
are independent targets; one environment's success proves nothing about another.
Historical reports are dated evidence, not current environment observations.

For each release action, identify its exact target, prerequisites, operation or
script, executor when relevant, success check, failure/stop condition, and safe
resume behavior. Use commands and configuration paths supported by inspected
tooling; leave unresolved details explicit instead of inventing commands.

Determine migration/configuration/application/client order from compatibility.
Check old/new readers and writers, historical records, rolling mixed versions,
and whether traffic must be controlled. Record concrete controls when needed;
do not add a universal outage window or assume DDL can be repeated safely.
Record when changes become irreversible, valid rollback artifacts, data/config
compatibility, and when forward repair is required. An application rollback does
not implicitly authorize deleting columns, data, files, or configuration.

Acceptance follows the original requirement and affected behavior: relevant normal,
failure, historical-data, boundary and caller scenarios, plus protected target
behavior. Distinguish local tests, deployment readiness, read-only smoke tests,
and real business writes. A healthy Pod does not prove business acceptance.
Keep secrets, personal data and signed access URLs out of evidence attachments.

## Execute and resume from evidence

A runbook is not authorization. Check the session's actual permissions for Git,
database, configuration, deployment and business writes; preserve existing
authorization and do not ask again for the same authorized action. Before an
unapproved operation, finish independent authorized preparation and identify the
exact missing permission. A document's ready label does not override a blocker.

Before execution or resumption, compare the current candidate and environment
with the recorded checkpoint. Refresh changed or volatile prerequisites and recheck
affected acceptance and rollback compatibility. Keep still-valid evidence; do not
restart every check merely because time passed or another message arrived.
If scope or prerequisites changed, update the document before dependent actions.

Follow prerequisite order and verify each action's outcome before dependent work.
Record the operation, target, time, result and evidence promptly. For a timeout,
partial migration or interrupted rollout, inspect actual state before retrying;
do not blindly replay completed or uncertain writes. Stop affected work when a
required prerequisite fails, outcome is unknown, candidate differs, or acceptance
fails. Preserve the checkpoint and continue only independent authorized work.

## Close with the actual result

Update preparation status and execution results in place; keep historical
observations dated rather than silently relabeling them as fresh. Link an existing
release report for lengthy evidence instead of creating a competing status source.
Report the runbook path, exact deployed version when observed, checks actually
completed, unresolved items, and the next safe action for an interrupted release.
Separate prepared, deployed and accepted outcomes. Do not mark the release complete
while required acceptance remains unverified or silently defer it.
