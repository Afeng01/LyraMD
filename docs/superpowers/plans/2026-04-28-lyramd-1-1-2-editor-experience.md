# LyraMD 1.1.2 Editor Experience Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement LyraMD `v1.1.2` as an editor-experience release: reliable autosave for real files, a true draft system for unnamed work, current-file search with a future-proof panel, and a responsive drawer sidebar that still feels minimal.

**Architecture:** Keep Electron + Milkdown, but split the new behavior into two testable cores: a main-process draft/session state layer and a renderer/editor interaction layer. The main process remains the source of truth for file identity, draft persistence, and sidebar snapshots; the renderer owns search UI, drawer interaction, and first-edit transitions that ask the main process to materialize drafts only when the blank document stops being blank.

**Tech Stack:** Electron, electron-vite, TypeScript, Milkdown/ProseMirror, Vitest

---

## File Structure

### New files

- `src/main/drafts.ts`  
  Pure helpers for draft metadata, draft path creation, promotion from blank session to draft file, and draft-to-regular-file transitions.

- `src/main/drafts.test.ts`  
  Focused tests for draft lifecycle rules and edge cases.

- `src/renderer/editor/search.ts`  
  Editor-adjacent search controller helpers: query state, current match navigation, and context snippet building for the floating panel.

### Modified files

- `src/main/index.ts`  
  Window/session state, app data paths, onboarding persistence, draft creation/promotion, autosave routing, search-related menu wiring, and responsive sidebar mode events.

- `src/main/sidebar-state.ts`
- `src/main/sidebar-state.test.ts`  
  Sidebar snapshot model changes, recent-file semantics, and split treatment of drafts vs recent files.

- `src/preload/index.ts`
- `src/renderer/env.d.ts`  
  IPC bridge and renderer typings for draft state, onboarding, autosave, search, and responsive drawer mode.

- `src/renderer/main.ts`
- `src/renderer/index.html`
- `src/renderer/themes/base.css`
- `src/renderer/editor/editor.ts`  
  Renderer shell behavior, drawer/sidebar rendering, onboarding UI, first-edit promotion, search panel, keyboard focus, and editor search integration.

- `docs/superpowers/specs/2026-04-28-lyramd-1-1-2-requirements.md`
- `docs/superpowers/specs/2026-04-28-lyramd-1-1-2-design.md`  
  Only touch if implementation reveals a necessary spec correction.

---

## Pre-flight Rules

- Do **not** treat the current uncommitted `v1.0.1` source edits as the implementation baseline. They are reference material only unless each kept behavior is explicitly justified against the `v1.1.2` spec.
- Before editing source, inspect the current dirty files and write down which ideas are being kept:
  - editor-only zoom behavior may be kept
  - current-window `Cmd/Ctrl+N` behavior may be kept in spirit
  - current autosave implementation is **not** sufficient because it does not model drafts
  - current sidebar icon swap is superseded by the new `rail + panel` icon direction
- If a dirty file contains useful code, copy the idea forward intentionally; do not build the feature by assuming the dirty diff is already correct.

---

## Chunk 1: Re-baseline Helper Logic

### Task 1: Fix recent-file semantics before adding draft separation

**Files:**
- Modify: `src/main/sidebar-state.ts`
- Modify: `src/main/sidebar-state.test.ts`

- [ ] **Step 1: Write the failing test that reflects `v1.1.2` recent-file behavior**

Add or replace coverage so reopening an existing regular file moves it to the front instead of leaving the old order untouched.

```ts
it('moves a reopened recent file to the front', () => {
  expect(pushRecentFile(['b.md', 'a.md', 'c.md'], 'a.md', 5)).toEqual(['a.md', 'b.md', 'c.md'])
})
```

- [ ] **Step 2: Run the focused sidebar-state test**

Run: `npm test -- src/main/sidebar-state.test.ts`
Expected: FAIL because the current helper keeps reopened files in place.

- [ ] **Step 3: Implement the minimal helper change**

Update `pushRecentFile()` so it:
- removes the file if it already exists
- prepends it
- trims to max length

- [ ] **Step 4: Re-run the focused test**

Run: `npm test -- src/main/sidebar-state.test.ts`
Expected: PASS

### Task 2: Add a pure draft lifecycle helper module

**Files:**
- Create: `src/main/drafts.ts`
- Create: `src/main/drafts.test.ts`

- [ ] **Step 1: Write failing tests for the draft rules from the approved spec**

Cover:
- blank untitled sessions stay transient until first edit
- first edit creates a real draft entry with a real `.md` path
- draft display title prefers heading, then first non-empty line, then `未命名草稿`
- promoting a draft to a regular file removes the draft entry

Use fixtures like:

```ts
expect(deriveDraftDisplayTitle('# Plan\nbody')).toBe('Plan')
expect(deriveDraftDisplayTitle('\njust text')).toBe('just text')
expect(deriveDraftDisplayTitle('   ')).toBe('未命名草稿')
```

- [ ] **Step 2: Run the focused draft test**

Run: `npm test -- src/main/drafts.test.ts`
Expected: FAIL because `src/main/drafts.ts` does not exist yet.

- [ ] **Step 3: Implement the minimal draft helpers**

Add explicit types such as:

```ts
export interface DraftEntry {
  id: string
  path: string
  createdAt: number
  updatedAt: number
}
```

Implement helpers for:
- generating deterministic draft filenames
- deriving display titles
- creating/removing/promoting draft entries
- checking whether content is still “blank enough” to stay transient

- [ ] **Step 4: Re-run the focused draft test**

Run: `npm test -- src/main/drafts.test.ts`
Expected: PASS

### Task 3: Extend persisted sidebar/app state shapes

**Files:**
- Modify: `src/main/sidebar-state.ts`
- Modify: `src/main/sidebar-state.test.ts`

- [ ] **Step 1: Add failing tests for the new persisted state defaults**

Cover:
- `drafts` defaults to an empty list
- onboarding-related flags default safely
- invalid persisted draft data is sanitized away

- [ ] **Step 2: Run the focused test**

Run: `npm test -- src/main/sidebar-state.test.ts`
Expected: FAIL because the state shape does not include draft-related fields yet.

- [ ] **Step 3: Expand the normalized state shape**

Add only the fields that belong in the persisted shell/app snapshot, for example:
- `draftDirectoryPath`
- `draftOnboardingCompleted`
- `draftEntries`

Keep per-window live session state out of this helper.

- [ ] **Step 4: Re-run the focused test**

Run: `npm test -- src/main/sidebar-state.test.ts`
Expected: PASS

---

## Chunk 2: Main Process Drafts, Autosave, and Session Identity

### Task 4: Add explicit window document identity state

**Files:**
- Modify: `src/main/index.ts`
- Modify: `src/main/drafts.ts`

- [ ] **Step 1: Add the state shape before wiring behavior**

Refactor `WindowState` so it can distinguish:

```ts
type DocumentKind = 'blank' | 'draft' | 'file'
```

Track:
- `documentKind`
- `filePath`
- `draftId`
- `lastActiveAt`
- existing watcher/autosave flags

- [ ] **Step 2: Update title and sidebar snapshot derivation to use document identity**

Blank untitled sessions should show as untitled but should not appear in the draft list.

- [ ] **Step 3: Verify TypeScript/build surface**

Run: `npm run build`
Expected: FAIL somewhere around sidebar snapshots or renderer contracts until later tasks land.

### Task 5: Route autosave through main-process draft promotion

**Files:**
- Modify: `src/main/index.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/env.d.ts`

- [ ] **Step 1: Define a new explicit autosave IPC contract**

Add a renderer-to-main method that is separate from manual Save/Save As, e.g.:

```ts
autosaveDocument: (payload: { content: string }) => Promise<{ kind: 'blank' | 'draft' | 'file'; path: string | null }>
```

- [ ] **Step 2: Implement autosave routing in the main process**

Behavior:
- regular file: write to existing file path
- draft file: write to draft path
- blank session with still-empty content: no-op
- blank session with first real edit: create draft directory if needed, materialize draft file, persist draft entry, write content

- [ ] **Step 3: Keep manual Save and Save As distinct**

Manual `save-file` / `save-file-as` should still:
- allow user-selected final destinations
- promote a draft to a regular file when Save As succeeds

- [ ] **Step 4: Run focused tests and build**

Run:
- `npm test -- src/main/drafts.test.ts src/main/sidebar-state.test.ts`
- `npm run build`

Expected:
- helper tests PASS
- build may still fail on renderer references that will be added next

### Task 6: Persist onboarding, draft directory, and last active session

**Files:**
- Modify: `src/main/index.ts`
- Modify: `src/main/sidebar-state.ts`

- [ ] **Step 1: Add persisted app-data paths**

Keep using `appDataDir`, and add storage for:
- draft preferences/state
- last active document identity

- [ ] **Step 2: Implement onboarding/draft directory behavior**

Rules:
- first launch shows onboarding state as incomplete
- skip path resolves to `Documents/LyraMD Drafts`
- explicit choice persists the selected directory

- [ ] **Step 3: Persist and restore last active draft session**

On shutdown or document switches, store enough identity to restore the last active draft at next launch.

- [ ] **Step 4: Restore startup behavior**

On app ready:
- load persisted sidebar/app state
- recover valid draft entries
- if last active document is a draft that still exists, reopen it
- otherwise fall back to regular startup behavior

### Task 7: Add a draft-aware sidebar snapshot and open handlers

**Files:**
- Modify: `src/main/index.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/env.d.ts`

- [ ] **Step 1: Extend the snapshot payload**

The renderer needs:
- `currentDocumentKind`
- `currentFilePath`
- `draftEntries`
- onboarding status
- drawer/overlay mode flag (or enough info to derive it)

- [ ] **Step 2: Add draft-specific open/remove commands**

Expose IPC for:
- opening a draft from the sidebar
- completing/skipping onboarding
- choosing/changing the draft directory

- [ ] **Step 3: Keep recent-file routing regular-file only**

Ensure:
- opening a draft does **not** push it into recent files
- promoting to a regular file **does** push it into recent files

---

## Chunk 3: Renderer Shell, Onboarding, and Responsive Drawer

### Task 8: Reshape the sidebar UI to `当前 / 草稿 / 最近 / 工作目录`

**Files:**
- Modify: `src/renderer/main.ts`
- Modify: `src/renderer/index.html`
- Modify: `src/renderer/themes/base.css`

- [ ] **Step 1: Update the shell markup for the new sections**

Add dedicated containers for:
- current document
- drafts
- recent files
- workdir

Do not overload the recent-file container to show drafts.

- [ ] **Step 2: Render blank, draft, and regular sessions differently**

Rules:
- blank untitled session only appears in `当前`
- real drafts render in `草稿`
- regular files render in `最近`

- [ ] **Step 3: Add empty states**

Render clear empty text for:
- no drafts yet
- no recent files yet
- no workdir selected / workdir empty

### Task 9: Add onboarding UI without introducing a settings screen

**Files:**
- Modify: `src/renderer/main.ts`
- Modify: `src/renderer/index.html`
- Modify: `src/renderer/themes/base.css`

- [ ] **Step 1: Add a lightweight onboarding overlay shell**

It only needs:
- a short explanation of draft recovery
- `选择草稿目录`
- `暂时跳过`

- [ ] **Step 2: Wire onboarding actions to preload IPC**

Behavior:
- choose path -> persist chosen directory and dismiss
- skip -> persist completion plus default Documents fallback and dismiss

- [ ] **Step 3: Verify non-blocking startup**

The overlay should not break editor boot, theme load, or existing file opening.

### Task 10: Convert the narrow-window sidebar into a drawer

**Files:**
- Modify: `src/main/index.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/env.d.ts`
- Modify: `src/renderer/main.ts`
- Modify: `src/renderer/themes/base.css`

- [ ] **Step 1: Define a single drawer threshold constant**

Keep it internal, not user-configurable in this release.

- [ ] **Step 2: Send responsive mode changes to the renderer**

Use a window-size listener or snapshot refresh path so the renderer knows when it should render:
- desktop sidebar mode
- drawer overlay mode

- [ ] **Step 3: Implement drawer behavior in CSS and JS**

Need:
- overlay backdrop
- left-slide animation
- close on backdrop click
- same titlebar toggle button in both modes

- [ ] **Step 4: Update the titlebar toggle icon**

Replace the current icon with the approved `rail + panel` visual direction.

---

## Chunk 4: Search Panel and Keyboard Behavior

### Task 11: Add editor-side search helpers

**Files:**
- Create: `src/renderer/editor/search.ts`
- Modify: `src/renderer/editor/editor.ts`

- [ ] **Step 1: Add a pure search helper surface**

Start with types/functions that can be reasoned about independently:

```ts
export interface SearchMatchPreview {
  index: number
  from: number
  to: number
  before: string
  match: string
  after: string
}
```

- [ ] **Step 2: Implement current-file query and preview generation**

Use the current Markdown/plain-text representation as the search source for `v1.1.2`.

The helper should produce:
- total match count
- current active match index
- excerpt text around each match

- [ ] **Step 3: Add editor integration points**

Expose renderer-facing methods like:
- `setSearchQuery(query)`
- `nextSearchMatch()`
- `previousSearchMatch()`
- `focusEditorAtLastSelection()`

### Task 12: Build the floating search panel

**Files:**
- Modify: `src/renderer/main.ts`
- Modify: `src/renderer/index.html`
- Modify: `src/renderer/themes/base.css`
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/env.d.ts`

- [ ] **Step 1: Add panel markup and state wiring**

The panel should include:
- query input
- current/total count
- previous/next buttons
- current match context
- collapsed container for future multi-result expansion

- [ ] **Step 2: Add `Cmd/Ctrl+F` behavior**

It must:
- open the panel
- focus the query input
- leave the editor otherwise intact

- [ ] **Step 3: Add `Cmd/Ctrl+L` behavior**

It must:
- always return focus to the editor body
- restore the last writing position rather than focusing the search field

- [ ] **Step 4: Keep future range expansion visible but inactive**

Add a structural placeholder for future search scopes, but do **not** wire actual recent/workdir data sources in this release.

### Task 13: Make file switching use the new autosave and focus rules

**Files:**
- Modify: `src/renderer/main.ts`
- Modify: `src/main/index.ts`

- [ ] **Step 1: Replace old renderer-side autosave assumptions**

The current renderer autosave path assumes “path exists or do nothing.” Update it to call the new autosave IPC that can materialize drafts.

- [ ] **Step 2: Flush before every file/context switch**

Ensure switches from:
- current file -> recent
- current file -> workdir
- current file -> draft
- current file -> new blank session

all call the same flush path.

- [ ] **Step 3: Preserve editor focus and selection sensibly**

After switching:
- opening a search panel should not steal focus permanently
- `Cmd/Ctrl+L` should recover editor focus from sidebar/search interactions

---

## Chunk 5: Verification, Spec Sync, and Wrap-up

### Task 14: Run automated and build verification

**Files:**
- Test: `src/main/sidebar-state.test.ts`
- Test: `src/main/drafts.test.ts`
- Test: `src/main/workdir.test.ts`

- [ ] **Step 1: Run focused helper tests**

Run: `npm test -- src/main/sidebar-state.test.ts src/main/drafts.test.ts src/main/workdir.test.ts`
Expected: PASS

- [ ] **Step 2: Run the full test suite**

Run: `npm test`
Expected: PASS

- [ ] **Step 3: Run the production build**

Run: `npm run build`
Expected: PASS

### Task 15: Perform manual acceptance against the approved spec

**Files:**
- Reference: `docs/superpowers/specs/2026-04-28-lyramd-1-1-2-requirements.md`
- Reference: `docs/superpowers/specs/2026-04-28-lyramd-1-1-2-design.md`

- [ ] **Step 1: Verify file/draft safety flows**

Check:
- existing file autosaves
- switching files does not lose content
- untouched blank document does not create a draft
- first real edit creates a draft

- [ ] **Step 2: Verify restart and sidebar recovery**

Check:
- last active draft auto-recovers
- drafts appear only in `草稿`
- recent files remain regular-file-only

- [ ] **Step 3: Verify search and keyboard**

Check:
- `Cmd/Ctrl+F` opens the floating panel
- match context is visible
- next/previous navigation works
- `Cmd/Ctrl+L` always returns to the editor body

- [ ] **Step 4: Verify responsive drawer behavior**

Check:
- window can shrink smaller than the current hard stop
- below threshold, sidebar becomes a drawer
- drawer opens from the titlebar button and closes on backdrop click

- [ ] **Step 5: Verify visual updates**

Check:
- new `rail + panel` sidebar icon
- updated application icon assets in-app and in build output

### Task 16: Update docs only if the implementation forced a real spec correction

**Files:**
- Modify if needed: `docs/superpowers/specs/2026-04-28-lyramd-1-1-2-requirements.md`
- Modify if needed: `docs/superpowers/specs/2026-04-28-lyramd-1-1-2-design.md`

- [ ] **Step 1: Compare shipped behavior with the approved spec**

Only change spec text if implementation surfaced a genuine mismatch that Cherry approves.

- [ ] **Step 2: Keep document churn minimal**

Do not rewrite the spec just to mirror implementation trivia.

### Task 17: Commit the finished `v1.1.2` implementation intentionally

**Files:**
- Modify: implementation files from this plan
- Modify: docs only if step 16 required it

- [ ] **Step 1: Review the final diff**

Run: `git diff --stat` and `git diff`
Expected: only `v1.1.2`-scoped files and intentional carry-forwards from the old dirty baseline.

- [ ] **Step 2: Stage only the intended files**

Do not accidentally stage unrelated leftovers from the abandoned `v1.0.1` attempt.

- [ ] **Step 3: Commit**

```bash
git add src/main/index.ts src/main/sidebar-state.ts src/main/sidebar-state.test.ts src/main/drafts.ts src/main/drafts.test.ts src/preload/index.ts src/renderer/env.d.ts src/renderer/main.ts src/renderer/index.html src/renderer/themes/base.css src/renderer/editor/editor.ts src/renderer/editor/search.ts docs/superpowers/plans/2026-04-28-lyramd-1-1-2-editor-experience.md
git commit -m "feat: implement LyraMD v1.1.2 editor experience"
```
