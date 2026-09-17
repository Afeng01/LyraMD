# LyraMD Open Loops

## Open (2026-09-18)

- **阶段 A 第二片**：最近文件融入标签 + 会话恢复（session-state 从单文档扩为标签集合）。方案见 docs/2026-09-15-竞品调研-ColoMD-2.4-主界面优化方案.md §8 阶段 A；阶段 A1 已落地（08fe0ff7→a1bc299a，540 tests 全绿）。
- **A1 修复的聚焦复核未完成**：上轮 reviewer 对 `a1bc299a` 的增量复核只运行了 6.5s 即被中止（f4ccdf55）；Cola 已人工快查补读→对账链路骨架无误，但未出正式判定。下次开工先补这轮复核（重点：外部变更补读的正确性、补读与 watcher 事件重复记 journal 的可能性）。
- **未 push**：本地 main 领先 origin（09-15 前的 28 个 + 09-15/16 两日全部新提交），等用户点头。
- **版本号与发版**：建议 1.4.0；出安装包时一并做安装版 destructive drill + proof pack（09-15 deferred 项）。asar 瘦身后的验证 dmg（101MB/asar 11MB）在 release/ 下，属 09-16 时代码，发版时需重新出包。

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
