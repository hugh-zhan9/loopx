---
name: sql-style
description: "Design or review SQL, schemas, migrations, indexes, and query performance (SQL 优化、数据库设计). Check the actual dialect and data contract."
when_to_use: "sql-style, SQL, database schema, migration, index, query optimization, EXPLAIN, PostgreSQL, MySQL, SQLite, 数据库, 索引"
license: MIT
metadata:
  version: "0.3.10"
  forked_from: https://github.com/Jeffallan/claude-skills/tree/main/skills/sql-pro
  maintained_by: loopx
---

# SQL Style

Apply this support lens to SQL, schema, migrations, indexes, ORM access, or database
performance in the requested task. It does not replace `spec` for unresolved data
ownership, product behavior, permissions, or migration compatibility decisions.

## Establish the database context

Inspect the actual dialect/version, ORM, migration tool, deployment order, relevant
queries, callers, and data contracts. Resolve discoverable context before asking.
When a choice depends on missing product semantics or recovery policy, compare
options and identify the decision; do not execute destructive work to discover it.

Database writes, backfills, and plan inspection that executes a statement need the
same authorization as the operation itself. Prefer non-executing plan inspection
for unapproved mutations; an analysis request does not authorize production writes.

When concurrent persisted state is involved, read and apply
[the database concurrency contract](../shared/database-concurrency.md).

## Schema and migration

- Preserve established conventions and intentional keys, uniqueness, nullability,
  defaults, foreign keys, and ownership. Treat nullability as observable behavior.
- Define rollback or forward repair for partial migration failure. Make repeated
  runs safe when the deployment process may retry.
- For rolling deployment, preserve old/new application compatibility. For large
  tables, establish lock behavior, online-change limits, bounded batches, and stop
  conditions. Use expand/contract sequencing when the compatibility window needs it.
- Resumable backfills need checkpoints, progress evidence, and reconciliation;
  do not impose a backfill runtime on a small atomic migration.
- In Kratos/MySQL work, preserve table and persisted-column comments according to
  the established project convention; coordinate with `kratos` for framework detail.

## Query and index decisions

- Prefer set-based operations and return only needed columns/rows. Avoid
  `SELECT *` or broad ORM preloads without a repository-specific reason.
- Account for `NULL` in predicates, joins, ordering, and uniqueness. Keep paginated
  ordering deterministic. Use existence checks rather than counts when only
  existence matters and the actual query plan supports the choice.
- State transaction and isolation assumptions when correctness depends on them.
  Inspect generated ORM SQL instead of assuming the abstraction preserves them.
- Add indexes for demonstrated access paths or constraints. Consider column order,
  selectivity, covering behavior, redundant indexes, and write amplification.
- Check dialect-specific upserts, JSON, generated columns, collations, time zones,
  and locking against the repository's actual database.
- Review privileges and sensitive-data exposure for changed data paths. Preserve
  required error and integrity behavior when optimizing.

## Performance evidence

Use project targets when available. Otherwise report a measured baseline rather
than inventing an SLO or production row count. Inspect execution plans and compare
before/after evidence on representative data before claiming an improvement.

Use the project's database client and safe test environment; SQL statements are
not shell commands. `EXPLAIN ANALYZE` runs the statement and is not a read-only
substitute for `EXPLAIN`. If plan or workload evidence is unavailable, identify the
unverified claim and use the narrowest meaningful available check.

## References and output

Load detail only for the current problem:

- [query-patterns.md](references/query-patterns.md): joins, CTEs, subqueries, recursion.
- [window-functions.md](references/window-functions.md): ranking and analytics.
- [optimization.md](references/optimization.md): plans, indexes, statistics.
- [database-design.md](references/database-design.md): keys, constraints, schemas.
- [dialect-differences.md](references/dialect-differences.md): dialect-specific syntax and behavior.

Return the SQL, design, or review requested, with relevant semantics, compatibility,
migration/recovery constraints, and actual verification. Do not duplicate every
check as a separate report or add a migration mechanism without a requirement.
