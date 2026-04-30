# LoopX 工作流全景参考


---

## 1. plan（共识规划）

**触发**：`$plan "任务描述"`
**用途**：纯规划，不写代码。是 build 的前置共识步骤。

### 流程

```
步骤1: Planner 出场
       → 创建初始计划 + plan-DR 摘要（原则、决策驱动、可行选项）
       → deliberate 模式下额外产出：预验尸（3场景）+ 扩展测试计划
         ↓
步骤2: [仅 --interactive] 用户审阅草稿
       → AskUserQuestion 呈现计划 + 原则/驱动/选项摘要
       → 选项：Proceed / Request changes / Skip review
         ↓
步骤3: Architect 出场
       → 审查架构合理性
       → 必须提供最强 steelman 反论 + 至少一个真实权衡张力
       → 如有可行则提供综合方案
       → deliberate 模式下：显式标记原则违规
         ↓ (必须等 Architect 完成)
步骤4: Critic 出场
       → 评估质量标准：原则-选项一致性、公平替代方案、风险缓解清晰度、
         可测试验收标准、具体验证步骤
       → 给出判定：APPROVE / ITERATE / REJECT
       → deliberate 模式下：缺失/弱预验尸或测试计划 → 直接 REJECT
         ↓
步骤5: 如果 Critic 不是 APPROVE → 循环（最多5轮）:
       ├─ 收集 Architect + Critic 反馈
       ├─ Planner 修订计划
       ├─ Architect 重新审查
       └─ Critic 重新评估
         ↓ (Critic APPROVE 或 5轮耗尽)
步骤6: [仅 --interactive] 用户最终批准
       → 呈现计划 + 可选：Approve(build) / Request changes / Reject
       → 最终计划必须包含：ADR、可用代理清单、执行提示
         ↓
步骤7: [仅 --interactive] 用户选择执行方式
       → build：顺序执行 + 验证
```

### 关键点

- 步骤3和4是**串行**的，不能并行——必须等 Architect 完成后才调 Critic
- 三个角色不是同时在线，而是按需轮换
- 步骤5的循环里三个角色都会被重新调用
- 日志示例：
  ```
  Waiting for Hume [architect]...        ← 步骤3
  Waiting for Kant [critic]...           ← 步骤4
  ITERATE - 循环回来
  Waiting for Copernicus [planner]...    ← 步骤5 修订
  Waiting for Tesla [architect]...       ← 步骤5 重审
  Waiting for Galileo [critic]...        ← 步骤5 重评
  APPROVE ✓
  ```

---

## 2. build（持久执行循环）

**触发**：`$build "任务描述"`
**用途**：带持久化和验证的执行循环，保证任务完成。

### 流程

```
步骤0: Pre-context 收集
       → 生成 .LoopX/context/{task-slug}-{timestamp}.md
       → 包含：任务陈述、期望结果、已知事实、约束、未知、代码触点
       → 如高歧义：先 explore → clarify --quick
         ↓
步骤1: 审查进度
       → 检查 TODO 列表和先前迭代状态
         ↓
步骤2: 继续未完成工作
       → 从中断处接续
         ↓
步骤3: 并行委派
       → Executor 按 tier 分发任务：
         ├─ LOW tier：简单查找（"这个函数返回什么？"）
         ├─ STANDARD tier：标准实现（"给模块加错误处理"）
         └─ THOROUGH tier：复杂分析（"调试这个竞态条件"）
       → 独立任务同时发射，不串行等待
         ↓
步骤4: 后台运行长操作
       → npm install、build、test suite → run_in_background: true
         ↓
步骤5: [有截图/参考图] Visual 任务门控
       → 每次编辑前运行 $visual-verdict
       → 通过阈值：score >= 90
         ↓
步骤6: 验证完成（用新证据）
       ├─ 运行验证命令（test、build、lint）
       ├─ 读取输出确认实际通过
       └─ 检查：零 pending/in_progress TODO
         ↓
步骤7: Architect 验收（分 tier）
       ├─ <5 文件, <100 行 + 完整测试 → STANDARD tier 最低
       ├─ 标准变更 → STANDARD tier
       └─ >20 文件 或 安全/架构变更 → THOROUGH tier
         ↓
步骤7.5: 强制 Deslop 清理
       → 运行 ai-slop-cleaner（仅限本次变更文件）
       → 标准模式（非 --review）
         ↓
步骤7.6: 回归再验证
       → 重新运行所有 test/build/lint
       → 如 deslop 后回归失败 → 回滚或修复 → 重试
         ↓
步骤8: 通过 → /cancel 退出清理
       不通过 → 修复问题 → 回到同 tier 重新验证
       → 最多10轮迭代
```

### 关键点

- Executor 并行执行，Architect 验收是独立的最后一步
- 有 deslop 清理轮（7.5）和回归再验证轮（7.6），确保代码质量
- 最多10轮迭代；同一问题出现3+次 → 报告为根本性问题
- 日志示例：
  ```
  [build iteration 1/10] 执行中...
  delegate(executor, LOW, "Add type export")          ← 并行
  delegate(executor, STANDARD, "Implement caching")    ← 并行
  delegate(executor, THOROUGH, "Refactor auth")        ← 并行
  npm test → 42 passed, 0 failed                       ← 步骤6
  Waiting for Newton [architect]...                     ← 步骤7
  ai-slop-cleaner → 0 issues                           ← 步骤7.5
  npm test → 42 passed, 0 failed                       ← 步骤7.6
  APPROVED ✓
  ```

---

## 3. Autopilot（全自主流水线）

**触发**：`$autopilot "想法描述"`
**用途**：从模糊想法到可运行代码的完整全自动流水线。

### 流程

```
步骤0: Pre-context 收集（同 plan/build）
         ↓
Phase 0 — 扩展
  ├─ Analyst（THOROUGH tier）：提取需求
  └─ Architect（THOROUGH tier）：创建技术规格
  → 输出：.LoopX/plans/autopilot-spec.md
         ↓
Phase 1 — 规划
  ├─ Architect（THOROUGH tier）：创建实现计划
  └─ Critic（THOROUGH tier）：验证计划
  → 输出：.LoopX/plans/autopilot-impl.md
         ↓
Phase 2 — 执行
  → 调用 build + Ultrawork 并行实现
  ├─ LOW tier executor：简单任务
  ├─ STANDARD tier executor：标准任务
  └─ THOROUGH tier executor/architect：复杂任务
         ↓
Phase 3 — QA（UltraQA 模式）
  → build → lint → test → 修复失败
  → 最多循环5次
  → 同一错误重复3次 → 停止，报告根本问题
         ↓
Phase 4 — 验证（三路并行）
  ├─ Architect：功能完整性
  ├─ Security-reviewer：漏洞检查
  └─ Code-reviewer：质量审查
  → 三路全部 APPROVE 才通过
  → 被拒 → 修复 → 重新验证（最多3轮）
         ↓
Phase 5 — 清理
  → state_clear: autopilot + build + ultrawork + ultraqa
  → 或 /cancel 退出
```

### 关键点

- Phase 之间严格串行，Phase 内部可以并行
- Phase 4 是三路**并行**验证，不需要等前一个完成
- 包含整个 build 循环 + QA 循环 + 三路验证，是最重的模式
- 日志示例：
  ```
  Phase 0: Waiting for Darwin [analyst]...             ← 扩展需求
  Phase 0: Waiting for Euler [architect]...            ← 技术规格
  Phase 1: Waiting for Gauss [architect]...            ← 实现计划
  Phase 1: Waiting for Locke [critic]...               ← 验证计划
  Phase 2: [build loop] delegating executors...        ← 执行
  Phase 3: build ✓ lint ✓ test 2/5 fix...              ← QA 循环
  Phase 4: Waiting for Maxwell [architect]...          ← ┐
  Phase 4: Waiting for Curie [security-reviewer]...    ← ├ 并行
  Phase 4: Waiting for Turing [code-reviewer]...       ← ┘
  ALL APPROVED ✓
  ```

---


---

## 5. clarify（苏格拉底式需求澄清）

**触发**：`$clarify "模糊想法"`
**用途**：不写代码、不出计划。只产出需求规格，喂给下游。

### 流程

```
步骤1: 确定深度
       ├─ --quick：快速 pre-PRD，目标歧义 ≤0.30，最多5轮
       ├─ --standard（默认）：完整需求访谈，目标 ≤0.20，最多12轮
       └─ --deep：高严谨度探索，目标 ≤0.15，最多20轮
         ↓
步骤2: 每轮提问
       → 每次只问一个问题（绝不批量）
       → 先问意图和边界，后问实现细节
       → 每个答案都当声明来压力测试：
         ├─ 要求证据或示例
         ├─ 暴露隐含假设
         ├─ 迫使权衡或划界
         └─ 区分根因 vs 症状
         ↓
步骤3: 量化歧义评分
       → 计算当前歧义分数
       → 高于阈值 → 继续提问（留在同一维度深挖）
       → 低于阈值 → 进入结晶
         ↓
步骤4: 结晶
       → 至少一次显式压力回访（回顾之前的回答）
       → 输出执行就绪的规格文档
       → 写入 .LoopX/specs/clarify-{slug}-{timestamp}.md
         ↓
步骤5: 交给下游
       → plan / autopilot / build  拿到 spec 直接用
```

### 关键点

- 不写代码、不出计划——只产出 spec
- 歧义评分是量化的，不是主观感觉
- quick 模式（5轮）用于给 plan 做快速 pre-pass
- 日志示例：
  ```
  [Round 1/12] Q: 你说"改进性能"，具体是哪个场景慢？
  A: 用户列表加载慢
  Ambiguity: 0.45 → still high

  [Round 2/12] Q: 多慢算"慢"？有基线数据吗？
  A: 现在3秒，目标500ms以内
  Ambiguity: 0.32

  [Round 3/12] Q: 数据量多大？分页还是全量？
  A: ~10万条，必须全量加载
  Ambiguity: 0.18 → below threshold

  Spec written to .LoopX/specs/clarify-perf-{timestamp}.md
  ```

---

## 关系总图

```
     clarify（需求澄清，产出 spec）
       ↓ spec 喂入
   plan（共识规划，产出计划）←── 也可独立使用
       ↓ 计划批准后
    build（顺序执行）      
       ↓ 计划批准后
    review


autopilot = 扩展 + 规划 + build + QA + 三路验证（包含全部）
```

## 模式选择速查

| 你的情况 | 用什么 |
|---------|--------|
| 想法很模糊，不知道要做什么 | `$clarify` |
| 知道要做什么，想先对齐方案 | `$plan` |
| 任务明确，要保证做完 | `$build` |
| 一句话描述想法，想全自动 | `$autopilot` ||
