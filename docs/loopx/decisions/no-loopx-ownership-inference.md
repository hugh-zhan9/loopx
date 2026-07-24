---
name: no-loopx-ownership-inference
applies_to: skills/finish/SKILL.md
clause: "infer loopx ownership from a `.loopx` directory, historical workflow state"
---

# 不得从环境形态推断 loopx 归属

**拒绝了什么**：从 `.loopx` 目录存在、历史 workflow 状态、分支名、worktree
形态、改动文件或 Git 词汇推断"这是 loopx 管理的工作"从而触发 `finish` 或
推荐 `$finish`。

**动机**：历史上 hook 与 finish 曾从扫描到的历史状态推断完成度并推荐
`$finish`，把无关的 Git 请求卷进工作流。归属只能来自显式 `$finish` 调用或
活跃 `exec`/`fix` 运行上下文；workflow-state 注入对目录扫描到的历史状态也
遵守同一规则（不推断 next skill / finish）。

**原始上下文**：trellis-hardening 测试"workflow hooks do not infer finish
from historical state without an explicit workflow identity"；finish v0.4
边界强化。

**推翻方式**：append-only，推翻需新决策文件显式引用本文件。
