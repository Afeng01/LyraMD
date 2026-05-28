# LyraMD Phase C QA

## Automated

- `npm test`: passed, 40 files / 264 tests.
- `npm run build`: passed.
- `git diff --check`: passed.

## Manual

- Dev launch: `npm run dev` built main/preload/renderer and started Electron; renderer moved from port 5173 to 5174 because 5173 was in use.
- Wide window: Agent/Outline context panel uses right-side placement through the responsive class helper.
- Narrow window: Agent/Outline context panel uses bottom placement and reserves bottom scroll space for the editor.
- Agent/Outline switch: Agent is the default panel; Outline reuses the same panel tab and existing shortcut/menu paths.
- Background editor scope: settings write CSS variables and apply background to the editor shell.
- Background window scope: app-level background keeps editor text on a bordered paper layer.
- Workdir tree: main process now exposes tree data; renderer flattens it into folder/file rows with session-only folder expansion.

## Gemini Review

- Kept: paper layer for window backgrounds, responsive right/bottom Agent panel, opacity/blur/dim readability controls.
- Adjusted: bottom panel height now uses `max(190px, 35vh)`, bottom mode reserves editor scroll space, active panel tab has stronger visual indication.
- Rejected: larger product-scope expansion and terminal implementation suggestions; real Agent CLI remains a separate plan.

## Residual Risk

- Real PTY terminal execution is not implemented in Phase C.
- Workdir folder creation currently creates folders at the workdir root only.
- Untracked generated/experimental directories `.cargo/`, `dist-next/`, and `src-tauri/` were moved out during the 2026-05-28 1.x cleanup checkpoint.
