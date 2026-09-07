---
name: maintain-project-docs
description: "Audits and reconciles repository documentation so current authority is explicit, complex modules have at most one maintained current document, and superseded plans, designs, reviews, or memory are archived and excluded from default retrieval. Use when agents are being misled by stale or conflicting docs, documentation has accumulated dated duplicates, or a repository needs source-of-truth cleanup. Not for prose polishing, current-state spec generation, future design, or implementation planning."
metadata:
  version: "0.1.1"
  when_to_use: "stale docs, conflicting documentation, source-of-truth cleanup, archive superseded documents, AGENTS.md current decisions, one current doc per module, 文档收敛, 旧文档归档, 文档权威整理"
---

# Maintain Project Docs

Audit and reconcile document authority so current guidance is discoverable and
superseded material cannot silently steer work. An audit-only request produces
findings; a cleanup request authorizes the relevant repository edits. This skill
does not decide new product, compatibility, data, security, or architecture policy.

## Classify authority before moving files

Read user rulings, applicable repository guidance, active documents, and the
code/tests/configuration relevant to high-impact claims. Inspect retrieval rules
or memory indexes when available and relevant; an external index is not the sole
source of a current contract.

Distinguish:

- Current rulings and approved sources: goals and constraints for the task.
- Repository guidance and maintained module documents: current authority and navigation.
- Code, schemas, protocols, configuration, and tests: current behavior evidence.
- Runbooks and product inputs: their distinct operational and input roles.
- Active plans, proposals, and reviews: in-use work artifacts, including pending
  decisions and recovery state. Keep them available while work depends on them.
- Completed or superseded plans, proposals, reviews, snapshots, and memory: history.

Age, filename, or document type alone does not establish obsolescence. When intent
and behavior disagree, record the contradiction and obtain the missing ruling if
choosing authority would change the contract. Use `clarify` or `spec` for that
separate decision; do not choose by recency or majority vote.

## Reconcile the smallest maintained surface

1. Inventory in-scope documents, active references, retrieval inputs, and the
   current authority map. Preserve unrelated user edits.
2. Keep cross-cutting guidance in `AGENTS.md`/`CLAUDE.md` and at most one maintained
   current narrative per complex module. Protocols, schemas, runbooks, and active
   task artifacts retain their established roles and paths.
3. Merge still-valid detail into its owning document in place. Avoid dated `latest`
   replacements or a new governance document just to describe the cleanup.
4. Archive completed or superseded material using the repository convention,
   otherwise `docs/archive/<original-relative-path>`. Preserve history and check
   destination collisions before moving; never overwrite an unrelated archive.
5. Repair active links to current sources. Archive links belong only to explicit
   historical discussion. Preserve still-needed active handoff and recovery links.
6. Exclude archived/process-only history from default retrieval using existing
   ignore mechanisms. Keep active work retrievable. Refresh indexes within the
   authorized scope; external deletion or ingestion requires its own applicable
   authorization. Never permanently purge history without explicit authorization.

Archive before delete. If classification or destructive scope is materially
ambiguous, identify the exact unresolved choice before moving or rewriting it.
This does not require confirmation for routine, evidenced, reversible cleanup.

## Verify and report

Resolve links and code/schema/test anchors affected by the cleanup, inspect default
retrieval inputs, and review the diff for semantic loss. Run repository-required
documentation/package checks, tests, and `git diff --check`. Distinguish baseline
failures and uninspected areas from claims about the completed scope.

Report the current-authority map, archive manifest, retrieval changes, verification,
and unresolved contradictions as applicable. A focused cleanup needs no exhaustive
repository-wide manifest. Use `doc-readability` for prose, `codebase-spec` for a
current-state specification, and `spec` for future design.
