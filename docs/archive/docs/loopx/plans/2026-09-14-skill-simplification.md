---
schema: loopx-plan/v1
source: "User request in this conversation, 2026-09-14: improve descriptions, simplify issue/debug/fix, accept working-agreement and evaluation improvements, then remove AI-like wording."
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

# Skill 文本精简

## Goal And Boundaries

用户接受 description、常驻工作约定和行为评测的改进，并要求文字简单易懂。
用户已明确选择把 issue/debug/fix 合并为 debug，移除 issue、fix 入口；诊断
请求止于原因，修复请求继续修改和验证，不默认建台账，仍支持已有台账。
公开决定已先记入 docs/loopx/specs/installation.md。

不修改 spec、clarify、spec-v2、clarify-v2 的文件。generate-api-docs
只改 description 和版本，保留实测要求以及 lancet、humanize-doc 两轮处理。
保留 Git 授权、独立评审、用户修改保护、数据并发政策及其他技能的自动发现设置。
所有编辑在仓库内完成，不覆盖已安装的技能，不提交。

已有未提交修改见本次临时快照的 status.txt 和 baseline.diff；以该快照
区分本次修改。修改前 npm test 通过 130/130。

## P-001 准确描述入口和日常工作要求

缩短本次范围内的 description，把用途和容易混淆的条件写在前面。
issue/debug/fix 的描述随合并决定另行安排。更新技能版本和契约矩阵。
校验器不再要求固定的 Not for 句式。工作约定按变更影响选择读取和测试，
明确何时必须停止，以及已经授权的工作应继续完成。

> writes: skills/*/SKILL.md（上述四个保护目录及 issue/debug/fix 除外）, templates/working-agreement.md, AGENTS.md, scripts/verify-skills.mjs, test/skill-governance.test.mjs, test/fixtures/skill-contract-matrix.json
> anchors: 用户第 1、6 项及简单易懂的文字要求；保留第 5 项
> architecture: skills 仍是唯一技能来源；沿用现有校验器和工作约定安装入口，不增加运行时或配置；安装保护由现有测试验证
> verify: node scripts/verify-skills.mjs; node --test test/skill-governance.test.mjs test/execution-skill-contract.test.mjs
> review: 检查触发范围是否漂移，授权、兼容性和评审约束是否保留

## P-002 合并诊断和修复入口

按已接受的公开决定重写 debug。保留定位根因、用户授权、回归检查、最小修复、
工作区保护和必要独立评审。将旧台账的恢复规则放入按需读取的参考文件，保留
状态、范围、检查点和报告；不保留旧的技能跳转或默认建台账要求。旧台账恢复
仍要核对内容，不能只凭文件名或 ready_for_fix 状态执行。移除 issue/fix 源码、
安装清单和公开用法，更新直接消费者、版本及契约矩阵。

沿用 install-discovery.mjs 的旧技能清理逻辑，把 doc-readability 的完整目录、
内容散列和链接检查扩展到 issue/fix。仅清理确认归 loopx 所有且未修改的副本；
修改过、无记录、外来或链接副本保留。两个宿主及 plugin 共用现有安装实现。

> writes: skills/debug/**, skills/issue/**（删除）, skills/fix/**（删除）, skills/{exec,lancet,using-git-worktrees}/SKILL.md, skills/RESOLVER.md, src/install-discovery.mjs, package.json, README*.md, docs/loopx/skills*.md, docs/loopx/specs/installation.md, test/{debug-skill-install,skill-governance,skill-handoff-contract,workflow}.test.mjs, test/fixtures/skill-contract-matrix.json, evals/drills/**
> anchors: 用户已选择单一 debug 入口；installation.md 的 Diagnosis And Repair 及 Installer Behavior
> architecture: 沿用现有技能、安装器和台账记录；删除入口而不增加别名、路由器、运行状态或服务；诊断和修复由宿主解释同一份技能
> verify: 双宿主升级与重复安装、修改/未知/外来/链接副本保护测试；技能校验；诊断与授权修复、旧台账恢复演练；npm test
> review: 独立评审确切差异，检查迁移删除保护、权限、恢复、文档引用及 docs-first 边界

## P-003 验证触发和行为，检查文字

复用 evals/drills 的场景格式、加载器和测试；增加日常工作、相邻技能选择和
已有授权的案例。用同一组正例、反例和相邻任务比较原描述与改后描述；
另加 spec → design-review → plan2exec 的交接案例，检查决定和验收是否
传给下游。四个保护目录只读。诊断和修复的评测随 P-002 补充。技能发现只提供名字和描述，执行行为
演练才提供正文。独立评估者先做任务，再由另一轮评审检查结果，不向被测代理提供
预期答案；评审者仍读取场景的判分依据。保存输入、版本、实际选择、额外提问及读取材料。仅记录宿主
实际提供的耗时和 token，缺失时写明未测。交接判断不能冒充完整端到端
执行，静态检查不能证明行为。保存结果与限制，不用静态匹配或单次演练声称
模型能力、速度或费用已改善。按 humanize-doc 检查本次改动的用词和语义。

> writes: evals/drills/**, src/drill-eval.mjs, scripts/run-drills.mjs, test/drills.test.mjs, P-001 已经声明的文件（仅处理评测发现和文字修改）
> anchors: 用户第 7 项及最后的去 AI 味要求；不改变四个受保护技能或 API 文档处理流程
> architecture: 扩展仓库已有演练工具，场景和结果不进入发布包；不创建另一套执行引擎；测试加载与判分，独立演练检查行为
> verify: npm test; node scripts/run-drills.mjs --dry-run; 独立宿主演练；与修改前快照核对保护文件及用户修改
> review: 独立检查本次完整差异和行为结果，检查无新增审批、术语或运行时

## Integration And Final Verification

运行 npm test 和演练输入校验，检查链接、技能版本、打包规则及完整差异。
核对四个保护目录完全不变，generate-api-docs 正文不变，已有用户修改仍在。
说明实际演练覆盖与限制；P-002 与 P-003 全部完成后再归档本计划。

## Handoff And Residual Risks

- Review evidence: /root/plan_review，P-001 独立计划评审通过；合并决定后重新评审 P-002，计划 SHA-256 ba97fd45d29d65ec0d8dcf3d3d5eb36a91810b166b3eaa0c0bb0632a1587ccbb。
- Product review: 安装断言和 HTTP 限定两项发现已修正并独立复核通过。双宿主迁移和原有保护用例 23/23；workflow 独立复跑 21/21。
- Evaluation review: 39 项答复独立判定通过；判定报告 SHA-256 8d2b49fbb72d170b217072b9999c83505fb30bbf47298a95980d8df63157236f。描述选择的自动引用检查范围已在 README 说明。
- Verification: npm test 142/142；25 个发布技能校验通过；11 个演练输入通过。四个保护目录的 11 个文件及 generate-api-docs 正文与开始快照一致。
- Blockers: 无。
- Residual risks: 单次判断演练不能证明自动触发、端到端执行或效率改善。独立插件测试和通用元数据校验器的既有问题见 evals/drills/RESULTS.md；本次未改这些约定。
- Resume note: 请求范围已完成。原始输入、答复和独立判定保存在 evals/drills/results/2026-09-14-skill-simplification.json；未提交，未覆盖用户已安装技能。
