# Support Lens Skills Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use loopx:subagent-exec (recommended) or loopx:exec to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Source:** Conversation requirements from 2026-06-15: migrate `requirement-analyzer` from `AI-Content-Space/agent-skills`; migrate the latest `api-designer`, `architecture-designer`, `cli-developer`, and `sql-pro` content from `https://github.com/Jeffallan/claude-skills/tree/main/skills`; create loopx `sql-style` by fusing selected `sql-pro` guidance with existing loopx SQL/data discipline; do not create new workflow nodes.

**Goal:** Add five governed loopx bundled support skills while preserving the existing loopx workflow model.

**Architecture:** Keep the core workflow unchanged. Add `requirement-analyzer` as a user-invoked support skill similar to `doc-readability`, and add `api-designer`, `architecture-designer`, `sql-style`, and `cli-developer` as support lenses similar to `go-style`/`kratos`. `api-designer`, `architecture-designer`, and `cli-developer` should be adapted from Jeffallan's latest upstream skill content, preserving useful reference files while adding loopx support-lens boundaries. `sql-style` should be a fused loopx lens derived from Jeffallan's latest `sql-pro` plus existing loopx SQL/data rules; do not delete other skills' content just because `sql-style` exists, and update related skills to call `sql-style` when SQL/database discipline is relevant.

**Tech Stack:** Node.js ESM CLI, markdown skill files with YAML frontmatter, npm package `files`, loopx plugin skill mirror, `scripts/verify-skills.mjs`, `node:test`.

---

## File Structure

- Modify `src/install-discovery.mjs` to add the new bundled skill names to `LOOPX_SKILLS`.
- Modify `package.json` to include the new `skills/<name>/` directories in the exact published skill surface.
- Modify `skills/RESOLVER.md` to route these skills and define their support-lens boundaries.
- Modify `README.md`, `README.zh-CN.md`, and `docs/loopx/design/loopx-skill-suite-v1-design.md` to document the expanded support surface without changing the core flow.
- Create `skills/requirement-analyzer/SKILL.md`.
- Create `skills/api-designer/SKILL.md` and copy/adapt its upstream reference files from Jeffallan.
- Create `skills/architecture-designer/SKILL.md` and copy/adapt its upstream reference files from Jeffallan.
- Create `skills/sql-style/SKILL.md` and copy/adapt useful upstream `sql-pro` reference files under `skills/sql-style/references/`.
- Create `skills/cli-developer/SKILL.md` and copy/adapt its upstream reference files from Jeffallan.
- Mirror each new skill directory under `plugins/loopx/skills/<name>/`.
- Modify existing related skills such as `skills/kratos/SKILL.md` when they should explicitly use `sql-style`; mirror those changes under `plugins/loopx/skills/`.
- Modify `scripts/verify-skills.mjs` only if an existing public-doc alignment assertion must be updated for the expanded support-skill list.
- Add or update tests in the existing install/governance test files only if current tests do not already catch the new bundled surface.

## Task 1: Add Failing Governance Coverage For New Bundled Skills

**Files:**
- Modify: `src/install-discovery.mjs`
- Modify: `package.json`
- Modify: `skills/RESOLVER.md`

- [ ] **Step 1: Run the current skill governance check before changes**

Run:

```bash
node scripts/verify-skills.mjs
```

Expected: PASS, ending with output similar to:

```text
ok: verified 16 loopx bundled skills
```

- [ ] **Step 2: Add new skill names to the bundled list first**

In `src/install-discovery.mjs`, update `LOOPX_SKILLS` from:

```js
const LOOPX_SKILLS = [
  'clarify',
  'spec',
  'plan-to-exec',
  'subagent-exec',
  'exec',
  'review',
  'final-review',
  'fix-review',
  'finish',
  'refactor-plan',
  'debug',
  'tdd',
  'verify',
  'doc-readability',
  'go-style',
  'kratos',
];
```

to:

```js
const LOOPX_SKILLS = [
  'clarify',
  'spec',
  'plan-to-exec',
  'subagent-exec',
  'exec',
  'review',
  'final-review',
  'fix-review',
  'finish',
  'refactor-plan',
  'debug',
  'tdd',
  'verify',
  'doc-readability',
  'requirement-analyzer',
  'go-style',
  'kratos',
  'api-designer',
  'architecture-designer',
  'sql-style',
  'cli-developer',
];
```

- [ ] **Step 3: Run governance check to capture the intended failure**

Run:

```bash
node scripts/verify-skills.mjs
```

Expected: FAIL with the first missing published directory assertion, similar to:

```text
AssertionError [ERR_ASSERTION]: npm package missing bundled skill requirement-analyzer
```

This failure proves the installer/governance path sees the new skills.

- [ ] **Step 4: Add package publishing entries**

In `package.json`, add these entries beside the other explicit `skills/` entries:

```json
"skills/requirement-analyzer/",
"skills/api-designer/",
"skills/architecture-designer/",
"skills/sql-style/",
"skills/cli-developer/",
```

Keep `package.json.files` explicit. Do not add broad `"skills/"`.

- [ ] **Step 5: Add placeholder resolver rows to keep the next failure focused on missing files**

In `skills/RESOLVER.md`, under `## Support Skills`, add rows:

```markdown
| Existing requirement, PRD, spec, or feature brief needs ambiguity, gap, impact, feasibility, or readiness analysis | `skills/requirement-analyzer/SKILL.md` |
| REST/GraphQL API design, resource modeling, OpenAPI, pagination, versioning, or API error model discipline | `skills/api-designer/SKILL.md` |
| System architecture, ADRs, NFRs, scalability, failure modes, or technology tradeoff discipline | `skills/architecture-designer/SKILL.md` |
| SQL queries, schema changes, indexes, migrations, database dialects, or query performance discipline | `skills/sql-style/SKILL.md` |
| CLI command design, flags, human/JSON output, interactive vs non-interactive behavior, help text, or CLI UX discipline | `skills/cli-developer/SKILL.md` |
```

Update the support-lens disambiguation sentence from:

```markdown
13. Treat `tdd`, `debug`, `verify`, `doc-readability`, `go-style`, and `kratos` as support lenses unless the user explicitly invokes them directly.
```

to:

```markdown
13. Treat `tdd`, `debug`, `verify`, `doc-readability`, `requirement-analyzer`, `go-style`, `kratos`, `api-designer`, `architecture-designer`, `sql-style`, and `cli-developer` as support lenses unless the user explicitly invokes them directly.
14. `requirement-analyzer` may produce a requirements gap report, but it must not advance loopx workflow state. Use its output as source material for a later `clarify`, `spec`, or `plan-to-exec` step only when the user asks.
15. `api-designer`, `architecture-designer`, `sql-style`, and `cli-developer` add domain discipline to `spec`, `exec`, `review`, and `final-review`; they do not replace those workflow skills or create additional workflow states.
```

- [ ] **Step 6: Run governance check again**

Run:

```bash
node scripts/verify-skills.mjs
```

Expected: FAIL with missing root skill file, similar to:

```text
AssertionError [ERR_ASSERTION]: requirement-analyzer root SKILL.md missing
```

- [ ] **Step 7: Commit the red governance state**

Do not commit this intentionally failing intermediate state unless the repository convention requires red/green commits. If committing red states is not acceptable, skip the commit and continue to Task 2.

## Task 2: Create `requirement-analyzer` As A Support Skill

**Files:**
- Create: `skills/requirement-analyzer/SKILL.md`
- Create: `plugins/loopx/skills/requirement-analyzer/SKILL.md`

- [ ] **Step 1: Create the root skill file**

Create `skills/requirement-analyzer/SKILL.md` with this content. Set `metadata.version` to the current `package.json.version`.

```markdown
---
name: requirement-analyzer
description: "Reviews existing requirements, PRDs, specs, and feature briefs for ambiguity, missing business closure, impact, feasibility, and development readiness. Not for changing workflow state, inventing business decisions, writing implementation plans, or editing code."
when_to_use: "requirement-analyzer, PRD review, requirement gaps, feasibility review, ambiguity analysis, development readiness, 需求分析, 需求缺口"
metadata:
  version: "0.2.9"
---

# Requirement Analyzer

## Purpose

`requirement-analyzer` reviews an existing written requirement and produces a gap report or readiness assessment. It is a support skill like `doc-readability`: users can invoke it directly, and loopx workflow skills may use its output as source material later, but this skill does not advance workflow state.

Do not turn this skill into `clarify`, `spec`, or `plan-to-exec`. If analysis shows the requirement is not ready, report the gaps. If the user later wants to proceed, route that separate request through the normal loopx flow.

## Inputs

Accept one primary input:

- a document path
- pasted document content
- a URL or external document the agent can read with available tools

Optional inputs:

- repository root for narrow context lookup
- analysis depth: `quick`, `standard`, or `deep`
- output mode: `gap_checklist` or `analysis_report`
- output path

If no source document or content is available, stop and ask for it.

## Analysis Rules

- Do not invent missing business facts. Mark them as unknowns.
- Separate facts, inferences, and assumptions.
- Every P0 or P1 issue must cite evidence from the requirement or nearby repo context.
- Keep repository scanning narrow. Read only directly related docs, interfaces, schemas, or code paths.
- Prefer concrete follow-up questions over broad requests for more detail.
- Do not treat every API, schema, or implementation detail as a PRD defect when it clearly belongs in technical design.

## Priority Levels

- `P0`: Blocks design or implementation. Key behavior, ownership, timing, failure handling, contract, permission, or acceptance rule is missing or contradictory.
- `P1`: Does not block kickoff, but creates major design uncertainty, integration risk, or likely rework.
- `P2`: Clarity, operability, UX, or maintenance issue that should be improved but does not block work.

## Review Dimensions

### Business Closure

Check whether the requirement has a complete loop:

```text
input -> process -> output -> feedback
```

Look for missing actors, triggers, success events, failure handling, ownership, and user-visible completion states.

### Ambiguity

Find terms, quantities, timing, permissions, integrations, and acceptance criteria that can be interpreted more than one way.

### Impact

Identify affected users, systems, APIs, data, permissions, migrations, operations, analytics, and rollback concerns.

### Feasibility

Call out technical, product, operational, legal, data-quality, schedule, or dependency risks that would change design or planning.

### Development Readiness

State whether the requirement is ready for:

- `clarify`
- `spec`
- `plan-to-exec`
- blocked pending owner decisions

This is a recommendation only. Do not create workflow artifacts unless the user separately asks.

## Output

Default to a markdown report with this structure:

```markdown
# Requirement Analysis

## Summary

## Readiness Recommendation

## P0 Blockers

## P1 Major Risks

## P2 Improvements

## Facts

## Inferences

## Assumptions

## Follow-Up Questions

## Suggested Next Step
```

If writing to disk, use a sibling file next to the source document when practical:

- `需求缺口清单.md` for gap reports
- `需求分析报告.md` for narrative analysis
```

- [ ] **Step 2: Mirror it to the plugin**

Run:

```bash
mkdir -p plugins/loopx/skills/requirement-analyzer
cp skills/requirement-analyzer/SKILL.md plugins/loopx/skills/requirement-analyzer/SKILL.md
```

- [ ] **Step 3: Run governance check**

Run:

```bash
node scripts/verify-skills.mjs
```

Expected: FAIL with the next missing skill, similar to:

```text
AssertionError [ERR_ASSERTION]: api-designer root SKILL.md missing
```

- [ ] **Step 4: Commit**

Run:

```bash
git add src/install-discovery.mjs package.json skills/RESOLVER.md skills/requirement-analyzer plugins/loopx/skills/requirement-analyzer
git commit -m "feat: add requirement analyzer support skill"
```

Expected: commit succeeds.

## Task 3: Create `api-designer` As An API Discipline Lens

**Files:**
- Create: `skills/api-designer/SKILL.md`
- Create: `skills/api-designer/references/*.md`
- Create: `plugins/loopx/skills/api-designer/SKILL.md`
- Create: `plugins/loopx/skills/api-designer/references/*.md`

- [ ] **Step 1: Fetch the latest Jeffallan upstream source**

Run:

```bash
rm -rf /tmp/jeffallan-claude-skills
git clone --depth 1 https://github.com/Jeffallan/claude-skills /tmp/jeffallan-claude-skills
test -f /tmp/jeffallan-claude-skills/skills/api-designer/SKILL.md
find /tmp/jeffallan-claude-skills/skills/api-designer -maxdepth 2 -type f | sort
```

Expected: output includes:

```text
/tmp/jeffallan-claude-skills/skills/api-designer/SKILL.md
```

- [ ] **Step 2: Copy upstream content into loopx**

Run:

```bash
rm -rf skills/api-designer plugins/loopx/skills/api-designer
mkdir -p skills
cp -R /tmp/jeffallan-claude-skills/skills/api-designer skills/api-designer
```

Expected: `skills/api-designer/SKILL.md` and any upstream `references/` files exist.

- [ ] **Step 3: Adapt the root skill to loopx support-lens semantics**

Edit `skills/api-designer/SKILL.md`:

- Keep the useful upstream API design workflow, constraints, and reference map.
- Replace or add frontmatter so it has exactly:

```yaml
---
name: api-designer
description: "Applies loopx API design discipline for REST, GraphQL, OpenAPI, resource modeling, pagination, versioning, compatibility, and error models. Not for replacing clarify, spec, implementation planning, code review, or workflow state transitions."
when_to_use: "api-designer, API design, REST, GraphQL, OpenAPI, resource modeling, pagination, versioning, API errors, compatibility, 接口设计"
metadata:
  version: "0.2.9"
---
```

- Add this `## loopx Boundary` section near the top, before any implementation workflow:

```markdown
## loopx Boundary

`api-designer` is a support lens, not a workflow state. Use it directly when the user asks for API design help, and use it from `spec`, `exec`, `review`, or `final-review` when work touches API contracts.

This skill does not replace `clarify`, `spec`, `plan-to-exec`, `review`, or `final-review`. If product behavior, permissions, compatibility, migration, or client contract decisions are unresolved, route those decisions through `clarify` or `spec` instead of deciding them inside this skill.
```

- Remove role-play claims such as "10+ years" if they read like persona inflation and do not add concrete guidance.
- Keep upstream reference links local. If the upstream file references `references/rest-patterns.md`, ensure that file exists under `skills/api-designer/references/rest-patterns.md`.

- [ ] **Step 4: Mirror it to the plugin**

Run:

```bash
mkdir -p plugins/loopx/skills/api-designer
cp -R skills/api-designer/. plugins/loopx/skills/api-designer/
```

- [ ] **Step 5: Run governance check**

Run:

```bash
node scripts/verify-skills.mjs
```

Expected: FAIL with the next missing skill, similar to:

```text
AssertionError [ERR_ASSERTION]: architecture-designer root SKILL.md missing
```

- [ ] **Step 6: Commit**

Run:

```bash
git add skills/api-designer plugins/loopx/skills/api-designer
git commit -m "feat: add api designer support lens"
```

Expected: commit succeeds.

## Task 4: Create `architecture-designer` As An Architecture Discipline Lens

**Files:**
- Create: `skills/architecture-designer/SKILL.md`
- Create: `skills/architecture-designer/references/*.md`
- Create: `plugins/loopx/skills/architecture-designer/SKILL.md`
- Create: `plugins/loopx/skills/architecture-designer/references/*.md`

- [ ] **Step 1: Verify the latest Jeffallan upstream source is available**

Run:

```bash
test -f /tmp/jeffallan-claude-skills/skills/architecture-designer/SKILL.md || git clone --depth 1 https://github.com/Jeffallan/claude-skills /tmp/jeffallan-claude-skills
find /tmp/jeffallan-claude-skills/skills/architecture-designer -maxdepth 2 -type f | sort
```

Expected: output includes `/tmp/jeffallan-claude-skills/skills/architecture-designer/SKILL.md` and any upstream reference files.

- [ ] **Step 2: Copy upstream content into loopx**

Run:

```bash
rm -rf skills/architecture-designer plugins/loopx/skills/architecture-designer
cp -R /tmp/jeffallan-claude-skills/skills/architecture-designer skills/architecture-designer
```

Expected: `skills/architecture-designer/SKILL.md` and any upstream `references/` files exist.

- [ ] **Step 3: Adapt the root skill to loopx support-lens semantics**

Edit `skills/architecture-designer/SKILL.md`:

- Keep useful upstream guidance around ADRs, NFRs, system design, database selection, and architecture tradeoffs.
- Replace or add frontmatter so it has exactly:

```yaml
---
name: architecture-designer
description: "Applies loopx architecture discipline for system boundaries, ADRs, NFRs, scalability, failure modes, operability, and technology tradeoffs. Not for replacing clarify, spec, implementation planning, code review, or workflow state transitions."
when_to_use: "architecture-designer, architecture, system design, ADR, NFR, scalability, failure modes, technology tradeoff, 架构设计"
metadata:
  version: "0.2.9"
---
```

- Add this `## loopx Boundary` section near the top:

```markdown
## loopx Boundary

`architecture-designer` is a support lens, not a workflow state. Use it directly for architecture review or system design discussion, and use it from `spec`, `review`, or `final-review` when changes affect system boundaries, operational behavior, or long-lived design decisions.

This skill does not replace `clarify`, `spec`, `plan-to-exec`, `review`, or `final-review`. If architecture decisions are not yet approved, produce options and route the work through `spec`.

When database technology, ownership, schema, migration, or query performance is part of the architecture decision, also use `sql-style`.
```

- Remove role-play claims that do not add concrete guidance.
- Keep upstream reference links local and ensure referenced files exist.

- [ ] **Step 4: Mirror it to the plugin**

Run:

```bash
mkdir -p plugins/loopx/skills/architecture-designer
cp -R skills/architecture-designer/. plugins/loopx/skills/architecture-designer/
```

- [ ] **Step 5: Run governance check**

Run:

```bash
node scripts/verify-skills.mjs
```

Expected: FAIL with the next missing skill, similar to:

```text
AssertionError [ERR_ASSERTION]: sql-style root SKILL.md missing
```

- [ ] **Step 6: Commit**

Run:

```bash
git add skills/architecture-designer plugins/loopx/skills/architecture-designer
git commit -m "feat: add architecture designer support lens"
```

Expected: commit succeeds.

## Task 5: Create Fused `sql-style` As The Shared SQL Lens

**Files:**
- Create: `skills/sql-style/SKILL.md`
- Create: `skills/sql-style/references/*.md`
- Create: `plugins/loopx/skills/sql-style/SKILL.md`
- Create: `plugins/loopx/skills/sql-style/references/*.md`
- Modify: `skills/kratos/SKILL.md`
- Modify: `plugins/loopx/skills/kratos/SKILL.md`

- [ ] **Step 1: Verify the latest Jeffallan `sql-pro` source is available**

Run:

```bash
test -f /tmp/jeffallan-claude-skills/skills/sql-pro/SKILL.md || git clone --depth 1 https://github.com/Jeffallan/claude-skills /tmp/jeffallan-claude-skills
find /tmp/jeffallan-claude-skills/skills/sql-pro -maxdepth 2 -type f | sort
```

Expected: output includes:

```text
/tmp/jeffallan-claude-skills/skills/sql-pro/SKILL.md
```

and upstream SQL reference files such as `references/optimization.md` if they exist.

- [ ] **Step 2: Copy upstream `sql-pro` content into the new `sql-style` directory**

Run:

```bash
rm -rf skills/sql-style plugins/loopx/skills/sql-style
mkdir -p skills/sql-style
cp -R /tmp/jeffallan-claude-skills/skills/sql-pro/. skills/sql-style/
```

Expected: `skills/sql-style/SKILL.md` exists, and upstream reference files are preserved under `skills/sql-style/references/`.

- [ ] **Step 3: Adapt `sql-pro` into fused loopx `sql-style`**

Edit `skills/sql-style/SKILL.md`:

- Keep the best upstream SQL guidance: query plans, set-based operations, indexes, window functions, dialect differences, schema design, optimization, and performance evidence.
- Add existing loopx discipline: workflow boundaries, migration safety, rolling deploy compatibility, repeat-run safety, Kratos/MySQL table and column comments where applicable.
- Replace or add frontmatter so it has exactly:

```markdown
---
name: sql-style
description: "Applies loopx SQL and database-change discipline for queries, schemas, indexes, migrations, dialects, and performance-sensitive data access. Not for replacing clarify, spec, implementation planning, code review, or workflow state transitions."
when_to_use: "sql-style, SQL, database schema, migration, index, query optimization, EXPLAIN, PostgreSQL, MySQL, SQLite, 数据库, 索引"
metadata:
  version: "0.2.9"
---

# SQL Style

## Purpose

`sql-style` is the shared loopx SQL/database support lens. It fuses useful upstream `sql-pro` guidance with loopx workflow discipline.

Do not delete or flatten useful SQL/database guidance from other skills just because `sql-style` exists. Instead, make related skills call `sql-style` when SQL, database schema, migration, indexing, or query-performance discipline is relevant.

Use it directly for SQL, schema, index, migration, and database performance work. Use it from `spec`, `exec`, `review`, or `final-review` when work touches persistent data or performance-sensitive data access.

This skill does not replace `spec`. If data ownership, product semantics, migration compatibility, permission boundaries, or rollback decisions are unresolved, route those decisions through `clarify` or `spec`.

## When To Use

- Designing or reviewing database schemas
- Writing or optimizing SQL queries
- Adding or changing indexes
- Writing migrations, backfills, or data cleanup
- Reviewing ORM-generated SQL or repository data access
- Investigating slow queries with `EXPLAIN` or query plans
- Handling dialect-specific behavior in PostgreSQL, MySQL, SQLite, or SQL Server

## Schema And Migration Discipline

- Preserve existing schema conventions unless they are clearly broken.
- Define primary keys, foreign keys, uniqueness, nullability, and defaults intentionally.
- Treat nullability as product behavior, not a storage afterthought.
- Include rollback or forward-fix strategy for migrations that can fail mid-flight.
- Make repeated migration or backfill runs safe when the deployment process may retry.
- For large tables, plan lock behavior, batching, indexes, and online migration constraints.
- Keep application compatibility in mind during rolling deploys.
- For MySQL tables in Kratos projects, preserve the existing loopx rule: `CREATE TABLE` statements should include table comments, and persisted columns should include column comments where the project convention requires them.

## Query Discipline

- Prefer set-based operations over row-by-row loops.
- Avoid `SELECT *` in production queries unless the repository has an explicit reason.
- Filter early and return only required columns.
- Handle `NULL` explicitly in predicates, joins, ordering, and uniqueness assumptions.
- Prefer `EXISTS` over `COUNT(*)` for existence checks when only existence matters.
- Make ordering deterministic for paginated or user-visible results.
- Use transactions deliberately. State the isolation assumptions when correctness depends on them.
- Keep query intent readable with names, structure, or short comments for non-obvious logic.

## Index Discipline

- Add indexes for demonstrated access paths, constraints, or clearly required query patterns.
- Consider column order, selectivity, covering behavior, and write amplification.
- Avoid redundant indexes unless the dialect or workload justifies them.
- Verify the intended query uses the index with the project's database tooling when practical.
- Document why a non-obvious index exists.

## Performance Verification

- Use project-specific performance targets when they exist.
- If no target exists, state the measured baseline and proposed improvement without inventing an SLO.
- Analyze execution plans before claiming an optimization works.
- Test against production-like data volume when data size can change the plan.
- Record before/after evidence for meaningful optimizations.

Example commands:

```bash
EXPLAIN ANALYZE <query>;
go test ./...
npm test
pytest
```

## Dialect Discipline

- Check dialect-specific behavior for upserts, JSON fields, generated columns, partial indexes, expression indexes, collations, time zones, and locking.
- Do not assume PostgreSQL behavior applies to MySQL or SQLite.
- Keep ORM abstractions honest by inspecting generated SQL when performance or correctness depends on it.

## Review Checklist

- Are schema semantics explicit: keys, uniqueness, nullability, defaults?
- Is migration order safe for rolling deploys and retries?
- Could repeated runs corrupt data or duplicate work?
- Do queries avoid unnecessary columns, rows, and row-by-row loops?
- Are `NULL` and ordering semantics intentional?
- Are indexes justified by access paths and verified when practical?
- Are dialect-specific assumptions documented?
- Is performance evidence fresh before any performance claim?
```

- [ ] **Step 4: Preserve and verify upstream SQL references**

Run:

```bash
find skills/sql-style -maxdepth 2 -type f | sort
rg -n "references/" skills/sql-style/SKILL.md || true
```

Expected: any local references mentioned by `SKILL.md` exist under `skills/sql-style/`. Do not leave broken upstream reference links.

- [ ] **Step 5: Update related skills to call `sql-style` instead of duplicating SQL discipline**

In `skills/kratos/SKILL.md`, find the section that contains:

```markdown
- MySQL `CREATE TABLE` statements must include a table-level `COMMENT`.
- MySQL column definitions in `CREATE TABLE` or `ALTER TABLE ... ADD COLUMN` statements must include column-level `COMMENT`.
- When using Ent schema for MySQL tables, add `.Comment(...)` to fields that are persisted as columns.
```

Keep those Kratos-specific rules in place. Immediately after them, add:

```markdown
- Use `sql-style` for broader SQL/database discipline: schema semantics, migrations, indexes, dialect behavior, query plans, and performance-sensitive data access.
```

Do not remove the existing Kratos SQL rules; `sql-style` complements them.

- [ ] **Step 6: Mirror `sql-style` and the changed `kratos` skill to the plugin**

Run:

```bash
mkdir -p plugins/loopx/skills/sql-style
cp -R skills/sql-style/. plugins/loopx/skills/sql-style/
cp skills/kratos/SKILL.md plugins/loopx/skills/kratos/SKILL.md
```

- [ ] **Step 7: Verify no accidental `sql-pro` entry was added to the bundled install surface**

Run:

```bash
rg -n "'sql-pro'|\"sql-pro\"|skills/sql-pro|plugins/loopx/skills/sql-pro" src package.json skills/RESOLVER.md README.md README.zh-CN.md plugins/loopx || true
```

Expected: no output. This does not require deleting useful SQL content inside other skills; it only prevents a second bundled `sql-pro` install entry.

- [ ] **Step 8: Run governance check**

Run:

```bash
node scripts/verify-skills.mjs
```

Expected: FAIL with the next missing skill, similar to:

```text
AssertionError [ERR_ASSERTION]: cli-developer root SKILL.md missing
```

- [ ] **Step 9: Commit**

Run:

```bash
git add skills/sql-style plugins/loopx/skills/sql-style skills/kratos/SKILL.md plugins/loopx/skills/kratos/SKILL.md
git commit -m "feat: add fused sql style support lens"
```

Expected: commit succeeds.

## Task 6: Create `cli-developer` As A CLI Discipline Lens

**Files:**
- Create: `skills/cli-developer/SKILL.md`
- Create: `skills/cli-developer/references/*.md`
- Create: `plugins/loopx/skills/cli-developer/SKILL.md`
- Create: `plugins/loopx/skills/cli-developer/references/*.md`

- [ ] **Step 1: Verify the latest Jeffallan upstream source is available**

Run:

```bash
test -f /tmp/jeffallan-claude-skills/skills/cli-developer/SKILL.md || git clone --depth 1 https://github.com/Jeffallan/claude-skills /tmp/jeffallan-claude-skills
find /tmp/jeffallan-claude-skills/skills/cli-developer -maxdepth 2 -type f | sort
```

Expected: output includes `/tmp/jeffallan-claude-skills/skills/cli-developer/SKILL.md` and any upstream reference files.

- [ ] **Step 2: Copy upstream content into loopx**

```bash
rm -rf skills/cli-developer plugins/loopx/skills/cli-developer
cp -R /tmp/jeffallan-claude-skills/skills/cli-developer skills/cli-developer
```

Expected: `skills/cli-developer/SKILL.md` and any upstream `references/` files exist.

- [ ] **Step 3: Adapt the root skill to loopx support-lens semantics**

Edit `skills/cli-developer/SKILL.md`:

- Keep useful upstream CLI guidance around command hierarchy, argument parsing, prompts, progress indicators, shell completions, startup time, and cross-platform UX.
- Add loopx-specific discipline around human vs JSON output, stdout/stderr, non-interactive CI behavior, and installer/onboarding compatibility.
- Replace or add frontmatter so it has exactly:

```yaml
---
name: cli-developer
description: "Applies loopx CLI design discipline for commands, flags, human and JSON output, errors, interactivity, help text, shell behavior, and cross-platform UX. Not for replacing clarify, spec, implementation planning, code review, or workflow state transitions."
when_to_use: "cli-developer, CLI, command design, flags, JSON output, stdout stderr, interactive prompt, help text, shell completion, 命令行"
metadata:
  version: "0.2.9"
---
```

- Add this `## loopx Boundary` section near the top:

```markdown
## loopx Boundary

`cli-developer` is a support lens, not a workflow state. Use it directly when the user asks for CLI design or implementation guidance, and use it from `spec`, `exec`, `review`, or `final-review` when changes affect command behavior.

This skill does not replace `clarify`, `spec`, `plan-to-exec`, `review`, or `final-review`. If product behavior, compatibility, migration, or public CLI contract decisions are unclear, route those decisions through `clarify` or `spec`.

For loopx itself, preserve the established rule that human output is default for first-use commands and complete runtime payloads require explicit `--json`.
```

- Preserve upstream local reference links and ensure the referenced files exist.

- [ ] **Step 4: Mirror it to the plugin**

Run:

```bash
mkdir -p plugins/loopx/skills/cli-developer
cp -R skills/cli-developer/. plugins/loopx/skills/cli-developer/
```

- [ ] **Step 5: Run governance check**

Run:

```bash
node scripts/verify-skills.mjs
```

Expected: FAIL if README/design docs still omit the new support skills; otherwise PASS. If it passes here, continue to Task 7 anyway because public docs still need clearer product positioning.

- [ ] **Step 6: Commit**

Run:

```bash
git add skills/cli-developer plugins/loopx/skills/cli-developer
git commit -m "feat: add cli developer support lens"
```

Expected: commit succeeds.

## Task 7: Update Public Skill Surface Documentation

**Files:**
- Modify: `README.md`
- Modify: `README.zh-CN.md`
- Modify: `docs/loopx/design/loopx-skill-suite-v1-design.md`
- Modify: `docs/loopx/plans/loopx-skill-suite-v1-implementation.md` only if it lists the exact v1 bundled skill set.

- [ ] **Step 1: Update English README support list**

In `README.md`, replace:

```markdown
Support skills:

- `tdd`
- `debug`
- `verify`
- `go-style`
- `kratos`
```

with:

```markdown
Support skills:

- `tdd`
- `debug`
- `verify`
- `doc-readability`
- `requirement-analyzer`
- `go-style`
- `kratos`
- `api-designer`
- `architecture-designer`
- `sql-style`
- `cli-developer`
```

Then add this paragraph immediately after the list:

```markdown
Support skills are lenses, not workflow states. They can be invoked directly by users, or applied by workflow skills when relevant. `requirement-analyzer` and `doc-readability` assess source documents; `api-designer`, `architecture-designer`, `sql-style`, `cli-developer`, `go-style`, and `kratos` add domain discipline during design, execution, and review without changing the core flow.
```

Update both uninstall command lists to include:

```text
requirement-analyzer,api-designer,architecture-designer,sql-style,cli-developer
```

inside the brace expansion.

- [ ] **Step 2: Update Chinese README support list**

In `README.zh-CN.md`, replace the auxiliary skills list with:

```markdown
辅助 skills：

- `tdd`
- `debug`
- `verify`
- `doc-readability`
- `requirement-analyzer`
- `go-style`
- `kratos`
- `api-designer`
- `architecture-designer`
- `sql-style`
- `cli-developer`
```

Then add:

```markdown
辅助 skills 是 lens，不是 workflow state。用户可以直接调用它们，workflow skills 也可以在相关场景套用它们。`requirement-analyzer` 和 `doc-readability` 用于评估源文档；`api-designer`、`architecture-designer`、`sql-style`、`cli-developer`、`go-style` 和 `kratos` 在设计、执行、评审阶段提供领域纪律，但不改变核心流程。
```

Update both uninstall command lists to include:

```text
requirement-analyzer,api-designer,architecture-designer,sql-style,cli-developer
```

inside the brace expansion.

- [ ] **Step 3: Update the v1 design document**

In `docs/loopx/design/loopx-skill-suite-v1-design.md`, add the five new skill names to the v1 product surface list:

```markdown
- `requirement-analyzer`
- `api-designer`
- `architecture-designer`
- `sql-style`
- `cli-developer`
```

Add a short section after the workflow description:

```markdown
Support skills are installed and governed, but they do not create workflow states. `requirement-analyzer` behaves like `doc-readability`: it can analyze source documents and produce reports without advancing workflow state. `api-designer`, `architecture-designer`, `sql-style`, and `cli-developer` behave like `go-style`: they are discipline lenses applied directly or from workflow skills during design, execution, and review.

`sql-style` is the shared bundled SQL/database lens. It fuses selected SQL optimization, schema, migration, index, and dialect guidance with loopx workflow discipline. Related skills should call `sql-style` when SQL/database discipline is relevant; do not delete useful SQL guidance from those skills merely because `sql-style` exists.
```

- [ ] **Step 4: Check for stale exact skill lists**

Run:

```bash
rg -n "go-style|kratos|Support skills|辅助 skills|v1 product surface|skill suite" README.md README.zh-CN.md docs skills package.json src plugins
```

Expected: any exact list of bundled skills includes the five new support skills or is intentionally scoped.

- [ ] **Step 5: Run governance check**

Run:

```bash
node scripts/verify-skills.mjs
```

Expected: PASS, ending with:

```text
ok: verified 21 loopx bundled skills
```

- [ ] **Step 6: Commit**

Run:

```bash
git add README.md README.zh-CN.md docs/loopx/design/loopx-skill-suite-v1-design.md docs/loopx/plans/loopx-skill-suite-v1-implementation.md
git commit -m "docs: document support lens skill surface"
```

Expected: commit succeeds. If `docs/loopx/plans/loopx-skill-suite-v1-implementation.md` did not change, omit it from `git add`.

## Task 8: Add Or Update Tests For Install Surface

**Files:**
- Modify: existing install/governance tests under `test/`, `tests/`, or `src/` if present.
- Modify: `plugins/loopx/scripts/plugin-install.test.mjs` if it asserts exact installed skill directories indirectly.

- [ ] **Step 1: Locate existing tests**

Run:

```bash
rg -n "LOOPX_BUNDLED_SKILLS|install-skills|verifyInstallState|packageJson.files|skills/" test tests src plugins scripts --glob '*.test.mjs' --glob '*.test.js' --glob '*.mjs'
```

Expected: find tests that derive expected skills from `LOOPX_BUNDLED_SKILLS`, especially `plugins/loopx/scripts/plugin-install.test.mjs`.

- [ ] **Step 2: Add explicit regression assertions only if needed**

If no test explicitly proves the new skill names are in `LOOPX_BUNDLED_SKILLS`, add this test to the nearest existing install-discovery test file. If no such file exists, create `src/install-discovery.test.mjs` and ensure the repo's `npm test` discovers it.

```js
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { LOOPX_BUNDLED_SKILLS } from './install-discovery.mjs';

test('bundled support lens skills are installed as part of loopx surface', () => {
  for (const skillName of [
    'requirement-analyzer',
    'api-designer',
    'architecture-designer',
    'sql-style',
    'cli-developer',
  ]) {
    assert.equal(LOOPX_BUNDLED_SKILLS.includes(skillName), true, `${skillName} missing from bundled skills`);
  }
});
```

If the repository already has a better exact-surface test, update that instead of adding a redundant file.

- [ ] **Step 3: Run the focused tests**

Run the relevant test command discovered in `package.json`. If the repo uses Node's test runner, run:

```bash
node --test src/install-discovery.test.mjs plugins/loopx/scripts/plugin-install.test.mjs
```

Expected: PASS.

- [ ] **Step 4: Run governance check**

Run:

```bash
node scripts/verify-skills.mjs
```

Expected: PASS with:

```text
ok: verified 21 loopx bundled skills
```

- [ ] **Step 5: Commit**

Run:

```bash
git add src plugins test tests scripts
git commit -m "test: cover support lens skill installation"
```

Expected: commit succeeds. If no test files changed because existing tests already cover this, skip this commit and record that in the execution notes.

## Task 9: Final Verification And Drift Check

**Files:**
- No planned edits unless verification exposes a defect.

- [ ] **Step 1: Verify plugin mirrors are exact**

Run:

```bash
for skill in requirement-analyzer api-designer architecture-designer sql-style cli-developer; do
  diff -u "skills/$skill/SKILL.md" "plugins/loopx/skills/$skill/SKILL.md"
done
```

Expected: no output.

- [ ] **Step 2: Verify no accidental `sql-pro` bundled install entry exists**

Run:

```bash
rg -n "'sql-pro'|\"sql-pro\"|skills/sql-pro|plugins/loopx/skills/sql-pro" src package.json skills/RESOLVER.md README.md README.zh-CN.md plugins/loopx || true
```

Expected: no output. This check only guards the install surface; it does not require deleting SQL/database guidance embedded in other skills.

- [ ] **Step 3: Run full tests**

Run:

```bash
npm test
```

Expected: PASS.

- [ ] **Step 4: Run deterministic skill governance**

Run:

```bash
node scripts/verify-skills.mjs
```

Expected:

```text
ok: verified 21 loopx bundled skills
```

- [ ] **Step 5: Inspect git diff**

Run:

```bash
git status --short
git diff --stat HEAD
```

Expected: no unexpected files. Expected changed areas are skill files, plugin mirrors, installer surface, resolver, docs, and optional tests.

- [ ] **Step 6: Commit final fixes if needed**

If Task 9 produced fixes, commit them:

```bash
git add .
git commit -m "chore: finalize support lens skill migration"
```

Expected: commit succeeds, or skip if there are no fixes.

## Self-Review

- Spec coverage: The plan adds `requirement-analyzer`, `api-designer`, `architecture-designer`, fused `sql-style`, and `cli-developer`; keeps core workflow unchanged; documents support-lens semantics; updates installer, package, plugin mirror, resolver, README, and governance; sources `api-designer`, `architecture-designer`, `cli-developer`, and `sql-pro` from Jeffallan's latest upstream content at execution time.
- Placeholder scan: No `TBD`, `TODO`, or vague implementation steps remain. `requirement-analyzer` content is explicit; Jeffallan-sourced skills have exact upstream fetch/copy/adaptation instructions so execution uses the latest upstream content.
- Type consistency: Skill names match directory names, frontmatter names, resolver paths, package file entries, plugin mirror paths, and bundled list names.
- Design drift: The plan does not introduce new workflow states. `sql-style` is the shared SQL/database lens; related skills keep useful local SQL rules and call `sql-style` for broader SQL/database discipline.

## Execution Handoff

Plan complete and saved to `docs/loopx/plans/2026-06-15-support-lens-skills-migration.md`.

Two execution options:

1. Subagent Exec (recommended) - dispatch a fresh subagent per task, review between tasks, fast iteration
2. Inline Execution - execute tasks in this session using exec, batch execution with checkpoints

Which approach?
