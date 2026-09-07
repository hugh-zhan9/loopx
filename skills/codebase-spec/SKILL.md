---
name: codebase-spec
description: "Reverse-engineers a detailed, evidence-backed specification from an existing codebase, including behavior, architecture, contracts, data, operations, tests, and gaps. Not for writing a forward design from unresolved requirements, planning implementation, or changing code."
when_to_use: "codebase-spec, reverse spec, reverse-engineer spec, code to spec, document existing project, extract architecture from code, 逆向规格, 生成现状规格, 从代码生成规格文档"
metadata:
  version: "0.1.3"
---

# Codebase Spec

Document what an existing repository or module currently does, with traceable
behavior, architecture, contracts, data, operations, tests, and gaps. Do not change
code, invent product intent, or turn the result into an implementation plan.
Use `spec` for future design.

## Scope and evidence

Honor the target and depth named by the user. For a whole-repository request,
cover its major surfaces and disclose sampling; do not silently substitute one
module because the repository is large. Start with a repository map and ask only
when the intended target is materially ambiguous.

| Depth | Coverage |
| --- | --- |
| Overview | Purpose, components, primary interfaces, major gaps |
| Standard | Applicable behavior, contracts, data, configuration, operations, tests, risks |
| Deep | Standard plus internal flows, state machines, invariants, dependency boundaries, failure cases, source conflicts |

Default to Standard. Rich evidence may require a long specification; preserve
traceable completeness without filling irrelevant sections to satisfy a template.

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
for Standard/Deep or multiple-runtime-surface work.

## Write and deliver

Use [output-template.md](references/output-template.md) at the selected depth.
Follow a requested format or existing documentation convention. Otherwise write
`docs/loopx/codebase-specs/<project-or-module-or-interface>-codebase-spec.md`.

Lead with current behavior. Keep exact command, field, state, and API names; preserve
negative rules, ownership boundaries, and canonical/generated distinctions. Describe
unknowns from the inspected evidence, not from unsupported guesses about names.
If access cannot support the requested coverage, deliver the useful supported scope
with an explicit limitation; do not call a partial survey a complete specification.

Report the path, scope/depth, evidence coverage, and material unknowns or conflicts.
Do not claim verified runtime behavior unless the relevant checks actually ran.
