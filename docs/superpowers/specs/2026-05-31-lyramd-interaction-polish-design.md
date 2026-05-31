# LyraMD Interaction Polish Design

## Goal

Improve the current Electron + Milkdown LyraMD app without restarting the old LyraMD 2.0/VMark migration track.

The work should make the app feel closer to the VMark reference where it matters: Chinese native menus, VMark-like menu item structure, a centered AI command palette, and a calmer sidebar. It must not turn CJK formatting into an AI feature.

## Confirmed product decisions

### Development baseline

Current work targets the existing `src/` Electron + Milkdown implementation. VMark is a visual/interaction reference, not a required codebase or migration target. `AGENTS.md` must stop telling future agents to avoid `src/` by default.

### Native menu

Top-level menus should be Chinese: `文件`、`编辑`、`查看`、`格式`、`工具`、`窗口`、`帮助` where applicable.

Submenu items should use Chinese action names and keep right-side accelerators. Where Electron supports it cleanly, submenu items can later gain small icons; the first accepted implementation may ship without icons if native menu icon quality is poor. Windows custom titlebar menus should mirror the same Chinese labels so non-macOS builds do not stay half-English.

CJK cleanup belongs under `格式` or `工具`, with a configurable shortcut.

### AI 精灵

AI 精灵 becomes a centered command palette overlay. It is not a right panel, not a bottom drawer, and not a small tooltip attached to selected text.

Trigger: `Cmd/Ctrl+J` by default, plus the existing sparkle button if kept. The old `Cmd/Ctrl+Y` immediate rewrite path should be removed or demoted because it performs a destructive action with no preview.

When opened, the palette should read the current selection. If selection exists, scope is `选中内容`. If no selection exists, show an empty/disabled state first; do not silently operate on full document in v1.

The palette contains an input area for the user instruction, recent/template actions, a visible scope/model/status row, a run button, and result actions: `替换原文`、`插入下方`、`复制结果`. Execution shows progress such as `思考中… 3 秒`; completion shows a clear success state. Replacement must remain undo-friendly through the existing editor commands.

### CJK formatting

CJK cleanup remains a deterministic editor action. It should be available from menu and shortcut settings. It should not appear as an AI 精灵 action in this pass.

### Sidebar polish

Long file titles should stay compact but become more legible: hover title shows the full name, truncation should preserve more useful endings, and active rows may use two lines if it helps. The `草稿 / 最近 / 工作目录` tabs get only a light visual adjustment: stronger selected state and subtle separation from the list. If it looks heavier after implementation, revert the tab styling.

## Non-goals

Do not migrate to VMark-derived code. Do not build a full command palette for every app command. Do not add prompt engineering UI to the main editor. Do not put CJK cleanup inside AI 精灵. Do not redesign the whole sidebar.

## Key files

`AGENTS.md` defines the project baseline and must be corrected first.

`src/main/index.ts` owns Electron native menus through `buildMenu()` and sends renderer events.

`src/renderer/index.html` contains the Windows custom menu and current AI panel/drawer markup.

`src/main/settings.ts` and `src/preload/index.ts` define persisted shortcut actions and exposed APIs.

`src/renderer/main.ts` owns shortcut handling, AI helper state, selected text access, result replacement/insertion, menu event handling, and sidebar rendering.

`src/renderer/settings-dialog.ts` renders shortcut settings and AI provider/template settings.

`src/renderer/sidebar-view.ts` resolves sidebar row data.

`src/renderer/themes/base.css` contains the titlebar/menu/sidebar/agent panel styles.

Existing tests to extend include `src/main/menu-regression.test.ts`, `src/main/settings.test.ts`, renderer AI/helper tests, sidebar tests, and CJK regression tests.

## Acceptance criteria

The app launches with Chinese menus. Menu accelerators remain correct and settings-driven where already customizable.

`Cmd/Ctrl+J` opens the centered AI palette. The palette shows current selection scope, allows choosing/typing an instruction, runs the existing AI provider path, shows progress and completion, and lets the user replace, insert, or copy.

CJK cleanup remains a shortcut/menu/settings action and does not appear inside the AI palette templates/actions by default.

Sidebar titles expose full names on hover and use improved truncation without making the sidebar visually noisy.

`npm run test` and `npm run build` pass.
