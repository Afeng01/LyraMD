# LyraMD 1.x cleanup checkpoint

Date: 2026-05-28

## Decision

LyraMD 1.x is the active lightweight Markdown editor line. ZMark/VMark remains a reference/source of ideas, but 1.x should not absorb bottom tabs or broad VMark complexity by default.

Current near-term product focus:

- Keep the writing surface lightweight.
- Keep normal workspace directory tree support.
- Keep manual CJK typography cleanup as a base for future auto-format settings.
- Build the next AI helper as a narrow selected-text prompt workflow with user-defined prompts.

## Cleanup Done

- Removed the bottom file tabbar DOM/CSS/renderer click handling from the 1.x UI.
- Moved Tauri/2.x residue out of the repo into macOS Trash:
  `/Users/cherry_xiao/.Trash/lyramd-1x-cleanup-20260528-150648`
- Removed redundant local worktrees:
  - `codex-lyramd-agent-review`
  - `codex-vmark-refactor-sidebar-1x`
- Deleted local stale branches that were already merged or explicitly obsolete:
  - `codex/lyramd-agent-review`
  - `codex/vmark-refactor-sidebar-1x`
  - `codex/workbench-stabilization`
  - `codex/integrate-ready-branches`
  - `codex/v1.1.2-review-fixes`
  - `codex/vmark-sidebar-1x-vmark-base`

## Still Kept

- `main`: current 1.x working line.
- `codex/windows-release-adaptation`: kept because it has one unique Windows release commit.
- `codex/lyramd-2-planning`: kept because it has unique planning/next-shell commits that may still contain useful ideas.
- `pnpm-lock.yaml` and `pnpm-workspace.yaml`: kept because the dependency reinstall needed them to preserve Electron/esbuild build approval and the new direct `@milkdown/core` dependency.

## Verification

- `pnpm test`: 41 test files passed, 282 tests passed.
- `pnpm build`: electron-vite production build completed successfully.
- `pnpm dev`: reached Electron app startup without errors, then exited 0 instead of staying resident.

## 2026-05-28 Follow-up Slice

Implemented the first lightweight 1.x iteration after choosing LyraMD 1.x as the active line:

- Added AI helper prompt templates to persisted settings.
- Added settings UI for editing the default polish / expand / summarize prompts.
- Added a right-side AI helper panel that reads the current editor selection, previews the generated prompt, and copies it to clipboard.
- Added ProseMirror auto-pairing for common Chinese and ASCII brackets / quotes, including stepping over an existing closing character.
- Confirmed existing CJK typography cleanup remains a manual command via `Cmd/Ctrl+Shift+F`; automatic on-type formatting is not enabled yet.

Verification after this slice:

- `pnpm test`: 42 test files passed, 290 tests passed.
- `pnpm build`: electron-vite production build completed successfully.
- `pnpm dev`: reached Electron app startup without errors, then exited 0 instead of staying resident.

## 2026-05-28 AI Helper Apply Slice

Continued the AI helper MVP with a manual result-application loop:

- Added an AI result textarea to the right-side AI helper panel.
- Added `替换选区` to replace the current editor selection with pasted AI output.
- Added `插入下方` to insert pasted AI output below the current selection/cursor.
- Kept persistence on the existing editor `onUserEdit` autosave path, avoiding a second forced save from the AI helper button handlers.

Verification after this slice:

- `pnpm test`: 42 test files passed, 290 tests passed.
- `pnpm build`: electron-vite production build completed successfully.
- `pnpm dev`: reached Electron app startup without errors, then exited 0 instead of staying resident.

## 2026-05-28 OpenAI-compatible AI Helper Slice

Added the first direct model invocation path for the AI helper:

- Added OpenAI-compatible provider settings for Base URL, API Key, Model, and Temperature.
- Default provider is `https://api.openai.com/v1` with `gpt-4.1-mini`; cpa/new-api can use the same settings by changing Base URL and Model.
- Added a main-process `/chat/completions` caller and preload bridge for `completeAiPrompt`.
- Added `直接生成` and status text to the AI helper; generated output can still be reviewed before replacing or inserting.
- Replaced the narrow bottom Agent drawer placeholder with the same AI helper workflow, so the preview surface matches the real narrow-layout UI.
- Fixed development preview startup while a packaged LyraMD app is already running by only requesting the single-instance lock in packaged builds.

Verification after this slice:

- `pnpm test -- src/renderer/phase-c-layout-dom.test.ts src/main/menu-regression.test.ts src/main/ai-provider.test.ts src/main/settings.test.ts src/renderer/settings-dialog.test.ts`: 43 test files passed, 296 tests passed.
- `pnpm test`: 43 test files passed, 296 tests passed.
- `pnpm build`: electron-vite production build completed successfully.
- `pnpm dev`: stays resident in Electron even while the installed LyraMD app is open.
- Manual preview: Settings > 集成与终端 shows Base URL / Model / Temperature / API Key; the bottom Agent drawer now shows AI 精灵 controls instead of the old Agent CLI placeholder.

## Next Suggested Slice

Finish AI helper MVP:

1. Test a real OpenAI or cpa/new-api key against `直接生成` from the preview window.
2. Decide whether API keys should stay in local settings or move to a safer keychain/env-var path before packaging.
3. Add a lightweight provider health check in settings.
4. Add a settings toggle for on-type auto-format only if it can be made non-disruptive.

## 2026-05-28 Interaction Polish Slice

Fixed the first preview issues from the dev build:

- Backspace now removes an untouched paired bracket/quote together, for example `（）`.
- The workdir tab has one contextual plus button; drafts/recent create a draft, while workdir opens a small menu for `新建文稿` or `新建文件夹`.
- The selected sidebar item no longer has the dev-only left inset accent, matching the softer 1.x selection style.
- Settings now uses a compact 1.x-style floating window header and supports dragging from the top bar.
- The settings overlay is a fixed top layer, so it reliably renders above the editor and titlebar.
- The AI helper toolbar icon was replaced with a lighter sparkle icon.
- `Cmd/Ctrl+Y` now directly rewrites the selected text with the active AI prompt template, using the VMark/TMark shortcut idea without importing the full picker complexity.

Verification after this slice:

- `pnpm test`: 43 test files passed, 300 tests passed.
- `pnpm build`: electron-vite production build completed successfully.
- Manual preview: workdir plus menu appears; settings window opens with the compact floating header; AI button is labelled `AI 精灵 (Cmd/Ctrl+Y)`.

Follow-up correction:

- Fixed the library tab order to match the installed 1.x layout: `草稿 / 最近 / 工作目录 / +`.
- Removed the remaining left inset highlight from active workspace items, not just file list items.
- Moved the workdir create menu to open from the far-right plus button.
- Restarted `pnpm dev` instead of relying on HMR; the running Electron dev window now shows the corrected left sidebar.

## 2026-05-28 Sidebar Workspace Polish Slice

Responded to the next preview review:

- Let the draft / recent / workdir library panel fill the remaining sidebar height instead of leaving an empty lower block after resizing the window.
- Limited the top workspace history to two visible rows; additional workspaces now scroll inside that compact area.
- Added a two-step remove control for top-level workspace entries.
- Changed workdir scanning and rendering to show only the currently selected top workspace, rather than merging every saved workspace into one tree.
- Removed the redundant `新建文件夹` row from the workdir list because the tab plus menu already offers `新建文稿` and `新建文件夹`.
- Preserved the workdir list scroll position when expanding or collapsing folders, avoiding the jump back to the top.
- Removed the fake red/yellow/green controls from the settings dialog while keeping the compact draggable settings header.
- Added usage guidance for OpenAI official accounts, cpa/new-api compatible gateways, and `Cmd/Ctrl+Y` selected-text rewrite.

Verification after this slice:

- `pnpm test -- src/renderer/sidebar-view.test.ts src/main/sidebar-state.test.ts src/main/sidebar-persistence.test.ts src/renderer/settings-dialog.test.ts`: 43 test files passed, 305 tests passed.
- `pnpm test`: 43 test files passed, 305 tests passed.
- `pnpm build`: electron-vite production build completed successfully.
