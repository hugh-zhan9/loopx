---
schema: loopx-plan/v1
source: ../design/2026-11-11-task-scoped-workflows/概要设计.md
status: complete
slices:
  - id: P-001
    status: done
    depends: []
  - id: P-002
    status: done
    depends: [P-001]
  - id: P-003
    status: done
    depends: [P-002]
---
# Task范围协作实施

## Goal And Boundaries
实现已批准AC-1至6。只修改loopx源仓库；保留基线aa8e679已有本地提交。无Git处分、全局安装或新调度runtime。

## P-001 Task文档与现有技能衔接
新增task-split和共享范围/交接合同；优化入口、clarify/spec/plan/exec和review/recovery，保留小任务与旧plan行为。验收TC-1至6、8。
> writes: `skills/`, `templates/working-agreement.md`
> anchors: AC-1~5、D-001、D-002
> architecture: 共享文档合同，执行仍归宿主，无第二状态库。
> verify: 文档引用、场景走查、既有skill合同检查。

## P-002 安装与公开文档
新skill在两宿主与npm包可发现，自定义文件不覆盖，公开入口一致。
> writes: `src/install-discovery.mjs`, `src/workflow.mjs`, `package.json`, `README*`, `AGENTS.md`, `docs/loopx/`, `test/`, `scripts/verify-skills.mjs`
> anchors: AC-6、TC-7、TC-8
> architecture: 复用安装器、锁与模板治理，不增CLI调度命令。
> verify: 隔离安装集成、package清单、npm test。

## P-003 集成检查与独立审查
核对原批准目标、最终安装面和旧行为，修复明确问题。没有任务拆分效果的真实模型数据时明确说明。
> writes: `docs/loopx/`及上述范围内必要修正
> anchors: AC-1~6、TC-1~8
> architecture: 源码/合同/安装一致；不重做未变化证据。
> verify: 最终npm test，独立只读审查，diff检查。
> review: 公开工作流兼容、跨task范围及权限边界，完成前必须解决Important。

## Integration And Final Verification
原始来源为当前会话已批准的task/plan区分、上下文控制与整体流程优化；完整覆盖TC场景，并检查docs-first、小任务不加流程、旧plan兼容。

## Handoff And Residual Risks
基线npm test已通过；日志/tmp/loopx-task-scope/baseline.log。真实模型跨会话效率不由确定性测试证明。未提交推送。进度由本计划维护。

### 验证进展
基线196测试通过；新增两项安装/包测试在接入清单前exit1，接入后通过。完整npm test现198通过，无跳过。skill-creator quick_validate通过，drill dry-run通过。独立只读review和隔离task-split使用演练进行中；不将dry-run或单次走查称为模型效率统计。

### 完成记录
完整npm test最终198通过，无跳过；最后仅task-split接受状态文字修订，复核相关安装/交接/执行合同10测试及治理检查通过，30场景dry-run通过。两次独立forward演练及真实产物保存在evals/drills/results/2026-11-11-task-scope，修正了一人协调角色多余提问；r2轻微状态表述问题已在skill中澄清并独立文本复核，无第三轮行为实测。独立最终diff审查与受影响修正复审无剩余Critical/Important。未运行重复live-model基准，不声称token、耗时或review次数的普遍改善。未提交、推送、发布或覆盖个人安装。长期当前合同由skills/task-split和skills/shared/task-scope拥有；本计划与设计作为完成历史归档。
