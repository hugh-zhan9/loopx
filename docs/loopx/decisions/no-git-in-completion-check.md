---
name: no-git-in-completion-check
applies_to: skills/shared/completion-check.md
clause: "does not invoke Git disposition"
---

# 完成检查不触发 Git 处置

**拒绝了什么**：静默完成检查连带执行或建议 commit/branch/push 等 Git 处置。

**动机**：完成检查的职责是验证新鲜性、spec 同步与知识写入授权；Git 处置
必须保持显式（`$finish` 双触发），否则完成声明会隐式携带外部可见副作用。

**原始上下文**：completion-check 与 finish 的职责切分（v2 reset）；README
"Standalone branch, commit... do not select finish"。

**推翻方式**：append-only，推翻需新决策文件显式引用本文件。
