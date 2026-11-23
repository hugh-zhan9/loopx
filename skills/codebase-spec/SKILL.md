---
name: codebase-spec
description: "Document what an existing codebase or module currently does from source evidence (现状规格、逆向文档)."
disable-model-invocation: true
metadata:
  version: "0.2.0"
  when_to_use: "codebase-spec, reverse spec, document existing project, extract architecture from code, 逆向规格, 现状规格"
---

# Codebase Spec

Document current repository or module behavior from direct source evidence.
Do not edit code, invent future intent, or write an implementation plan (use
`/spec` for future design).

## Process

1. **Match requested scope and depth.** Honor the exact module or whole-repo
   target. Record the inspected commit SHA, relevant uncommitted working-tree
   changes, commands run, and any sampling limits. Never print secrets.
2. **Trace real code paths:**
   - Map manifests, entry points, canonical vs generated files, and tests.
   - Trace CLI/HTTP/RPC/job/plugin entry points through handlers, dependencies,
     state transitions, schemas, auth, errors, concurrency, and side effects.
   - Compare maintained docs against executable code and note contradictions.
   - Load [evidence-checklist.md](references/evidence-checklist.md) only for
     multi-surface or complex module surveys.
3. **Tag every claim accurately:** distinguish **Observed** (with file/symbol
   citations), **Inferred**, **Unknown**, and **Contradiction**. Reading a
   test file does not prove it passed.

## Deliver

Use [output-template.md](references/output-template.md) as an adaptable guide,
not a fixed chapter checklist. Update an existing maintained document in place
when present (preserving content outside scope), answer in chat for chat-only
explanations, or write new docs to
`docs/loopx/codebase-specs/<target>-codebase-spec.md`.

Keep exact command, field, state, and API names. Report the output path,
coverage, and material unknowns or doc-vs-code contradictions.
