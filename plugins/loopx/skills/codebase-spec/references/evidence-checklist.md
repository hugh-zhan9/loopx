# Evidence Checklist

Use this checklist for Standard and Deep codebase specs. Omit areas that do not apply, but note important absences.

## Repository Identity

- Package/module manifests: `package.json`, `go.mod`, `Cargo.toml`, `pyproject.toml`, `pom.xml`, workspace files.
- Declared runtime versions, engines, package manager, lockfile, build scripts.
- Main entry points and executable bins.
- License, publish surface, package `files`, plugin manifests, install scripts.
- README and public docs claims.

## Structure And Ownership

- Top-level directories and their roles.
- Canonical source directories versus generated mirrors.
- Templates, assets, scripts, test fixtures, docs, references.
- Module boundaries and whether imports respect those boundaries.
- Public extension points such as plugins, hooks, generated skill mirrors, or user-controlled folders.

## Runtime Surfaces

- CLI commands, flags, arguments, human output, JSON output, exit behavior.
- HTTP routes, GraphQL schemas, RPC/proto contracts, WebSocket or event channels.
- Exported library APIs, package exports, public classes/functions/types.
- Background jobs, cron tasks, hooks, event handlers, postinstall behavior.
- Installation and uninstall behavior.

## Data And State

- Database schemas, migrations, ORM models, indexes, constraints.
- Serialized file formats, local runtime state, lockfiles, caches, ledgers.
- State machines: statuses, phases, valid transitions, blocked states, terminal states.
- Identifiers, naming rules, slugs, generated paths, timestamps.
- Idempotency keys, deduplication, replay behavior, repair behavior.

## Behavior And Invariants

- Validation rules and gates.
- Permissions and trust boundaries.
- Error categories, user-facing diagnostics, exit codes.
- Retry, timeout, cancellation, cleanup, rollback, and recovery logic.
- Concurrency and filesystem safety.
- Compatibility rules for existing files, old state, or old generated artifacts.
- Non-goals enforced by code or tests.

## Configuration

- Environment variables and defaults.
- Config files and schema.
- Feature flags and opt-out switches.
- Platform assumptions such as shell, OS, filesystem layout, network access.
- Tool dependencies such as `git`, package managers, compilers, linters, or formatters.

## Dependencies And Integrations

- Third-party services, APIs, databases, queues, storage, authentication providers.
- Local external tools invoked by scripts or runtime code.
- Failure impact of unavailable dependencies.
- Security-sensitive dependencies and secret handling.

## Tests And Verification

- Test framework and command surface.
- Contract tests that define public behavior.
- Fixture and snapshot meaning.
- Tests around migrations, compatibility, install, uninstall, generated mirrors, or plugin surfaces.
- Coverage gaps for critical behavior.
- Tests that contradict documentation or reveal hidden behavior.

## Operations

- Build, test, lint, release, publish, and postinstall flows.
- CI/CD assumptions.
- Observability: logs, diagnostics, doctor/repair commands, health checks.
- Backup/restore or cleanup behavior for persisted local state.
- Upgrade/downgrade and migration behavior.

## Evidence Quality

Mark a claim as weak when:

- It is only found in README/docs and not supported by code or tests.
- It depends on generated artifacts without identifying the generator.
- It comes from a single test with unclear intent.
- It is inferred from naming but not enforced.
- It changed recently and old docs still exist.
