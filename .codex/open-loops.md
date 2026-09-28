# LyraMD Open Loops

## Open (2026-09-25)

- **人眼验收**：阶段 A/B/C 已落地；本轮又收敛为「草稿 / 工作目录」侧栏、工作目录 `+` 菜单、暖黄色行内星标、可关闭标签和解释性最近文件菜单。`npm test` 74 files / 578 tests 全绿，`npm run build` 通过；dev 正运行并会热更新。待 Cherry 在真实窗口确认布局与关闭交互。
- **Push**：本地 `main` 领先 `origin/main` 57 个提交，等待 Cherry 明确点头；未执行 push。
- **1.4.0 发版**：仍等 Cherry 决策。若进入发版，按 `docs/release-checklist.md` 重新出包，并做安装版 destructive drill + proof pack；`release/` 旧 dmg 不包含本轮代码。
- **后续候选（未立项）**：标签关闭前自动留恢复副本；正文宽度三档；Word 导出 Mermaid 图。详见 `docs/2026-09-15-竞品调研-ColoMD-2.4-主界面优化方案.md` §10。

## Done (2026-09-25)

- **阶段 A/B/C 标签页战役**：会话恢复、常驻单一顶栏与聚焦复核修复均已落地；A2 复核问题收口，阶段 C reviewer 判通过，启动恢复期间 openFile 窄竞态修复已提交 `56be6451`。
- **2026-09-25 主界面与标签交互优化**：实现见 CHANGELOG 未发布区；本轮测试/构建结论见上方 Open 项。

## Done (2026-09-28)

- **主界面改造收尾并提交**：标签条「+」新建入口（`2382cb63`）、侧栏工作目录/大纲互斥 + 多目录展开与移除保护 + 死代码清理（`51e92056`）、文档同步（`d2542f23`）。
- **修复 init 崩溃**：清理 `createFileItem` 时遗留 `meta` 引用导致 renderer init 中断、全部事件绑定失效（`b27d627f`）。

## Deferred (2026-09-28)

- **类型检查接入 pipeline（技术债）**：全链路 esbuild 转译 + vitest 无类型检查，TS 级错误（如 `meta is not defined`）必然逃逸到运行时。接入 `tsc --noEmit` 前需先清历史错误：
  1. `src/main/settings.ts` 4 处 TS2353/TS2339——`settingsSchemaVersion` 已被使用但 `AppSettings` 接口缺该字段（`8825f5f1` 引入）；
  2. tsconfig 跨 rootDir 引用（preload/renderer 引用 `src/main/update-notice.ts`、`settings.ts`，main 引用 `src/shared/local-media.ts` 报 TS6059），需调整 project references / rootDir 或抽 shared 编译单元；
  3. `src/main/ai-provider.test.ts` 2 处元组类型误用。
  用户拍板：先记录不发版前做，1.4.0-beta 发版后再排期。

## Done (2026-09-15)

- **修复新功能演示/语法速查弹出空白窗口**：新增 renderer-ready 握手（commit `df0069e9`）。
- **设置功能地图**：新功能归类进现有分页 + 公式/速查快捷键可自定义（commit `473bb9c2`）；应用内更新日志改从 CHANGELOG.md 动态渲染（commit `99da8d45`）。
- **新增 CHANGELOG.md**：仓库级更新日志，功能落地即记一笔。
- **ColaMD 竞品调研完成**：1.9→2.4 版本演进、标签页演化路径与文件安全语义、最近文件侧边栏的取舍已摸清，结论见当日会话报告；主界面优化（标签页）待用户拍板后立项。

- **文稿安全项①「补齐决策面」**：被拦面板新增「接受外部版本」「查看 diff」（commit `5bf9a908`）。详见 P0 计划 §0.2。
- **文稿安全项②「append-only 事件日志」**：`~/.lyramd/document-journal.jsonl`，12 类事件，写失败不阻断保存链（commit `2337631d`）。
- **C 表六条技术债**：全部收口并按功能块提交（2026-09-15）。

## Deferred (2026-09-15)

- **安装版 destructive drill**：用户拍板延后至下次发版——drill 依赖包含决策面与 journal 的新安装包，拿 1.3.7 旧包做意义不大。发版时随 release checklist 一并执行并留 proof pack。

## Deferred (2026-09-14)

- **分屏（横向 + 纵向）**：支持 split views later, both vertical and horizontal, while keeping the first-screen editor simple。
  用户 2026-09-14 明确本轮不做，等核心收口与文稿安全项完成后再排期；要求是**首屏编辑器保持简单**，不要把分屏做成默认多栏。
- **A2 长文分页图片导出**：暂缓。用户 2026-09-14 表示“现在还用不到”；且该项在上游返工 6 次，需要单独立项（`docs/2026-08-25-对比清单-LyraMD-vs-ColaMD.md` A2）。失败时退回只保 PDF / docx。

## 2026-05-05 follow-up requests

- Deferred (2026-09-14): Support split views later, both vertical and horizontal, while keeping the first-screen editor simple. 见上方 Deferred 段。
- Done 2026-05-05: Make the library `+` context-aware: on the drafts tab it creates a draft; on the workdir tab it creates a new `untitled*.md` file under the active work directory.
- Done 2026-05-05: Investigate restored file/window position drift after reopening a file; viewport restore now waits for a nested animation frame so editor content/layout can settle before applying the saved scrollTop.
- Done 2026-05-05: Add an explicit multi-window model: `Ctrl/Cmd+N` uses the same context-aware document creation as the library `+`, while `Ctrl/Cmd+Shift+N` opens a new blank window.
- Done 2026-05-05: Refine the multi-window model so `Ctrl/Cmd+Shift+N` opens a blank window at the same width and height as the window that requested it.
- Done 2026-05-05: Revisit Windows chrome: Windows now uses a custom frameless titlebar with integrated File/Edit/View/Theme/Settings/Help menus and native-style window controls, while macOS keeps hiddenInset traffic lights unchanged.
- Done 2026-05-05: Make the right outline panel behave like a drawer: it stays mounted and slides in/out instead of being hard-hidden.
