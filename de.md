


根据 ralplan 定义：

流程

步骤1: Planner 出场 → 创建计划 + RALPLAN-DR 摘要                                                                                                                                                                   
↓                                                                                                                                                                                                          
步骤2: [仅 --interactive] 用户审阅草稿                                                                                                                                                                             
↓                                                                                                                                                                                                          
步骤3: Architect 出场 → 审查架构 + steelman 反论                                                                                                                                                                   
↓ (必须等 Architect 完成)                                                                                                                                                                                  
步骤4: Critic 出场 → 评估质量，给出 APPROVE / ITERATE / REJECT
↓                                                                                                                                                                                                          
步骤5: 如果 Critic 不是 APPROVE → 循环（最多5轮）:   
├─ 收集 Architect + Critic 反馈                                                                                                                                                                            
├─ Planner 修订计划                                                                                                                                                                                        
├─ Architect 重新审查                                                                                                                                                                                      
└─ Critic 重新评估                                                                                                                                                                                         
↓                                                                                                                                                                                                          
步骤6: [仅 --interactive] 用户最终批准                                                                                                                                                                             
步骤7: [仅 --interactive] 用户选择执行方式 (ralph / team)

关键点

- 步骤3和4是串行的，不能并行——必须等 Architect 完成后才调 Critic
- 三个角色不是同时在线，而是按需轮换
- 步骤5的循环里三个角色都会被重新调用
- 所以你在日志里会看到类似：

Waiting for Hume [architect]...        ← 步骤3                                                                                                                                                                     
Waiting for Kant [critic]...           ← 步骤4                                                                                                                                                                     
ITERATE - 循环回来                                                                                                                                                                                                 
Waiting for Copernicus [planner]...    ← 步骤5 修订                                                                                                                                                                
Waiting for Tesla [architect]...       ← 步骤5 重审                                                                                                                                                                
Waiting for Galileo [critic]...        ← 步骤5 重评                                                                                                                                                                
APPROVE ✓    