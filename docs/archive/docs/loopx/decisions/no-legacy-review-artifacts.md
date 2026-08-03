---
name: no-legacy-review-artifacts
superseded_by: docs-first-pivot
applies_to: skills/review/SKILL.md
clause: "Do not require or create a task-review report, feedback ledger, final-review"
---

# 评审不产出旧式报告与账本

**拒绝了什么**：`review` 及其意图入口（`final-review`、`fix-review`）默认
产出 review 报告、feedback ledger、coverage matrix、readiness ledger 或
finish-gate 记录；恢复 `.loopx/final-review/`、`.loopx/fix-review/` 旧状态。

**动机**：v1 的 final-review/fix-review 各自维护报告与反馈账本协议，产物
成为完成仪式而非质量证据。v2 将评审证据留在 owner-only 执行状态，用户可见
产物仅在显式要求或外部流程需要时生成。

**原始上下文**：2026-07-13 skill-suite-v2-reset；review v0.4 收敛三种意图。

**推翻方式**：append-only，推翻需新决策文件显式引用本文件。
