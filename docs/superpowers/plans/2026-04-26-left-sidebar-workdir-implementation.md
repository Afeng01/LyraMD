# Left Sidebar Workdir Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the ColaMD left sidebar with a titlebar toggle, persistent recent files, and a persistent collapsible workdir that recursively lists Markdown files using relative paths.

**Architecture:** Add a small persisted sidebar state layer in the Electron main process, expose it through preload IPC, and introduce a renderer shell that wraps the existing editor with a collapsible sidebar. Extract the recursive workdir scan and recent-file bookkeeping into focused helper modules so they can be covered by minimal automated tests before wiring UI behavior.

**Tech Stack:** Electron, electron-vite, TypeScript, Vitest for minimal regression coverage

---

## Chunk 1: Testable Main-Process State Helpers

### Task 1: Add a minimal test runner baseline

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`

- [ ] **Step 1: Add the failing test command**

Add a `test` script that runs Vitest once.

- [ ] **Step 2: Run the test command before adding tests**

Run: `npm test`
Expected: FAIL because Vitest is not installed/configured yet.

- [ ] **Step 3: Add minimal Vitest config and dependency**

Add `vitest` as a dev dependency and a config that targets Node tests.

- [ ] **Step 4: Run the test command again**

Run: `npm test`
Expected: PASS with no tests found or a clean empty run configuration.

### Task 2: Extract and test workdir scanning

**Files:**
- Create: `src/main/workdir.ts`
- Create: `src/main/workdir.test.ts`

- [ ] **Step 1: Write the failing tests**

Cover:
- recursive Markdown discovery
- non-Markdown file filtering
- relative-path sorting for nested files

- [ ] **Step 2: Run the focused test**

Run: `npm test -- src/main/workdir.test.ts`
Expected: FAIL because `src/main/workdir.ts` does not exist or exported API is missing.

- [ ] **Step 3: Write the minimal implementation**

Add a helper that:
- walks a directory recursively
- filters `.md`, `.markdown`, `.mdown`, `.mkd`
- returns items with absolute path and relative path
- sorts by relative path

- [ ] **Step 4: Re-run the focused test**

Run: `npm test -- src/main/workdir.test.ts`
Expected: PASS

### Task 3: Extract and test recent-file bookkeeping

**Files:**
- Create: `src/main/sidebar-state.ts`
- Create: `src/main/sidebar-state.test.ts`

- [ ] **Step 1: Write the failing tests**

Cover:
- recent files move to the front when reopened
- duplicates are removed
- maximum length trimming
- stale paths can be filtered cleanly

- [ ] **Step 2: Run the focused test**

Run: `npm test -- src/main/sidebar-state.test.ts`
Expected: FAIL because `src/main/sidebar-state.ts` does not exist or exported API is missing.

- [ ] **Step 3: Write the minimal implementation**

Add pure helpers for:
- merging a newly opened file into recent files
- sanitizing persisted recent files

- [ ] **Step 4: Re-run the focused test**

Run: `npm test -- src/main/sidebar-state.test.ts`
Expected: PASS

## Chunk 2: Main Process and IPC

### Task 4: Add persistent sidebar state to the main process

**Files:**
- Modify: `src/main/index.ts`
- Modify: `src/main/sidebar-state.ts`

- [ ] **Step 1: Write or extend a failing test around pure persistence helpers where possible**

If helper logic changes, add tests first in `src/main/sidebar-state.test.ts`.

- [ ] **Step 2: Implement persisted sidebar state loading/saving**

Store:
- `sidebarOpen`
- `workdirExpanded`
- `workdirPath`
- `recentFiles`

Use the app data/home-backed ColaMD state path already consistent with the project.

- [ ] **Step 3: Hook opened files into recent file updates**

Any file opened through:
- menu open
- drag/drop path open
- workdir click

should refresh recent files.

- [ ] **Step 4: Add workdir scan/load behavior**

On startup:
- restore persisted state
- validate the saved workdir path
- scan it if it still exists

### Task 5: Expose sidebar APIs through preload

**Files:**
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/env.d.ts`

- [ ] **Step 1: Define the failing TypeScript surface**

Reference new API methods from the renderer type definitions first so TypeScript reveals missing pieces.

- [ ] **Step 2: Implement preload bridge methods**

Expose methods for:
- reading initial sidebar state
- toggling sidebar open
- toggling workdir expanded
- choosing a workdir
- opening a workdir file in the current window

- [ ] **Step 3: Verify typing/build integration**

Run: `npm run build`
Expected: FAIL if renderer/main contracts do not line up yet.

## Chunk 3: Renderer Shell and Sidebar UI

### Task 6: Introduce an app shell layout

**Files:**
- Modify: `src/renderer/index.html`
- Modify: `src/renderer/main.ts`
- Modify: `src/renderer/themes/base.css`

- [ ] **Step 1: Add the shell markup in the renderer bootstrap path**

Create containers for:
- titlebar content
- sidebar
- editor panel

- [ ] **Step 2: Implement the sidebar UI**

Render:
- current file
- recent files
- workdir header with right-aligned `更换`
- collapsible workdir list using relative paths

- [ ] **Step 3: Preserve the existing editor behavior**

Keep current editor creation, external file updates, exports, themes, and agent indicator working inside the new shell.

### Task 7: Wire interactions and keyboard behavior

**Files:**
- Modify: `src/renderer/main.ts`
- Modify: `src/main/index.ts`

- [ ] **Step 1: Add the titlebar button interaction**

Clicking the titlebar toggle should open/close the sidebar.

- [ ] **Step 2: Add the `CmdOrCtrl+\\` accelerator path**

Use an Electron menu accelerator or window-level key handling that keeps behavior consistent with the titlebar toggle.

- [ ] **Step 3: Add file click behavior**

Clicking:
- a recent file
- a workdir list item

should load that file in the current window and refresh the sidebar state.

- [ ] **Step 4: Add empty states**

Render:
- no workdir selected
- workdir selected but empty

## Chunk 4: Verification and Wrap-up

### Task 8: Verify automated coverage and build

**Files:**
- Test: `src/main/workdir.test.ts`
- Test: `src/main/sidebar-state.test.ts`

- [ ] **Step 1: Run focused tests**

Run: `npm test -- src/main/workdir.test.ts src/main/sidebar-state.test.ts`
Expected: PASS

- [ ] **Step 2: Run full test suite**

Run: `npm test`
Expected: PASS

- [ ] **Step 3: Run production build**

Run: `npm run build`
Expected: PASS

- [ ] **Step 4: Manual acceptance check**

Verify:
- titlebar toggle position and interaction
- `CmdOrCtrl+\\` open/close
- workdir persistence across restart
- relative-path recursive listing
- current-window file switching

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json vitest.config.ts src/main/index.ts src/main/workdir.ts src/main/workdir.test.ts src/main/sidebar-state.ts src/main/sidebar-state.test.ts src/preload/index.ts src/renderer/index.html src/renderer/main.ts src/renderer/themes/base.css src/renderer/env.d.ts docs/superpowers/plans/2026-04-26-left-sidebar-workdir-implementation.md
git commit -m "feat: add persistent sidebar workdir navigation"
```
