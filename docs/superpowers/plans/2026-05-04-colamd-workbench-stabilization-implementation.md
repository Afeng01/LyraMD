# ColaMD Workbench Stabilization Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stabilize ColaMD as an Agent-native Markdown workbench by fixing draft save semantics, adding pinned/workspace navigation, moving outline to a right-side panel, and keeping the left sidebar focused on active work.

**Architecture:** Keep Electron main process as the source of truth for document identity, draft persistence, workspace history, pinned items, and file moves. Keep renderer DOM code thin by adding pure view-model helpers for sidebar/outline state and using editor-owned ProseMirror document traversal for the outline. Preserve the existing Milkdown editor and current autosave pipeline, but change the meaning of manual save for drafts from "write draft file" to "promote to formal file".

**Tech Stack:** Electron, electron-vite, TypeScript strict mode, Milkdown/ProseMirror, Vitest

---

## File Structure

### New Files

- `src/main/workbench-state.ts`
  Pure helpers for workspace history, pinned items, active sidebar tab, and pinned migration when draft identity changes.

- `src/main/workbench-state.test.ts`
  Focused tests for workspace ordering, pinned normalization, pinned draft-to-file migration, and default Drafts tab behavior.

- `src/main/draft-filenames.test.ts`
  Focused tests for manual draft title to filename behavior, collision suffixes, and safe filename sanitization.

- `src/renderer/sidebar-view.ts`
  Pure renderer helpers that prepare left-sidebar sections from `SidebarState`: workspace display, pinned display, active tab list, and empty states.

- `src/renderer/sidebar-view.test.ts`
  Node-safe tests for sidebar view-model behavior without needing a DOM environment.

- `src/renderer/editor/outline.ts`
  Pure outline types and helpers for heading normalization and view state.

- `src/renderer/editor/outline.test.ts`
  Focused tests for outline item filtering, H1/H2 inclusion, and active panel toggling rules.

### Modified Files

- `src/main/sidebar-state.ts`
  Extend persisted state with `workspacePaths`, `pinnedItems`, and `activeSidebarTab`, while preserving backward compatibility with existing `workdirPath`.

- `src/main/drafts.ts`
  Add safe manual-title filename helpers. Keep draft identity stable through `draftId`.

- `src/main/index.ts`
  Update draft save promotion, draft rename handling, pinned migration, workspace history, menu shortcut for outline, and sidebar snapshots.

- `src/preload/index.ts`
  Expose pinned/workspace/tab/outline APIs and update `SidebarState` typings.

- `src/renderer/env.d.ts`
  No structural change expected because it imports `ElectronAPI`, but include if TypeScript requires it.

- `src/renderer/main.ts`
  Render the new left sidebar structure, wire pin/unpin actions, render workspace history, handle Drafts/Recent tab switching, and wire the right outline panel.

- `src/renderer/editor/editor.ts`
  Add editor APIs for extracting H1/H2 outline entries and scrolling to a heading by outline id.

- `src/renderer/index.html`
  Replace old left sidebar markup with Workspaces/Pinned/Drafts-Recent structure and add right outline panel markup plus titlebar outline button.

- `src/renderer/themes/base.css`
  Style workspace history, pinned section, Drafts/Recent segmented control, and right outline panel. Keep the editor visually primary.

- `docs/superpowers/specs/2026-05-04-colamd-workbench-stabilization-design.md`
  Update only if implementation discovers a real product correction.

---

## Pre-flight

- [ ] **Step 1: Confirm dirty worktree scope**

Run: `git status --short`

Expected: Only the existing untracked docs are present unless new plan/spec docs have been added intentionally. Do not stage or modify unrelated untracked files such as `docs/superpowers/plans/2026-05-02-windows-release-minimal-implementation.md`.

- [ ] **Step 2: Run current focused baseline**

Run:

```bash
npm test -- src/main/sidebar-state.test.ts src/main/drafts.test.ts src/main/save-as.test.ts src/main/workdir.test.ts src/renderer/editor/session-ux.test.ts
```

Expected: PASS before behavior changes.

- [ ] **Step 3: Run build baseline**

Run: `npm run build`

Expected: PASS before behavior changes.

---

## Chunk 1: Persisted Workbench State

### Task 1: Add pure state coverage for workspaces, pinned items, and active tab

**Files:**
- Create: `src/main/workbench-state.ts`
- Create: `src/main/workbench-state.test.ts`
- Modify: `src/main/sidebar-state.ts`
- Modify: `src/main/sidebar-state.test.ts`

- [ ] **Step 1: Write failing tests for new persisted workbench rules**

Add tests covering:

```ts
expect(resolveDefaultSidebarTab(undefined)).toBe('drafts')
expect(normalizeSidebarTab('recent')).toBe('recent')
expect(normalizeSidebarTab('bad')).toBe('drafts')
```

```ts
expect(addWorkspacePath(['/a', '/b'], '/c', 5)).toEqual(['/c', '/a', '/b'])
expect(addWorkspacePath(['/a', '/b'], '/a', 5)).toEqual(['/a', '/b'])
```

```ts
expect(togglePinnedItem([], { kind: 'draft', draftId: 'd1' })).toEqual([
  { kind: 'draft', draftId: 'd1' },
])
expect(togglePinnedItem([{ kind: 'draft', draftId: 'd1' }], { kind: 'draft', draftId: 'd1' })).toEqual([])
```

```ts
expect(migratePinnedDraftToFile([
  { kind: 'draft', draftId: 'd1' },
], 'd1', '/final.md')).toEqual([
  { kind: 'file', filePath: '/final.md' },
])
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test -- src/main/workbench-state.test.ts src/main/sidebar-state.test.ts`

Expected: FAIL because the helper module and persisted fields do not exist.

- [ ] **Step 3: Implement minimal workbench state helpers**

In `src/main/workbench-state.ts`, add:

```ts
export type SidebarTab = 'drafts' | 'recent'

export type PinnedItem =
  | { kind: 'draft'; draftId: string }
  | { kind: 'file'; filePath: string }

export function normalizeSidebarTab(value: unknown): SidebarTab {
  return value === 'recent' ? 'recent' : 'drafts'
}

export function addWorkspacePath(paths: string[], nextPath: string, max = 8): string[] {
  const existing = paths.filter((path) => path !== nextPath)
  return [nextPath, ...existing].slice(0, max)
}

export function normalizeWorkspacePaths(value: unknown, activePath: string | null): string[] {
  const paths = Array.isArray(value)
    ? value.filter((path): path is string => typeof path === 'string' && path.trim().length > 0)
    : []
  return activePath ? addWorkspacePath(paths, activePath) : paths
}

export function samePinnedItem(a: PinnedItem, b: PinnedItem): boolean {
  return a.kind === b.kind && (
    a.kind === 'draft'
      ? a.draftId === (b.kind === 'draft' ? b.draftId : '')
      : a.filePath === (b.kind === 'file' ? b.filePath : '')
  )
}

export function togglePinnedItem(items: PinnedItem[], item: PinnedItem): PinnedItem[] {
  return items.some((candidate) => samePinnedItem(candidate, item))
    ? items.filter((candidate) => !samePinnedItem(candidate, item))
    : [item, ...items]
}

export function migratePinnedDraftToFile(items: PinnedItem[], draftId: string | null, filePath: string): PinnedItem[] {
  if (!draftId) return items
  return items.map((item) => (
    item.kind === 'draft' && item.draftId === draftId
      ? { kind: 'file', filePath }
      : item
  ))
}
```

Also add `normalizePinnedItems()` with validation for persisted data.

- [ ] **Step 4: Extend `PersistedSidebarState`**

In `src/main/sidebar-state.ts`, add:

```ts
workspacePaths: string[]
pinnedItems: PinnedItem[]
activeSidebarTab: SidebarTab
```

Normalize old state so existing `workdirPath` becomes the first workspace entry. Default `activeSidebarTab` must be `drafts`.

- [ ] **Step 5: Re-run focused tests**

Run: `npm test -- src/main/workbench-state.test.ts src/main/sidebar-state.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit this chunk**

```bash
git add src/main/workbench-state.ts src/main/workbench-state.test.ts src/main/sidebar-state.ts src/main/sidebar-state.test.ts
git commit -m "feat: add workbench sidebar state"
```

---

## Chunk 2: Draft Promotion And Filename Semantics

### Task 2: Add safe draft filename helpers

**Files:**
- Modify: `src/main/drafts.ts`
- Create: `src/main/draft-filenames.test.ts`

- [ ] **Step 1: Write failing tests for manual draft title filenames**

Cover:

```ts
expect(sanitizeMarkdownFileStem(' 数字一的对话 ')).toBe('数字一的对话')
expect(sanitizeMarkdownFileStem('a/b:c*')).toBe('abc')
expect(sanitizeMarkdownFileStem('')).toBe('未命名草稿')
```

```ts
expect(resolveManualDraftPath('/drafts', '数字一的对话', () => false)).toBe('/drafts/数字一的对话.md')
expect(resolveManualDraftPath('/drafts', '数字一的对话', (path) => path.endsWith('数字一的对话.md'))).toBe('/drafts/数字一的对话-2.md')
```

- [ ] **Step 2: Run test to verify failure**

Run: `npm test -- src/main/draft-filenames.test.ts`

Expected: FAIL because the helpers do not exist.

- [ ] **Step 3: Implement filename helpers**

Add to `src/main/drafts.ts`:

```ts
export function sanitizeMarkdownFileStem(title: string, fallback = '未命名草稿'): string {
  const stem = title
    .trim()
    .replace(/[/\\:*?"<>|]/g, '')
    .replace(/\s+/g, ' ')
    .slice(0, 80)
    .trim()
  return stem || fallback
}

export function resolveManualDraftPath(
  draftDirectoryPath: string,
  title: string,
  exists: (candidatePath: string) => boolean,
): string {
  const stem = sanitizeMarkdownFileStem(title)
  let suffix = 1
  let candidate = join(draftDirectoryPath, `${stem}.md`)
  while (exists(candidate)) {
    suffix += 1
    candidate = join(draftDirectoryPath, `${stem}-${suffix}.md`)
  }
  return candidate
}
```

- [ ] **Step 4: Re-run focused test**

Run: `npm test -- src/main/draft-filenames.test.ts src/main/drafts.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/drafts.ts src/main/draft-filenames.test.ts
git commit -m "feat: add manual draft filename helpers"
```

### Task 3: Rename draft files on manual title edits

**Files:**
- Modify: `src/main/index.ts`
- Modify: `src/main/drafts.ts`
- Modify: `src/main/drafts.test.ts`

- [ ] **Step 1: Add pure tests for draft entry path updates**

Add a helper test such as:

```ts
expect(updateDraftEntryManualTitle(entry, '数字一的对话', '/drafts/数字一的对话.md')).toEqual({
  ...entry,
  path: '/drafts/数字一的对话.md',
  displayTitle: '数字一的对话',
  manualTitle: '数字一的对话',
})
```

- [ ] **Step 2: Implement entry helper**

Add `updateDraftEntryManualTitle(entry, title, nextPath, now)` to `src/main/drafts.ts`.

- [ ] **Step 3: Wire main-process rename for current draft title edit**

In `src/main/index.ts`, update both handlers:

- `update-current-draft-title`
- `update-draft-title-by-id`

For a manual title edit:

1. Resolve the current draft entry.
2. Resolve the next draft path with `resolveManualDraftPath()`.
3. If the path changes, call `rename(oldPath, nextPath)`.
4. Update the draft entry path and manual title.
5. If any open window points at the old path/draft id, update its `state.filePath`, re-watch the new path, and preserve `state.draftId`.
6. Broadcast sidebar state.

- [ ] **Step 4: Run focused tests and build**

Run:

```bash
npm test -- src/main/draft-filenames.test.ts src/main/drafts.test.ts
npm run build
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/index.ts src/main/drafts.ts src/main/drafts.test.ts
git commit -m "feat: sync manual draft titles to filenames"
```

### Task 4: Make manual save promote drafts to formal files

**Files:**
- Modify: `src/main/index.ts`
- Modify: `src/main/save-as.ts`
- Modify: `src/main/save-as.test.ts`

- [ ] **Step 1: Add tests for draft save intent**

In `src/main/save-as.test.ts`, cover:

```ts
expect(shouldPromptForFormalSave('draft')).toBe(true)
expect(shouldPromptForFormalSave('file')).toBe(false)
expect(shouldPromptForFormalSave('blank')).toBe(true)
```

If adding a new helper is not useful, add tests around existing helpers that guarantee drafts always remove their source after save-as.

- [ ] **Step 2: Change `save-file` draft path**

In `ipcMain.handle('save-file')`, replace this behavior:

```ts
if (state.documentKind === 'draft' && state.filePath) {
  return saveToPath(win, state.filePath, content)
}
```

with:

1. Show a save dialog.
2. Use a default filename from manual draft title or derived document title.
3. Add save dialog copy:

```ts
message: '保存后会成为正式文件，并从草稿中移出。草稿内容已自动保存。'
```

4. Call `saveFileAsForWindow(win, result.filePath, content)`.

- [ ] **Step 3: Migrate pinned draft state during promotion**

Inside `saveFileAsForWindow()` draft branch, after successful formal save and before broadcasting sidebar state:

```ts
sidebarState.pinnedItems = migratePinnedDraftToFile(sidebarState.pinnedItems, sourceDraftId, nextPath)
```

Persist sidebar state after migration.

- [ ] **Step 4: Keep formal-file Save behavior unchanged**

Verify `Cmd/Ctrl+S` on formal files still writes in place through `saveToPath()`.

- [ ] **Step 5: Run focused tests and build**

Run:

```bash
npm test -- src/main/save-as.test.ts src/main/drafts.test.ts src/main/workbench-state.test.ts
npm run build
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/main/index.ts src/main/save-as.ts src/main/save-as.test.ts src/main/workbench-state.ts
git commit -m "feat: promote drafts on manual save"
```

---

## Chunk 3: Left Sidebar Workbench UI

### Task 5: Add renderer sidebar view-model helpers

**Files:**
- Create: `src/renderer/sidebar-view.ts`
- Create: `src/renderer/sidebar-view.test.ts`
- Modify: `src/preload/index.ts`

- [ ] **Step 1: Write failing view-model tests**

Cover:

```ts
expect(resolveWorkspaceLabel(null)).toBe('选择目录')
expect(resolveWorkspaceLabel('/Users/cherry/鹿鸣与小北')).toBe('鹿鸣与小北')
```

```ts
expect(shouldScrollWorkspaces(['/a', '/b', '/c'])).toBe(false)
expect(shouldScrollWorkspaces(['/a', '/b', '/c', '/d'])).toBe(true)
```

```ts
expect(resolveVisibleTabItems(stateWithDrafts, 'drafts')).toEqual([...draft items...])
expect(resolveVisibleTabItems(stateWithRecent, 'recent')).toEqual([...recent items...])
```

- [ ] **Step 2: Run test to verify failure**

Run: `npm test -- src/renderer/sidebar-view.test.ts`

Expected: FAIL because the helper module does not exist.

- [ ] **Step 3: Implement pure helpers**

Add helpers for:

- workspace labels
- workspace scrolling threshold
- pinned item resolution from `SidebarState`
- visible tab items for Drafts vs Recent
- active/pinned checks for draft/file targets

- [ ] **Step 4: Extend preload typings**

In `src/preload/index.ts`, add:

```ts
export type SidebarTab = 'drafts' | 'recent'
export type PinnedItem = { kind: 'draft'; draftId: string } | { kind: 'file'; filePath: string }
```

Extend `SidebarState`:

```ts
workspacePaths: string[]
pinnedItems: PinnedItem[]
activeSidebarTab: SidebarTab
```

Extend `ElectronAPI`:

```ts
setActiveSidebarTab: (tab: SidebarTab) => Promise<SidebarState | null>
togglePinnedDraft: (draftId: string) => Promise<SidebarState | null>
togglePinnedFile: (path: string) => Promise<SidebarState | null>
selectWorkspace: (path: string) => Promise<SidebarState | null>
```

- [ ] **Step 5: Re-run focused test**

Run: `npm test -- src/renderer/sidebar-view.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/sidebar-view.ts src/renderer/sidebar-view.test.ts src/preload/index.ts
git commit -m "feat: add sidebar workbench view model"
```

### Task 6: Implement main-process IPC for workspaces, pins, and tabs

**Files:**
- Modify: `src/main/index.ts`
- Modify: `src/main/sidebar-state.ts`
- Modify: `src/preload/index.ts`

- [ ] **Step 1: Update sidebar snapshots**

Ensure `createSidebarSnapshot()` includes:

- `workspacePaths`
- `pinnedItems`
- `activeSidebarTab`

- [ ] **Step 2: Update workspace selection behavior**

In `choose-workdir`:

1. Set `sidebarState.workdirPath` to selected path.
2. Add selected path to `sidebarState.workspacePaths`.
3. Expand workdir/workspace area.
4. Refresh workdir entries.
5. Persist and broadcast.

Add `select-workspace` IPC:

1. Validate path exists.
2. Set it as `workdirPath`.
3. Move it to the front of `workspacePaths`.
4. Refresh entries.
5. Persist and broadcast.

- [ ] **Step 3: Add tab IPC**

Add `set-active-sidebar-tab` IPC that accepts only `drafts` or `recent`; default to `drafts`.

- [ ] **Step 4: Add pin IPC**

Add:

- `toggle-pinned-draft`
- `toggle-pinned-file`

Do not allow empty paths or missing draft ids.

- [ ] **Step 5: Run focused tests and build**

Run:

```bash
npm test -- src/main/sidebar-state.test.ts src/main/workbench-state.test.ts src/renderer/sidebar-view.test.ts
npm run build
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/main/index.ts src/main/sidebar-state.ts src/preload/index.ts
git commit -m "feat: wire workbench sidebar ipc"
```

### Task 7: Replace left sidebar DOM with workbench layout

**Files:**
- Modify: `src/renderer/index.html`
- Modify: `src/renderer/main.ts`
- Modify: `src/renderer/themes/base.css`
- Modify: `src/renderer/sidebar-view.ts`
- Modify: `src/renderer/sidebar-view.test.ts`

- [ ] **Step 1: Update HTML structure**

Replace the old sidebar sections with:

```html
<section id="workspaces-section" class="sidebar-section">
  <div class="sidebar-section-header">
    <button id="workspace-add" type="button" class="sidebar-icon-button" aria-label="选择目录">+</button>
  </div>
  <div id="workspaces-list" class="workspace-list"></div>
</section>

<section id="pinned-section" class="sidebar-section">
  <div class="sidebar-section-header">
    <div class="sidebar-section-title static"><span>置顶</span></div>
  </div>
  <div id="pinned-list" class="sidebar-list"></div>
</section>

<section id="library-section" class="sidebar-section">
  <div id="sidebar-tabs" class="sidebar-tabs">
    <button id="drafts-tab" type="button" data-sidebar-tab="drafts">草稿</button>
    <button id="recent-tab" type="button" data-sidebar-tab="recent">最近</button>
  </div>
  <div id="library-list" class="sidebar-list"></div>
</section>
```

Keep existing ids only if needed for migration, but avoid rendering old `当前 / 草稿 / 最近 / 工作目录` as separate stacked sections.

- [ ] **Step 2: Update renderer element bindings**

In `src/renderer/main.ts`, replace old element lookups:

- `draftsList`
- `recentFiles`
- `workdirName`
- `workdirBody`

with:

- `workspacesList`
- `workspaceAdd`
- `pinnedList`
- `draftsTab`
- `recentTab`
- `libraryList`

- [ ] **Step 3: Render workspaces**

Rules:

- no workspace: one button labeled `选择目录`
- one to three: compact list
- more than three: add scroll class
- active workspace highlighted
- `+` opens `chooseWorkdir()`
- clicking a known workspace calls `selectWorkspace(path)`

- [ ] **Step 4: Render pinned**

Rules:

- render pinned drafts and files
- show empty state when none
- clicking pinned draft opens draft
- clicking pinned file opens file
- pin button on each item toggles pinned state

- [ ] **Step 5: Render Drafts/Recent tabs**

Rules:

- default active tab: `drafts`
- Drafts tab shows draft entries
- Recent tab shows formal recent files
- each list item has a pin/unpin affordance
- deleting recent files still works from Recent tab
- deleting drafts still works from Drafts tab

- [ ] **Step 6: Update CSS**

Style:

- workspace list fixed-height only after three items
- pinned area compact and persistent
- Drafts/Recent segmented control
- item pin affordance using a small text/icon button
- no nested card-in-card layout
- preserve existing theme variables

- [ ] **Step 7: Run tests and build**

Run:

```bash
npm test -- src/renderer/sidebar-view.test.ts src/main/sidebar-state.test.ts src/main/workbench-state.test.ts
npm run build
```

Expected: PASS.

- [ ] **Step 8: Manual smoke check**

Run: `npm run dev`

Expected:

- app launches
- left sidebar can open/close
- selecting a workspace adds it to the workspace list
- Drafts tab is selected by default
- Recent tab can be selected
- pin/unpin works for visible draft/file items

- [ ] **Step 9: Commit**

```bash
git add src/renderer/index.html src/renderer/main.ts src/renderer/themes/base.css src/renderer/sidebar-view.ts src/renderer/sidebar-view.test.ts
git commit -m "feat: reshape sidebar into workbench navigation"
```

---

## Chunk 4: Right Outline Panel

### Task 8: Add editor-owned outline extraction

**Files:**
- Create: `src/renderer/editor/outline.ts`
- Create: `src/renderer/editor/outline.test.ts`
- Modify: `src/renderer/editor/editor.ts`

- [ ] **Step 1: Write pure outline tests**

Cover:

```ts
expect(normalizeHeadingText('  背景  ')).toBe('背景')
expect(shouldIncludeHeadingLevel(1)).toBe(true)
expect(shouldIncludeHeadingLevel(2)).toBe(true)
expect(shouldIncludeHeadingLevel(3)).toBe(false)
```

- [ ] **Step 2: Run test to verify failure**

Run: `npm test -- src/renderer/editor/outline.test.ts`

Expected: FAIL because the helper does not exist.

- [ ] **Step 3: Implement outline helper types**

Add:

```ts
export interface OutlineItem {
  id: string
  level: 1 | 2
  title: string
  pos: number
}
```

Add helpers for title normalization and level filtering.

- [ ] **Step 4: Add editor APIs**

In `src/renderer/editor/editor.ts`, export:

```ts
export function getOutlineItems(): OutlineItem[]
export function scrollToOutlineItem(id: string): boolean
```

Implementation guidance:

- Traverse `view.state.doc.descendants`.
- Include textblock nodes with `node.type.name === 'heading'`.
- Read heading level from `node.attrs.level`.
- Keep only H1/H2 for this release.
- Generate stable ids from index + position, e.g. `outline-${pos}-${index}`.
- Scroll by setting a safe `TextSelection` at the heading position and dispatching `scrollIntoView()`.

- [ ] **Step 5: Refresh outline after content changes**

Do not put outline extraction in main process. It belongs to the editor state.

- [ ] **Step 6: Run focused tests and build**

Run:

```bash
npm test -- src/renderer/editor/outline.test.ts src/renderer/editor/editor-regression.test.ts
npm run build
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/editor/outline.ts src/renderer/editor/outline.test.ts src/renderer/editor/editor.ts
git commit -m "feat: expose editor outline items"
```

### Task 9: Add right outline panel UI

**Files:**
- Modify: `src/renderer/index.html`
- Modify: `src/renderer/main.ts`
- Modify: `src/renderer/themes/base.css`
- Modify: `src/main/index.ts`
- Modify: `src/preload/index.ts`

- [ ] **Step 1: Add titlebar outline button**

In `src/renderer/index.html`, add a button next to existing titlebar controls:

```html
<button id="outline-toggle" type="button" aria-label="打开大纲">
  ...
</button>
```

Use a simple list/outline icon consistent with the existing inline SVG style.

- [ ] **Step 2: Add right panel markup**

Add beside editor shell:

```html
<aside id="outline-panel" hidden aria-hidden="true">
  <div class="outline-panel-header">大纲</div>
  <div id="outline-list" class="outline-list"></div>
</aside>
```

- [ ] **Step 3: Add menu shortcut**

In `src/main/index.ts`, add to View menu:

```ts
{
  label: 'Toggle Outline',
  accelerator: 'CmdOrCtrl+Shift+O',
  click: () => sendToFocused('menu-toggle-outline')
}
```

In `src/preload/index.ts`, expose:

```ts
onMenuToggleOutline: (callback: () => void) => void
```

- [ ] **Step 4: Wire renderer panel state**

In `src/renderer/main.ts`:

- import `getOutlineItems` and `scrollToOutlineItem`
- track `outlinePanelOpen`
- toggle from button, menu event, and `Cmd/Ctrl+Shift+O` fallback if needed
- refresh outline after `onUserEdit`, `onFileOpened`, and `onFileChanged`
- render empty state: `当前文档没有一级或二级标题`

- [ ] **Step 5: Add CSS**

Rules:

- right panel is hidden by default
- desktop width: panel occupies a narrow fixed width
- narrow width: panel should overlay or stay hidden rather than shrinking editor too much
- headings use indentation for H2
- active click target has stable height and no text overflow

- [ ] **Step 6: Run build**

Run: `npm run build`

Expected: PASS.

- [ ] **Step 7: Manual smoke check**

Run: `npm run dev`

Expected:

- outline button opens/closes right panel
- `Cmd/Ctrl+Shift+O` opens/closes right panel
- H1/H2 appear
- clicking outline item scrolls editor to that heading
- blank/no-heading docs show empty state
- left sidebar and search panel still work

- [ ] **Step 8: Commit**

```bash
git add src/renderer/index.html src/renderer/main.ts src/renderer/themes/base.css src/main/index.ts src/preload/index.ts
git commit -m "feat: add right outline panel"
```

---

## Final Verification

- [ ] **Step 1: Run full test suite**

Run: `npm test`

Expected: PASS.

- [ ] **Step 2: Run production build**

Run: `npm run build`

Expected: PASS.

- [ ] **Step 3: Run manual app smoke**

Run: `npm run dev`

Verify:

- Draft auto-save still creates a draft after first edit.
- Draft manual title edit renames the draft file in the draft directory.
- Draft `Cmd/Ctrl+S` prompts for formal save and removes draft after success.
- Saved draft appears in Recent and, if applicable, active workspace.
- Pinned draft migrates to pinned formal file after save.
- Workspaces display selected folder names or `选择目录`, never `工作目录`.
- More than three workspaces scroll.
- Drafts tab is selected by default.
- Recent tab works.
- Right outline panel opens with button and shortcut.
- H1/H2 outline navigation works.

- [ ] **Step 4: Review diff**

Run: `git diff --stat`

Expected: Only files listed in this plan are modified, plus any intentional test snapshots/docs.

- [ ] **Step 5: Commit final cleanup if needed**

If manual QA creates tiny fixes, commit them separately:

```bash
git add <changed-files>
git commit -m "fix: polish workbench stabilization"
```

---

## Implementation Notes

- Do not implement Agent diff or Agent review state in this pass.
- Do not introduce a full file tree.
- Do not silently switch from Drafts to Recent when Drafts is empty; default remains Drafts.
- Preserve existing recent-file semantics unless a test explicitly changes them.
- Preserve existing autosave protection against external Agent writes.
- Keep UI text concise; do not add explanatory feature-tour copy beyond the approved onboarding/save messages.
