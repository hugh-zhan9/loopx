---
name: lancet
description: "Applies loopx implementation-layer minimization discipline for over-engineering, reuse checks, stdlib and native alternatives, and smallest-correct-diff review. Not for replacing clarify, spec, workflow planning, or creating a new workflow state."
when_to_use: "lancet, over-engineering, YAGNI, unnecessary dependency, simplest diff, implementation minimization, review minimization, Codex implementation discipline"
metadata:
  version: "0.1.0"
---

# Lancet

`lancet` is a support lens, not a workflow state. Use it when implementation or review work risks unnecessary code, avoidable dependencies, extra files, or abstractions that should be deleted instead of expanded.

Codex-only automatic activation applies in this release. Manual use remains explicit elsewhere.

## loopx Boundary

Use `lancet` inside implementation and review layers. It should tighten execution, subagent, and reviewer behavior without collapsing planning freedom.

Do not use this skill for:

- `clarify` or `spec` planning
- replacing product, API, schema, or architecture decisions
- justifying skipped validation, error handling, security, accessibility, or regression coverage
- inventing a new workflow state or separate process lane

## Core Contract

Before adding code, check the cheapest correct option in this order:

1. Delete or skip the change if the requirement does not need it.
2. Reuse code that already exists in this repository.
3. Use the language stdlib or native platform capability.
4. Reuse an already-installed dependency.
5. Only then add new code, files, or dependencies.

## Implementation Discipline

- Prefer the smallest correct diff and fewest touched files.
- Fix root cause, not symptom.
- Treat new abstractions as a cost that must be justified by repeated use or a real boundary.
- Avoid speculative extensibility, placeholder layers, compatibility shims, and boilerplate wrappers unless the task requires them now.
- Keep one runnable check for non-trivial logic.
- Preserve validation, error handling, security, accessibility, and regression safety.

## Review Discipline

When `lancet` applies during review, explicitly inspect:

- over-engineering and unnecessary abstraction
- repo reuse opportunities
- stdlib or native-platform replacements
- avoidable dependencies
- deletable boilerplate or extra files

If a smaller correct alternative exists, call it out directly.

## Runtime Surface

User-level default and session state live under `~/.loopx/lancet/`.

- `config.json` stores default enablement behavior
- `session.json` stores current on/off session mode

Hook failures must silently degrade. Missing or corrupt state must fall back to safe defaults instead of blocking the session.

## Activation Notes

- Planning stages may mention that `lancet` activates at implementation time, but they must keep full planning freedom.
- Implementation and review stages may use the full `lancet` contract.
- `fix` uses the same `lancet` discipline as feature-driven implementation and review.

## Handoff Reminder

When handing work to implementers or reviewers, carry the distilled `lancet` rules instead of paraphrasing them into looser advice.
