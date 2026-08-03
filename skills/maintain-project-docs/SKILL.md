---
name: maintain-project-docs
description: "Audits and reconciles repository documentation so current authority is explicit, complex modules have at most one maintained current document, and superseded plans, designs, reviews, or memory are archived and excluded from default retrieval. Use when agents are being misled by stale or conflicting docs, documentation has accumulated dated duplicates, or a repository needs source-of-truth cleanup. Not for prose polishing, current-state spec generation, future design, or implementation planning."
metadata:
  version: "0.1.0"
  when_to_use: "stale docs, conflicting documentation, source-of-truth cleanup, archive superseded documents, AGENTS.md current decisions, one current doc per module, 文档收敛, 旧文档归档, 文档权威整理"
---

# Maintain Project Docs

Keep repository guidance and active documents aligned with current evidence.
Preserve history without allowing it to steer ordinary agent decisions.

## Boundary

This skill does not decide unresolved product intent, compatibility, data,
security, or architecture questions. Route those questions to `clarify` or
`spec` before changing the repository's declared authority.

Do not use this skill to improve one document's prose (`doc-readability`),
reverse-engineer current behavior (`codebase-spec`), design future behavior
(`spec`), or write an implementation plan (`plan2exec`). Do not create a new
governance document merely to describe the cleanup process.

## Evidence Order

Read applicable repository guidance and the user's named sources first. Then
inspect active docs, code, tests, protocols, schemas, configuration, runbooks,
Git history, and available project memory or retrieval indexes.

Treat evidence according to its role:

1. Current user rulings and explicitly approved sources override repository
   defaults.
2. Repository guidance records current cross-cutting decisions and navigation.
3. Protocols, schemas, configuration, tests, and implementation show current
   observable behavior; they do not silently settle contrary future intent.
4. Maintained module docs hold detailed current contracts that do not fit in
   repository guidance.
5. Runbooks, deployment configuration, and product inputs keep their distinct
   operational or input roles.
6. Plans, proposals, reviews, snapshots, and superseded decisions are history.

When active intent and current behavior disagree, record the contradiction and
stop if choosing either side would change product behavior. Do not resolve it
by file date, filename, confidence, or majority vote.

## Workflow

### 1. Inventory before editing

- Enumerate documentation, guidance files, memory sources, and retrieval rules.
- Search active references to dated, superseded, draft, proposal, plan, review,
  memory, and snapshot material.
- Compare high-impact claims with their implementation or contract anchors.
- Produce an authority map: current authority, active operations, product
  input, historical evidence, and unresolved contradictions.

Do not mutate when the user requested only an audit or recommendation.

### 2. Choose the smallest stable current surface

- Keep cross-module decisions and navigation in the applicable repository
  guidance file, such as `AGENTS.md` or `CLAUDE.md`.
- Keep at most one stable, non-dated current document per complex module when
  guidance alone would become too large. Simple modules may need no module doc.
- Update current documents in place. Do not create `latest`, `v2`, or dated
  replacements for facts that belong in the maintained document.
- Keep executable configuration, protocols, schemas, runbooks, and product
  inputs in their established locations and name their authority precisely.

If classification or destructive scope is materially ambiguous, get an
explicit ruling before moving or rewriting files.

### 3. Reconcile and archive

- Update repository guidance first so the current decision hierarchy is clear.
- Merge still-valid detail into the maintained module document without copying
  implementation history into it.
- Archive before delete. Preserve original relative structure under the
  repository's existing archive convention, or default to
  `docs/archive/<original-relative-path>`.
- Move completed plans, implemented proposals, obsolete snapshots, reviews,
  and historical memory out of the active decision surface.
- Update active references to current stable paths. Do not make active docs
  depend on archive paths except for explicit historical analysis.

### 4. Isolate retrieval

- Exclude archive and process-only material from default agent search, semantic
  indexing, or project-memory ingestion using the repository's existing ignore
  mechanism.
- Refresh indexes after structural changes.
- Remove stale indexed entries only with reversible deletion when available.
  Never permanently purge history without explicit authorization.
- Keep current decisions in the repository source of truth; do not rely on an
  external memory index as the only maintained copy.

### 5. Verify the result

- Confirm active docs contain no stale paths or superseded decision language.
- Resolve every active link and every named code, protocol, schema, config, and
  test anchor.
- Confirm archived files are absent from default retrieval inputs.
- Review the diff for accidental semantic changes and unrelated user work.
- Run repository documentation guards, package validation, `git diff --check`,
  and the repository-required test suite with fresh output.

## Output Contract

Report the resulting current-authority map, the archive manifest, retrieval or
memory changes, verification evidence, and any unresolved contradiction. State
clearly when test failures predated the documentation work. Do not claim that
all documentation is current when uninspected or ambiguous areas remain.
