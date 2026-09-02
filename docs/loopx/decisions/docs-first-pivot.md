---
name: docs-first-pivot
applies_to: templates/working-agreement.md
clause: "Never commit, push, merge, or discard work unless the user explicitly asks."
---

# v0.8：产物是文档，执行归模型

**2026-09-02 修订**：主线重新提供单文件 `exec` skill，作为用户显式选择的
宿主原生 subagent playbook，只消费一份 ready `plan2exec` plan。它不恢复
CLI runtime、hooks、独立 workflow state、scheduler 脚本或强制 review pipeline；
执行原语与 agent 生命周期仍由模型和宿主拥有。由于该 skill 仅描述用户显式选择的
宿主原生协作方式，不提供新的执行原语、默认路由或持久状态，这次修订不逆转
execution ownership；任何 runtime、默认编排或 loopx-owned scheduler 的回归仍需新的
对比评估与架构决定。

**决定了什么**：v0.8 初始将 loopx 的核心交付物改为 working agreement 文档 +
三个产出文档的 skills（clarify / spec / plan2exec-as-schema）。当时溶解 exec、subagent-exec、
parallel-subagent-exec、review、final-review、fix-review、finish、每轮
workflow hook 及其运行时（adaptive-exec 等约九个脚本）。执行、评审、验证与
Git 纪律成为 working agreement 的条款，由模型和宿主原生能力履行。

**依据**：benchmark-protocol-v3（`evals/benchmark/RESULTS.md`，2026-07-25）。
升级陷阱上 loopx +65pp [40,85] vs 裸模型，但 docs-only 一份文档同样达成且
token 仅 1/3（candidate vs docs-only -5.3pp [-10.5,-1.3]，配对零胜）；能力
三类对前沿模型全天花板；v0.7 运行时引入真实回归（eventbus 1/3、csv 2/3）且
整体更贵。宿主原生 subagent/worktree/resume 已覆盖执行原语。

**取代**：no-finish-preconditions、no-git-in-completion-check、
no-legacy-review-artifacts、no-loopx-ownership-inference 四条记录的管辖对象随
v0.8 删除，其精神由 working agreement 的 Git 与评审条款延续。原记录保存在
`docs/archive/docs/loopx/decisions/`，仅供历史分析。

**保留的可证伪假设**：clarify/spec 产物对"需求半模糊任务"的增益尚未测量；
弱模型可能从编排获益。两者列为 v0.8 的判决性实验。
