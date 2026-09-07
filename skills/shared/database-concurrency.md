# Database Concurrency Contract

Apply when designing, planning, reviewing, or implementing concurrent persisted
state. This is loopx's engineering policy, not a claim that database locks are
universally incorrect. Explicit user rulings and accepted repository exceptions
remain authoritative; expose conflicts instead of silently changing existing
behavior or expanding a bounded task into an unrelated concurrency rewrite.

## Choose the coordination boundary

Do not introduce, recommend, or carry forward application-controlled database
locks in a proposed concurrency design: `SELECT ... FOR UPDATE`,
`SELECT ... FOR SHARE`, `LOCK TABLES`, row/table lock hints, and database advisory
locks. Prefer the simplest sufficient invariant:

- uniqueness or idempotency for duplicate creation;
- conditional state updates, optimistic versions, or full-snapshot CAS for stale writes;
- append-only facts or an established single-writer owner when appropriate.

Use transactions for atomicity; a transaction alone does not prove mutual
exclusion or prevent stale decisions. Engines may acquire internal DML/DDL locks;
account for their operational impact without relying on acquisition order, waiting,
or timeouts for business correctness.

Allow a distributed lock only when the design explains why the simpler choices
cannot protect the invariant. Specify scope, lease and renewal, fencing, timeout,
owner failure, and recovery. Do not add a lock or retry merely as a fallback.

## Preserve and verify the invariant

For each affected transition, record the invariant, expected state/version or
snapshot predicate, zero-row/conflict behavior, loser reread/idempotent return or
rejection, and which writes roll back together. Address ABA when state can cycle.
Any approved optimistic retry must be bounded and exclude non-transactional
external side effects from the retried unit.

`spec` owns these decisions; plans preserve their source anchors and bind them to
acceptance, verification, and risk-focused review. SQL implementation and review
check actual statements, including ORM output. Missing decisions or a prohibited
locking dependency block readiness and return to `spec`; a reviewer reports the
conflict rather than redesigning the source.
