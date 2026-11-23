---
name: code-review
description: "Run an independent two-axis diff review: Standards (repo conventions + code smells + guardrails) and Spec (requirements fidelity + scope creep)."
disable-model-invocation: true
metadata:
  version: "0.2.0"
  when_to_use: "code-review, review diff, review PR, standards review, spec review, two-axis review, 代码评审"
---

# Code Review

Review changes since a fixed point (commit, branch, merge-base, or working tree)
along two independent axes so one axis never masks failures on the other:

- **Standards axis:** repo coding conventions, deterministic guardrails, and code smells.
- **Spec axis:** completeness against originating requirements/spec and absence of scope creep.

Run both axes as **parallel read-only leaf subagents** when the host supports
delegation; never let reviewers edit files.

## Process

1. **Pin the diff:** capture the exact diff (`git diff <base>...HEAD` or working
   tree diff) and confirm it is non-empty.
2. **Run deterministic guardrails first:** run
   `node skills/code-review/scripts/check-guardrails.mjs` (when available) on the diff
   and include any findings in the Standards axis.
3. **Locate sources:**
   - *Standards:* `AGENTS.md`, `CLAUDE.md`, `CODING_STANDARDS.md`, `docs/loopx/specs/`,
     plus the **Smell Baseline** below (documented repo standards override baseline smells).
   - *Spec:* linked requirement, `docs/loopx/design/*/概要设计.md`, `需求设计文档.md`,
     plan source, or user prompt.
4. **Dispatch two parallel read-only reviewers:**
   - **Standards reviewer brief:** check every hunk against documented standards,
     guardrail output, and baseline smells. Separate hard violations (cite rule/file)
     from judgement calls (name smell + quote hunk). Skip anything linters enforce.
     Keep under 400 words.
   - **Spec reviewer brief:** compare the diff against the original source
     behavior (not just anchor IDs). Report: (a) missing/partial requirements,
     (b) unrequested behavior / scope creep / unrequested fallbacks,
     (c) behavior that looks wrong on edge/failure cases. Cite source lines.
     Keep under 400 words.
5. **Report side by side:** present `## Standards` and `## Spec` separately without
   merging or reranking across axes. End with a one-line count per axis and the
   highest-severity issue in each axis.

## Smell Baseline (judgement calls; repo standards win)

- **Duplicated Code / Parallel Truth:** same policy repeated or bypassing an owning module.
- **Shallow Module / Pass-Through:** wrapper whose interface is as complex as its body (fails deletion test).
- **Feature Envy / Divergent Change / Shotgun Surgery:** misplaced responsibility or scattered edits.
- **Primitive Obsession / Data Clumps:** raw primitives or repeated param groups begging for a domain type.
- **Speculative Generality:** unused abstractions, flags, or hooks the spec never asked for.

## Resolving findings

The primary agent verifies every finding against code and requirements (a severity
label alone is not a repair order). Fix confirmed Critical/Important findings
together, re-verify freshly, and independently re-review only the fix and
affected scope. Explain rejected findings with evidence.
