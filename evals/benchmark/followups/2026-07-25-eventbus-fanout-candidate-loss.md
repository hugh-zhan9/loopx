---
task: parallel-trap-eventbus-fanout
verdict: candidate 1/3 vs bare 3/3, docs-only 3/3, baseline 3/3
protocol: benchmark-protocol-v3
---

# 候选臂在 eventbus-fanout 上明确落败

唯一四臂对照中候选唯一低于所有对照臂的任务。假设方向：v0.7 的并行
执行路径（parallel-strict 准入或集成顺序）在共享事件总线场景下引入
回归，或 hidden 集成测试暴露了 lost-update。需要读取该任务 3 次候选
运行的 raw diff 与 hidden 输出定位。在结论出来前，此项按协议阻止
"候选无回归"的任何表述。
