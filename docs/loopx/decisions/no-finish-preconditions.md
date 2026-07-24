---
name: no-finish-preconditions
applies_to: skills/finish/SKILL.md
clause: "Never invent a review, verification, or knowledge-extraction precondition"
---

# finish 不得发明前置条件

**拒绝了什么**：为 `finish` 的任何 Git 处置选项要求 review 报告、extraction
candidate、audit artifact 或额外持久状态。

**动机**：v1 的 finish 曾携带 audit ledger 与 finish gates，导致 finish 与
review/completion-check 职责相互渗透，Git 处置被无关仪式阻塞。v2 重置将
finish 收敛为"仅 Git 处置"，验证与评审义务由 exec/review/completion-check
在各自阶段承担。

**原始上下文**：2026-07-13 skill-suite-v2-reset（`docs/loopx/design/2026-07-13-skill-suite-v2-reset/`）；
README "finish does not perform verification, review, or knowledge extraction"。

**推翻方式**：本库 append-only。推翻需新增决策文件显式引用本文件并说明依据。
