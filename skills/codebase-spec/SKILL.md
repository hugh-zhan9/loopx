---
name: codebase-spec
description: "Reverse-engineers a detailed, evidence-backed specification from an existing codebase, including behavior, architecture, contracts, data, operations, tests, and gaps. Not for writing a forward design from unresolved requirements, planning implementation, or changing code."
when_to_use: "codebase-spec, reverse spec, reverse-engineer spec, code to spec, document existing project, extract architecture from code, 逆向规格, 生成现状规格, 从代码生成规格文档"
metadata:
  version: "0.1.2"
---

# Codebase Spec

## Purpose

Create a detailed specification from the repository as it exists. Treat the code, tests, configuration, migrations, generated artifacts, and documentation as evidence. The output should help a reader understand what the system currently does, where the authoritative behavior lives, and which claims are inferred or unknown.

Do not make the document artificially brief. A codebase-spec is allowed to be long when the repository evidence is rich. The standard is not concision; the standard is traceable completeness.

## Boundary

Use this skill when the user wants documentation generated from an existing project or module. This is not the same job as `spec`, which designs a future change from clarified requirements.

Do not:

- Change code while generating the spec.
- Invent product intent that is not visible in code, tests, docs, or user-provided context.
- Present guesses as facts.
- Convert the output into a task plan. If follow-up work is needed, list it as gaps or candidate questions.
- Treat README claims as authoritative when code contradicts them. Prefer implementation evidence and call out the conflict.

## Evidence Standard

Record the inspected commit/hash when available, generation timestamp, major
commands/tools used, and sampling limits. Never print secret values; name only
the file, variable, or secret-bearing surface inspected.

Every material claim should have one of these evidence labels:

| Label | Meaning |
|---|---|
| `Observed` | Directly visible in code, tests, config, migrations, docs, or generated artifacts. |
| `Inferred` | Reasonable conclusion from several observed facts, but not explicitly stated. |
| `Unknown` | Not recoverable from the repository evidence inspected. |
| `Contradiction` | Repository sources disagree. Name both sources. |

Prefer file references for important claims. When a section has many repeated facts, cite representative files and explain the pattern instead of citing every occurrence.

## Setup

If the user already named a target, use it. Otherwise choose a practical default and state it:

- Small or medium repository: analyze the whole repository.
- Large repository or monorepo: start with the root map, then ask for the target module unless the user said to use judgment.
- Recent-change request: analyze the relevant git diff plus affected modules.

Ask only when scope affects correctness. Useful scope choices:

1. Entire repository.
2. Specific directory or module.
3. Specific interface such as CLI, REST API, database model, workflow engine, plugin surface, or public library API.
4. Comparison between documented behavior and implemented behavior.

Depth choices:

| Depth | Use When | Output |
|---|---|---|
| Overview | User wants onboarding or a fast map. | System purpose, major components, primary interfaces, known gaps. |
| Standard | Default. | Complete user-facing and developer-facing behavior, contracts, data, config, tests, operations, and risks. |
| Deep | User wants rebuild-grade or audit-grade documentation. | Standard plus internal flows, state machines, dependency graph, invariants, edge cases, failure modes, and source conflicts. |

## STOP Conditions

Stop before writing the final spec when:

- The requested target is ambiguous and choosing the wrong module would produce a misleading document.
- The repository cannot be read enough to support the requested depth.
- The user asks for future design, implementation planning, or code changes instead of current-state documentation.

## Scan Order

Gather evidence before writing. Adapt to the repository, but use this order:

1. Repository identity: package manifests, module files, lockfiles, README, license, entry points.
2. Directory map: top-level directories, generated mirrors, templates, scripts, docs, tests, assets.
3. Runtime surfaces: CLI commands, HTTP routes, RPC/proto contracts, exported library APIs, background jobs, hooks, plugins.
4. Data and state: schemas, migrations, serialized formats, state files, enums, status transitions, locks, caches.
5. Core behavior: workflow transitions, validation gates, authorization, error handling, retries, idempotency, concurrency controls.
6. Configuration: environment variables, config files, defaults, feature flags, install paths, platform assumptions.
7. External dependencies: databases, queues, cloud services, local tools, package manager behavior, OS requirements.
8. Tests: contract tests, integration tests, fixtures, missing coverage, test-only behavior that documents intent.
9. Documentation: compare README, docs, design notes, and comments with code. Mark contradictions.
10. Operations: install, build, release, migrations, observability, troubleshooting, recovery paths.

For large repositories, first build an index of candidate evidence files, then read targeted files deeply. Do not read every file blindly when structure can guide selection.

## Detailed Checks

Read `references/evidence-checklist.md` when producing a Standard or Deep spec, or when the repository has multiple runtime surfaces.

Read `references/output-template.md` before writing the final Markdown. Use its section order unless the user requested a different format.

## Failure Handling

| Trigger | First action | If still blocked |
|---|---|---|
| Evidence conflicts | Mark the claim as `Contradiction` and cite both sources | Do not smooth the conflict into a single invented behavior |
| Evidence is missing | Mark the claim as `Unknown` and name the inspected paths | Do not infer product intent from naming alone |
| Repository is too large for one pass | Build a file index and sample authoritative surfaces first | Ask for a target module only when scope changes correctness |

## Output Location

Write Markdown by default:

- Whole repository: `docs/loopx/codebase-specs/<project-name>-codebase-spec.md`
- Module: `docs/loopx/codebase-specs/<module-name>-codebase-spec.md`
- Interface: `docs/loopx/codebase-specs/<interface-name>-codebase-spec.md`

If the repository has an existing documentation convention for generated specs, follow it and state the path.

## Writing Rules

- Lead with what the system currently does, not with how the analysis was performed.
- Separate current behavior from intended behavior.
- Use exact names for commands, env vars, files, states, events, fields, and public APIs.
- Preserve important negative rules such as "does not mutate", "does not auto-commit", or "does not install broad surfaces".
- Include contradictions and gaps instead of smoothing them over.
- For generated or mirrored files, identify the canonical source and the generated copy.
- For tests, distinguish verified behavior from incidental implementation detail.
- For security, privacy, data loss, install, or release behavior, be conservative and cite evidence.

## Final Response

After writing the spec, report:

- Output path.
- Scope and depth used.
- Main evidence sources inspected.
- Highest-risk unknowns or contradictions.
- Whether the document is ready as-is or needs user review for product intent.
