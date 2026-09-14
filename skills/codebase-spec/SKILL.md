---
name: codebase-spec
description: "Document an existing codebase’s behavior and architecture from source evidence (现状规格、逆向文档). Use spec for future design."
metadata:
  version: "0.1.5"
  when_to_use: "codebase-spec, reverse spec, reverse-engineer spec, code to spec, document existing project, extract architecture from code, 逆向规格, 生成现状规格, 从代码生成规格文档"
---

# Codebase Spec

Document what an existing repository or module currently does, with traceable
behavior, architecture, contracts, data, operations, tests, and gaps. Do not change
code, invent product intent, or turn the result into an implementation plan.
Use `spec` for future design. Ordinary code reading during implementation does
not require a separate current-state document.

## Scope and evidence

Honor the target and depth named by the user. For a whole-repository request,
cover its major surfaces and disclose sampling; do not silently substitute one
module because the repository is large. Start with a repository map and ask only
when the intended target is materially ambiguous.

Choose the structure and depth from the requested subject. A module explanation
may need only its purpose, inputs, outputs, important behavior and evidence.
Expand into data, state, operations or failure handling only when relevant to that
subject. A requested whole-repository survey still covers all major surfaces and
states its sampling limits; brevity is not permission to omit required scope.

Record the inspected commit, relevant working-tree changes, timestamp, commands,
and sampling limits. A commit alone does not identify uncommitted behavior.
Never print secrets; identify the variable or secret-bearing surface instead.

Distinguish claims as **Observed**, **Inferred**, **Unknown**, or **Contradiction**.
Cite important files, symbols, tests, or configuration; repeated instances can use
a representative anchor with the inspected coverage stated. Code and tests show
current implementation, not approval to replace contrary future intent. When docs
and implementation disagree, name both sources and describe the actual mechanism.
A source read is not proof that its test passed or a runtime path was exercised.

## Investigate

1. Map manifests, entry points, canonical/generated sources, templates, and tests.
2. Trace the requested CLI, HTTP/RPC, library, job, hook, or plugin surfaces through
   their actual adapters and dependencies.
3. Inspect applicable schemas, migrations, serialized state, transitions,
   authorization, errors, concurrency, and side effects.
4. Establish configuration defaults, environment inputs, supported platforms,
   external dependencies, install/deployment, and recovery behavior.
5. Compare maintained docs and tests with those paths; record gaps and contradictions.

For large repositories, index candidate evidence and read the relevant paths
instead of opening every file. Read [evidence-checklist.md](references/evidence-checklist.md)
when documenting several runtime surfaces or a complex module. Read only the
relevant sections; it is not an output checklist.

## Write and deliver

Use [output-template.md](references/output-template.md) as guidance, not a required
chapter list. Follow the requested format or existing documentation convention.
Update the relevant maintained document when one exists, preserving useful content
outside the inspected scope. Do not create a second current description just to
use this skill. If documenting only a requested explanation in chat, answer there.
For a new persistent document without a specified path, write
`docs/loopx/codebase-specs/<project-or-module-or-interface>-codebase-spec.md`.

Lead with current behavior. Keep exact command, field, state, and API names; preserve
negative rules, ownership boundaries, and canonical/generated distinctions. Describe
unknowns from the inspected evidence, not from unsupported guesses about names.
If access cannot support the requested coverage, deliver the useful supported scope
with an explicit limitation; do not call a partial survey a complete specification.

Report the path, scope/depth, evidence coverage, and material unknowns or conflicts.
Do not claim verified runtime behavior unless the relevant checks actually ran.
