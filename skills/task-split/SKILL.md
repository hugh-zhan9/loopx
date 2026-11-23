---
name: task-split
description: "Split a broad requirement into bounded development tasks with clear handoffs and dependencies (需求拆分)."
disable-model-invocation: true
metadata:
  version: "0.2.0"
  when_to_use: "task-split, broad requirement decomposition, serial task handoff, refine task breakdown, 需求拆分"
---

# Task Split

Divide a broad requirement into bounded assignments that people or agents can
complete and hand over cleanly. Do not write implementation plans, dispatch
workers, or start coding. Keep small, clear requests prompt-first without a
task package.

## Rules

1. **Establish requirement-level boundaries first.** Read the overall goal,
   protected behavior, main flows, owning modules, and any existing task
   breakdown. Preserve a useful human-provided breakdown and mark only newly
   proposed boundaries as `proposed`. If work already started, split only
   remaining work around verified results.
2. **Split by deliverable and context load, not layers.** Split when separate
   assignments reduce the rules and unfinished state one executor must hold at
   once, or create useful delivery handoffs (serial dependencies are valid).
   Keep tightly coupled work together rather than splitting by file count,
   technical layers, or agent count.
3. **Define each assignment crisply.** Record:
   - observable deliverable and source scope (link the authoritative source; do not duplicate the full PRD);
   - inputs/outputs, shared contracts, local vs cross-task decision owners, and acceptance;
   - exact dependency type (agreed contract vs delivered code vs integration proof) and what is needed to start vs finish;
   - requirement-level integration owner (task passes alone never prove requirement completion).
4. **Keep unresolved questions local and honest.** Resolve only questions that
   gate the split boundary; attach remaining questions to their owning task and
   due point instead of inventing answers.

## Output

Read [task-documents.md](references/task-documents.md) when producing a task
package. Reuse existing tracker items when present; otherwise write an index
and one brief per task under `docs/loopx/tasks/<requirement-slug>/`.

Each task may invoke `/clarify`, `/spec`, or `/plan2exec` only when needed.
This skill adds no CLI runtime, scheduler, or permission to mutate external
trackers. Report task boundaries, dependency order, unresolved decisions, and
the integration owner.
