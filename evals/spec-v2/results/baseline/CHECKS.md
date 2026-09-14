# 文档演练检查记录

日期：2026-09-07。产物：`概要设计.md`、`需求设计文档.md`；便携证据副本：`source.md`。全部文件位于 `/tmp/loopx-spec-baseline-xJrXVI/`。

本轮使用仓库 `skills/spec/SKILL.md`，metadata.version 0.4.7，阅读其架构一致性契约、详细设计模板，以及 design-review 技能和概要模板。辅助阅读 architecture-designer、go-style；阅读 kratos 检测规则后，由于夹具没有确认 Kratos，不施加框架专属约束。技术选择已由夹具接受，未生成提案、执行计划或代码。

## 实际执行的检查

- `python3 /tmp/loopx-spec-baseline-xJrXVI/check_documents.py`：退出码 0；28 项机械文档检查通过。覆盖 D-001～D-010 的唯一所有位置及完整索引、AC-001～AC-008 需求行、TC-001～TC-007 覆盖行、链接文件及锚点、代码围栏配对、核心节与每个模块五个子节。详细结果在 `document-check-results.json`。
- `cmp /Users/zhangyukun/project/loopx/evals/spec-v2/read-only-rpc.md /tmp/loopx-spec-baseline-xJrXVI/source.md`：退出码 0，证据副本与输入逐字节相同。
- source.md SHA-256：`c3b93794d44c459c9051c35644a659e06795a9f6d627bae3d5a64fef8ab496f5`。
- 作者自查：候选条件、原始 task.Symbol、Redis 投影区别、策略错误全失败、日期业务错误与 wire 错误区别、固定生成器版本及回滚失败规则均与夹具逐项对照。这是作者文档检查，不是独立设计评审。

## 渲染与验证限制

检查 PATH 中的 pandoc、markdown、chromium、google-chrome、mmdc，均未找到。Python 的 markdown、mistune 模块不可用；当前 Node 模块解析未找到 marked、markdown-it、playwright、puppeteer。未安装任何渲染工具。

本轮请求只要求两份中文设计 Markdown，因此未额外生成 HTML。未执行 Markdown 页面视觉检查或 Mermaid 渲染/语法验证；围栏配对检查不能证明图能渲染。以上工具检查只描述所查询路径和模块，不声称穷尽系统上全部应用。

没有访问真实 corporate-action 仓库、运行实现测试或 proto 生成，没有测试 baseline、编译通过或现网行为证据。未修改 loopx 仓库文件。设计评审未发生；材料保持待评审，缺失的 proto 元数据、错误构造、Go 版本/真实命令和运行负载仍明确标为待核实，不具备可执行交接条件。
