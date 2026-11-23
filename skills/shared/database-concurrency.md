# Database Concurrency Policy

Default policy for concurrent persisted state. Explicit user rulings and
documented repository exceptions take precedence.

## Preferred coordination (simplest sufficient invariant first)

1. **Uniqueness / idempotency key** for duplicate creation or repeated callbacks.
2. **Conditional update / optimistic version / full-snapshot CAS** (`WHERE id = ? AND version = ?`) for stale writes and state transitions.
3. **Append-only facts or single-writer ownership** when ordering is structural.
4. **Distributed lock** only when the design proves 1–3 cannot protect the invariant; specify scope, lease/renewal, fencing token, timeout, and owner-failure recovery.

## Prohibited defaults

Do not introduce application-controlled database locks (`SELECT ... FOR UPDATE`,
`SELECT ... FOR SHARE`, `LOCK TABLES`, row/table lock hints, or database advisory
locks) unless explicitly authorized. Use transactions for atomicity, not mutual
exclusion.

## Required transition spec

For each concurrent transition, state:
- the invariant and CAS predicate (`expected state/version`);
- zero-row conflict handling (reread, idempotent return, or rejection);
- ABA protection if state can cycle;
- bounded retry cap (excluding non-transactional external side effects from retries).

Verify generated SQL (including ORM output) with `skills/code-review/scripts/check-guardrails.mjs`.
