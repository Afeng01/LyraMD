# LyraMD Interaction Polish Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Polish the current LyraMD Electron + Milkdown app with Chinese native menus, a centered AI 精灵 command palette, CJK as shortcut/settings only, light sidebar title/tab improvements, and a corrected `AGENTS.md` baseline.

**Architecture:** Keep the existing `src/` architecture. Replace the old side/bottom AI helper surface with a modal command-palette controller built on the existing AI provider, selection, replace, and insert functions. Keep CJK as an independent editor command and shortcut.

**Tech Stack:** Electron, electron-vite, TypeScript, DOM renderer code, Milkdown/ProseMirror editor helpers, Vitest.

***

## File map

Modify `AGENTS.md` to state that current work targets `src/` and VMark is reference material only.

Modify `src/main/index.ts` for Chinese native menu labels, menu grouping, `Cmd/Ctrl+J` AI palette menu event, and no destructive AI rewrite shortcut.

Modify `src/renderer/index.html` for Windows custom menu Chinese labels and AI palette overlay markup. Keep old panel markup only if needed during transition, but hide/retire it from normal interaction.

Modify `src/preload/index.ts` and `src/main/settings.ts` to add a customizable `openAiPalette` shortcut action, defaulting to `CmdOrCtrl+J`, while keeping `cleanCjkTypography` separate.

Modify `src/renderer/main.ts` to implement AI palette state, opening/closing, template/recent action selection, progress timer, result actions, keyboard handling, and menu event wiring.

Modify `src/renderer/settings-dialog.ts` so shortcut settings expose `打开 AI 精灵` and still expose `清理中英排版` separately.

Modify `src/renderer/sidebar-view.ts` only if a helper is needed for display titles; otherwise set DOM `title` attributes in `main.ts` and do CSS-only truncation.

Modify `src/renderer/themes/base.css` for palette overlay, Windows menu item layout if icons are added later, sidebar title truncation, active row two-line behavior, and subtle tab selected-state polish.

Modify or add tests near `src/main/menu-regression.test.ts`, `src/main/settings.test.ts`, `src/renderer/settings-dialog.test.ts`, `src/renderer/sidebar-view.test.ts`, and a new renderer AI palette test file if existing tests do not cover it cleanly.

## Chunk 1: Baseline docs and menu language

### Task 1: Correct `AGENTS.md`

**Files:**

Modify: `AGENTS.md`

* [ ] Replace the current “LyraMD 2.0 / VMark-based is mandatory” baseline with “current baseline is existing Electron + Milkdown `src/`; VMark is an interaction reference unless the user explicitly asks to restart 2.0 work.”

* [ ] Keep useful VMark borrowing boundaries, but remove instructions that block changes to legacy `src/`.

* [ ] Verify with `grep -n "2.0\|VMark\|legacy\|src-next" AGENTS.md` that no remaining sentence contradicts the new baseline.

### Task 2: Add menu regression expectations before implementation

**Files:**

Modify: `src/main/menu-regression.test.ts`

* [ ] Add expectations that `src/main/index.ts` contains Chinese top-level menu labels such as `label: '文件'`, `label: '编辑'`, `label: '查看'`, `label: '格式'` or `label: '工具'`, and `label: '帮助'`.

* [ ] Add expectation that CJK remains wired through `shortcutFor('cleanCjkTypography')`.

* [ ] Add expectation that AI palette uses `shortcutFor('openAiPalette')` and sends a renderer event such as `menu-open-ai-palette`.

* [ ] Run `npm run test -- src/main/menu-regression.test.ts` and confirm it fails before implementation.

### Task 3: Implement Chinese native menu labels

**Files:**

Modify: `src/main/index.ts`

* [ ] Rename top-level menus and submenu actions to Chinese.

* [ ] Split CJK into `格式` or `工具`; recommended: `格式 > 清理中英排版`.

* [ ] Add AI palette menu item under `工具 > AI 精灵`, accelerator `shortcutFor('openAiPalette')`, click sends `menu-open-ai-palette`.

* [ ] Keep existing save/search/sidebar/outline/CJK accelerator behavior intact.

* [ ] Do not add icon files yet. If adding native menu icons later, isolate it in a helper and only keep it if it looks native on macOS.

### Task 4: Localize Windows custom menu

**Files:**

Modify: `src/renderer/index.html`\
Modify: `src/renderer/main.ts` only if action labels are hardcoded elsewhere\
Modify: `src/renderer/themes/base.css` only if panel width needs adjustment

* [ ] Translate titlebar menu buttons and panel items: File/Edit/View/Theme/Settings/Help become 文件/编辑/查看/主题/设置/帮助, and actions become Chinese.

* [ ] Keep `data-windows-action` values unchanged so existing click handling keeps working.

* [ ] If menu text wraps, increase `.windows-menu-panel` min-width in CSS.

* [ ] Run `npm run test -- src/main/menu-regression.test.ts` and confirm menu regression tests pass.

## Chunk 2: Shortcut/settings model

### Task 5: Add `openAiPalette` shortcut setting

**Files:**

Modify: `src/main/settings.ts`\
Modify: `src/preload/index.ts`\
Modify: `src/renderer/main.ts`\
Modify: `src/renderer/settings-dialog.ts`\
Modify: tests that assert shortcut actions

* [ ] Extend `ShortcutAction` with `openAiPalette`.

* [ ] Add default shortcut `CmdOrCtrl+J`.

* [ ] Ensure settings normalization preserves existing users’ settings while filling the new key from defaults.

* [ ] Add `打开 AI 精灵` to shortcut labels.

* [ ] Leave `cleanCjkTypography` default and label separate.

* [ ] Run `npm run test -- src/main/settings.test.ts src/renderer/settings-dialog.test.ts` and fix failures.

## Chunk 3: Centered AI command palette

### Task 6: Add palette DOM shell

**Files:**

Modify: `src/renderer/index.html`\
Modify: `src/renderer/themes/base.css`

* [ ] Add an overlay near the end of `#app-shell`, for example `#ai-command-overlay`, with a centered `#ai-command-palette` dialog.

* [ ] Include these elements: title `AI 精灵`, close button, textarea/input for instruction, recent/template action buttons container, selection preview, footer status row, result textarea, run button, replace/insert/copy result buttons.

* [ ] Set overlay hidden by default and add ARIA dialog attributes.

* [ ] Style it like a command palette: centered card, dim background, compact status row, clear progress/success state. Do not use side panel or bottom drawer positioning.

### Task 7: Implement palette state controller

**Files:**

Modify: `src/renderer/main.ts`

* [ ] Replace `agentPanelOpen` as the main AI interaction with `aiPaletteOpen` state. Keep outline context panel behavior untouched.

* [ ] Implement `openAiPalette()`, `closeAiPalette()`, `renderAiPalette()`.

* [ ] On open, read `getSelectedPlainText().trim()`. If empty, show “先选中文本，再使用 AI 精灵。” and disable run.

* [ ] Render templates from `appSettings.aiHelper.templates` as recent/action chips. Selecting a chip fills the instruction from that template or sets active template.

* [ ] Build prompt from instruction/template + selection using existing `buildAiHelperPrompt` logic, but allow direct custom instruction text.

* [ ] Focus the instruction input when opening.

* [ ] Close on Escape and backdrop click unless a request is running.

### Task 8: Wire execution and result actions

**Files:**

Modify: `src/renderer/main.ts`

* [ ] Reuse `api.completeAiPrompt(prompt)`.

* [ ] Track `aiPaletteBusy`, `aiPaletteStartedAt`, `aiPaletteStatusText`, `aiPaletteResultText`.

* [ ] While busy, show `思考中… Ns`; update with a timer and clear timer after completion/failure.

* [ ] On success, show `完成` and keep result in the result textarea.

* [ ] Implement `替换原文` with `replaceSelectedText(result)`.

* [ ] Implement `插入下方` with `insertTextBelowSelection(result)`.

* [ ] Implement `复制结果` with `navigator.clipboard.writeText(result)`.

* [ ] Do not auto-replace selection from shortcut.

### Task 9: Wire shortcut, menu, and button triggers

**Files:**

Modify: `src/renderer/main.ts`\
Modify: `src/preload/index.ts` if menu event helper is missing\
Modify: `src/main/index.ts`

* [ ] `Cmd/Ctrl+J` via `shortcutFor(appSettings, 'openAiPalette')` opens palette.

* [ ] Native menu item sends `menu-open-ai-palette`; renderer opens palette.

* [ ] Existing sparkle button opens palette instead of toggling right/bottom panel.

* [ ] Remove or disable `Cmd/Ctrl+Y` destructive immediate rewrite path.

* [ ] Ensure CJK shortcut still runs `formatCjkTypography` through existing flow.

### Task 10: AI palette tests

**Files:**

Create or modify: `src/renderer/ai-command-palette.test.ts` or nearest existing renderer interaction test

* [ ] Test that empty selection disables run and shows the selection warning.

* [ ] Test that selected text builds a prompt using the chosen template/custom instruction.

* [ ] Test that success enables replace/insert/copy actions.

* [ ] Test that the shortcut handler opens the palette and does not immediately replace text.

* [ ] Run the relevant renderer tests.

## Chunk 4: CJK stays simple

### Task 11: Verify CJK remains independent

**Files:**

Modify only if needed: `src/renderer/main.ts`, `src/main/index.ts`, `src/renderer/settings-dialog.ts`\
Test: `src/renderer/editor/cjk-format.test.ts`, `src/renderer/editor/cjk-format-regression.test.ts`

* [ ] Confirm CJK appears in native menu and shortcut settings.

* [ ] Confirm CJK is not included in default AI template/action chips unless the user adds it manually in settings later.

* [ ] Run `npm run test -- src/renderer/editor/cjk-format.test.ts src/renderer/editor/cjk-format-regression.test.ts`.

## Chunk 5: Sidebar light polish

### Task 12: Improve title hover and truncation

**Files:**

Modify: `src/renderer/main.ts`\
Modify: `src/renderer/themes/base.css`\
Modify: `src/renderer/sidebar-view.ts` only if needed

* [ ] Add `title` attributes with full draft/file title on sidebar rows or title spans.

* [ ] Use CSS to keep normal rows compact.

* [ ] Allow active row title to wrap to two lines with `-webkit-line-clamp: 2` if supported.

* [ ] Do not expand all rows; this is a light polish, not a sidebar redesign.

### Task 13: Light tab selected-state adjustment

**Files:**

Modify: `src/renderer/themes/base.css`

* [ ] Make active `草稿 / 最近 / 工作目录` state slightly stronger with existing color variables.

* [ ] Add a subtle separator or spacing below the tab row.

* [ ] Avoid heavy borders or large layout shifts.

* [ ] Run `npm run test -- src/renderer/sidebar-view.test.ts`.

## Chunk 6: Full verification

### Task 14: Full automated checks

**Files:**

No code changes unless fixing failures.

* [ ] Run `npm run test`.

* [ ] Run `npm run build`.

* [ ] If tests fail, fix the smallest cause and rerun the failing subset first, then full test/build.

### Task 15: Manual smoke check

**Files:**

No code changes unless fixing failures.

* [ ] Run `npm run dev`.

* [ ] Verify menu labels are Chinese.

* [ ] Verify `Cmd/Ctrl+J` opens centered AI palette.

* [ ] Verify CJK shortcut still works and is configurable.

* [ ] Verify left sidebar title hover and active row wrapping.

* [ ] Verify AI result replacement/insertion is undo-friendly.

## Risk notes

Electron native menu item icons may not look good or may require native images that bloat the change. Treat icons as optional after Chinese labels and accelerator structure work.

The existing AI helper is tangled into the right/bottom context panel. Avoid deleting too aggressively in the first pass; first make the palette the only normal entry point, then remove dead panel code if tests stay green.

Do not let `Cmd/Ctrl+J` become destructive. The user explicitly wants a centered popup, not instant rewrite.
