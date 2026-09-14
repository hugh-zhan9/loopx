---
name: docs-first-pivot
applies_to: templates/working-agreement.md
clause: "Never commit, push, merge, or discard work unless the user explicitly asks."
---

# v0.8：产物是文档，执行归模型

**2026-09-14 重构检查与验证入口合并（用户授权）**：保留 `codebase-spec`，
按实际范围整理现状并优先更新已有文档，不要求固定章节。`code-darwin` 的
重构检查和扫描脚本并入 `refactor-plan`，检查请求只交付发现，扫描按需使用。
移除独立 `verify` 入口，将必要的证据判断保留在 working agreement 和共享
验证说明中；验证继续随实施完成，不增加新的交接或文档要求。

**2026-09-14 简化文档与评审（用户授权，取代 09-07 的强制计划评审）**：
将 v2 实现迁入 `clarify`、`spec`，不保留试用入口。设计评审并入 `spec`，
计划评审并入 `plan2exec`；`refactor-plan` 继续独立，已批准的重构方案可直接实施。
默认不再生成独立《设计提案》。概要按需要简述选择理由，详细设计描述当前实现
方案与约束，不要求方案比较、否决选项或讨论流水账。已有概要设计中的独有
决定继续有效，不能因合并入口丢失。概要设计和详细设计仍保留各自分工；
局部小改动不必套完整模板。清楚的需求可直接实施，计划按实际需要使用。

计划仅在用户要求或存在具体高风险时需要独立评审；普通计划由作者核对后交付。
阻碍项须说明违反哪条已批准要求以及具体后果。格式、措辞和普通实现细节由作者
直接修正，不触发反复评审。首次评审检查完整计划，后续只核对修复及受影响内容；
新发现的实质风险仍须处理。实现已完成时直接核对原始需求、代码与验证证据，
不补跑开工前评审。计划不能自行删减验收要求，有理由延后也须有需求方授权。

这些改动保留 0.9.1 的 schema、架构证据和并行隔离规则，不增加
runtime、hooks 或单独状态。
并发规则统一放在 `skills/shared/database-concurrency.md`，由设计、计划、
评审和 SQL skill 消费；API 文档格式及迁移由对应 output contract 维护。

**2026-09-07 边界澄清（用户裁定）**：docs-first 不要求文档只能描述静态目标。
保留计划中的依赖图、进度、验证顺序、并行约束，以及 skill 中由模型履行的
执行和恢复说明；不按“完全 docs-first”删除这些规则。执行仍使用宿主原语，
不恢复 loopx runtime、scheduler 服务、hooks 或独立运行时状态。
文档能约束执行，但不提供执行引擎。

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
