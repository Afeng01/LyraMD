# LyraMD Open Loops

## Done (2026-09-15)

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
