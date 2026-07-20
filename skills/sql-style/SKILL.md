---
name: sql-style
description: "Applies loopx SQL and database-change discipline for queries, schemas, indexes, migrations, dialects, and performance-sensitive data access. Not for replacing clarify, spec, implementation planning, code review, or workflow state transitions."
when_to_use: "sql-style, SQL, database schema, migration, index, query optimization, EXPLAIN, PostgreSQL, MySQL, SQLite, 数据库, 索引"
license: MIT
metadata:
  version: "0.3.6"
  forked_from: https://github.com/Jeffallan/claude-skills/tree/main/skills/sql-pro
  maintained_by: loopx
---

# SQL Style

## Purpose

`sql-style` is the shared loopx SQL/database support lens. It fuses useful upstream `sql-pro` guidance with loopx workflow discipline.

Do not delete or flatten useful SQL/database guidance from other skills just because `sql-style` exists. Instead, make related skills call `sql-style` when SQL, database schema, migration, indexing, or query-performance discipline is relevant.

Use it directly for SQL, schema, index, migration, and database performance work. Use it from `spec`, `exec`, or `review` when work touches persistent data or performance-sensitive data access.

This skill does not replace `spec`. If data ownership, product semantics, migration compatibility, permission boundaries, or rollback decisions are unresolved, route those decisions through `clarify` or `spec`.

## When To Use

- Designing or reviewing database schemas
- Writing or optimizing SQL queries
- Adding or changing indexes
- Writing migrations, backfills, or data cleanup
- Reviewing ORM-generated SQL or repository data access
- Investigating slow queries with `EXPLAIN` or query plans
- Handling dialect-specific behavior in PostgreSQL, MySQL, SQLite, or SQL Server

## STOP Conditions

Stop before recommending or editing database changes when:

- Data ownership, product semantics, permission boundaries, rollout order, or rollback expectations are unknown.
- The change can destroy, rewrite, backfill, or expose production data and no approved migration or recovery path exists.
- The repository's actual dialect, ORM, migration tool, or deployment order is unclear.

Route unresolved product and compatibility decisions through `clarify` or `spec` before continuing.

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
- For online schema changes, prefer expand/contract sequencing. Backfills need
  resumable checkpoints, progress observability, reconciliation, and a rollback
  or stop rule. Review privileges and PII exposure for every new data path.
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

## Failure Handling

| Trigger | First action | If still blocked |
|---|---|---|
| `EXPLAIN` output is unavailable | State that the optimization is unverified and use the narrowest available query or test evidence | Do not claim performance improvement; report the evidence gap |
| Migration cannot be made safely repeatable | Split schema change, backfill, and cleanup into separate phases | Stop and require an approved rollout or recovery decision |
| Dialect behavior is uncertain | Check project configuration, migration files, and existing SQL for the actual dialect | Mark the assumption explicitly and avoid dialect-specific syntax |

## Red Flags

- Do not use `SELECT *` or broad ORM preloads in production paths without a repository-specific reason.
- Do not add indexes without an access path, constraint, or measured query need.
- Do not hide destructive migrations behind "cleanup" language.
- Do not invent SLOs, production row counts, or rollback guarantees.

## Dialect Discipline

- Check dialect-specific behavior for upserts, JSON fields, generated columns, partial indexes, expression indexes, collations, time zones, and locking.
- Do not assume PostgreSQL behavior applies to MySQL or SQLite.
- Keep ORM abstractions honest by inspecting generated SQL when performance or correctness depends on it.

## Reference Guide

Load detailed guidance from the preserved upstream references when the task needs it:

| Topic | Reference | Load When |
|-------|-----------|-----------|
| Query Patterns | `references/query-patterns.md` | JOINs, CTEs, subqueries, recursive queries |
| Window Functions | `references/window-functions.md` | ROW_NUMBER, RANK, LAG/LEAD, analytics |
| Optimization | `references/optimization.md` | EXPLAIN plans, indexes, statistics, tuning |
| Database Design | `references/database-design.md` | Normalization, keys, constraints, schemas |
| Dialect Differences | `references/dialect-differences.md` | PostgreSQL, MySQL, SQLite, or SQL Server behavior |

## Review Checklist

- Are schema semantics explicit: keys, uniqueness, nullability, defaults?
- Is migration order safe for rolling deploys and retries?
- Could repeated runs corrupt data or duplicate work?
- Do queries avoid unnecessary columns, rows, and row-by-row loops?
- Are `NULL` and ordering semantics intentional?
- Are indexes justified by access paths and verified when practical?
- Are dialect-specific assumptions documented?
- Is performance evidence fresh before any performance claim?
