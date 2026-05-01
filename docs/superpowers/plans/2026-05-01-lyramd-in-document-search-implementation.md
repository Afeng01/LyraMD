# LyraMD In-Document Search Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement LyraMD’s first search release as a minimal, reliable in-document find experience with a floating panel, selection-seeded query, per-document temporary query memory, and ProseMirror-native match/highlight/navigation behavior.

**Architecture:** Replace the current renderer-heavy string-search prototype with a split design: ProseMirror search state becomes the source of truth inside `src/renderer/editor/editor.ts`, while a smaller renderer floating panel only manages DOM, focus, and keyboard flow. Keep document-scoped query memory and hot-update fallback logic in focused helpers so the UI can stay small and the behavior can be regression-tested without a full Electron window.

**Tech Stack:** Electron, electron-vite, TypeScript, Milkdown/ProseMirror, `prosemirror-search`, Vitest

---

## File Structure

### New files

- `src/renderer/editor/search-memory.ts`
  Pure helpers for document-scoped query persistence, active-match fallback after content refresh, and lightweight search lifecycle rules that should not live in DOM code.

- `src/renderer/editor/search-memory.test.ts`
  Focused tests for per-document query memory, empty-query semantics, and active-match fallback after external refresh.

### Modified files

- `package.json`
- `package-lock.json`
  Add the `prosemirror-search` dependency and keep install metadata in sync.

- `src/renderer/editor/editor.ts`
  Make ProseMirror search the source of truth for query, match count, active match, navigation, reveal, selection seeding, and refresh-after-hot-update behavior.

- `src/renderer/editor/search.ts`
- `src/renderer/editor/search.test.ts`
  Shrink the existing “string search engine” role down to the UI-facing preview helpers that still make sense, or remove obsolete helpers and rewrite tests around the remaining pure behavior.

- `src/renderer/main.ts`
  Simplify the floating search panel wiring, bind `Cmd/Ctrl+F`, enforce focus/IME rules, manage per-document open/close behavior, and stop carrying the old “context preview / nearby results / locate button” complexity.

- `src/renderer/index.html`
  Reduce the current search panel markup to the approved minimal surface: input, previous, next, count, close.

- `src/renderer/themes/base.css`
  Restyle the search panel as the approved editor-top-right floating widget and remove unused styles tied to the old heavier panel.

- `docs/superpowers/specs/2026-05-01-lyramd-in-document-search-design.md`
  Update only if implementation reveals a real spec correction.

---

## Pre-flight Rules

- Do **not** treat the current search implementation as the target behavior just because it already exists.
- The current repo already contains a heavier search prototype with:
  - context preview
  - “附近结果”
  - “跳到”
  - overlay click handling
- Unless a piece is explicitly justified by the approved spec, remove or simplify it instead of preserving it by inertia.
- Keep this release scoped to **current-document find only**. Do not smuggle in replace, cross-document search, regex/case toggles, or result lists.
- Follow the user preference already recorded in memory: each completed bugfix/feature slice should end with a clean verification pass and a dedicated commit.

---

## Chunk 1: Re-baseline Search State Around the Approved Spec

### Task 1: Add the ProseMirror search dependency without touching behavior yet

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Add the dependency declaration**

Add `prosemirror-search` to runtime dependencies without changing any renderer code yet.

- [ ] **Step 2: Install and update the lockfile**

Run: `npm install`
Expected: PASS and `package-lock.json` includes the new package.

- [ ] **Step 3: Run a baseline build before deeper edits**

Run: `npm run build`
Expected: PASS so the dependency add is isolated from later code changes.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add prosemirror search dependency"
```

### Task 2: Add pure helper coverage for the new document-scoped search rules

**Files:**
- Create: `src/renderer/editor/search-memory.ts`
- Create: `src/renderer/editor/search-memory.test.ts`

- [ ] **Step 1: Write the failing tests**

Cover the approved rules:
- each document remembers its own last query
- switching documents closes the panel but does not erase the remembered query
- empty query renders as `0 / 0`
- active match fallback after hot refresh prefers the closest not-later successor, then predecessor, else clears active

Use explicit fixtures such as:

```ts
expect(resolveRememberedQuery({
  '/a.md': 'alpha',
  '/b.md': 'beta',
}, '/a.md')).toBe('alpha')
```

```ts
expect(resolveActiveMatchAfterRefresh({
  previousFrom: 20,
  nextMatches: [
    { index: 0, from: 5, to: 8 },
    { index: 1, from: 18, to: 21 },
    { index: 2, from: 28, to: 31 },
  ],
})).toBe(2)
```

- [ ] **Step 2: Run the focused test**

Run: `npm test -- src/renderer/editor/search-memory.test.ts`
Expected: FAIL because the helper module does not exist yet.

- [ ] **Step 3: Implement the minimal pure helpers**

Add only the state logic needed by the approved spec, for example:
- `rememberQueryForDocument()`
- `resolveRememberedQuery()`
- `resolveSearchCount()`
- `resolveActiveMatchAfterRefresh()`

- [ ] **Step 4: Re-run the focused test**

Run: `npm test -- src/renderer/editor/search-memory.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/renderer/editor/search-memory.ts src/renderer/editor/search-memory.test.ts
git commit -m "test: add document search memory helpers"
```

### Task 3: Re-scope the existing search helper file to the behavior that still belongs outside ProseMirror

**Files:**
- Modify: `src/renderer/editor/search.ts`
- Modify: `src/renderer/editor/search.test.ts`

- [ ] **Step 1: Rewrite the failing tests around the helpers that should survive**

Keep or add tests only for behavior that still belongs in pure helper land after ProseMirror becomes the search engine, such as:
- preview line extraction if it is still used
- nearby preview slicing only if the implementation still needs it

Delete or replace tests that lock in the old string-matching engine as the primary search source.

- [ ] **Step 2: Run the focused test**

Run: `npm test -- src/renderer/editor/search.test.ts`
Expected: FAIL until the helper surface is aligned with the new design.

- [ ] **Step 3: Trim the implementation**

Update `search.ts` so it no longer acts as the authoritative match engine for the editor. Keep only the pure UI-support helpers that are still justified after the approved spec.

- [ ] **Step 4: Re-run the focused test**

Run: `npm test -- src/renderer/editor/search.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/renderer/editor/search.ts src/renderer/editor/search.test.ts
git commit -m "refactor: slim renderer search helpers"
```

---

## Chunk 2: Make ProseMirror Search the Source of Truth

### Task 4: Add selection-seeded query and editor-owned search state

**Files:**
- Modify: `src/renderer/editor/editor.ts`
- Modify: `src/renderer/editor/search-memory.ts`

- [ ] **Step 1: Write the failing test for any new pure rule first**

If selection seeding or remembered-query precedence needs helper logic, add the failing test in `src/renderer/editor/search-memory.test.ts` before touching editor integration.

- [ ] **Step 2: Replace string-search authority with ProseMirror-backed query state**

In `editor.ts`, wire the editor search APIs so they are driven by `prosemirror-search` instead of recomputing every match from serialized Markdown text.

Required behavior:
- selection text can seed the next search query
- query changes update match/highlight state
- next/previous commands loop
- empty query clears active match and reports `0 / 0`

- [ ] **Step 3: Preserve editor focus and reveal behavior**

When navigating:
- reveal the active match in the viewport
- keep editor focus semantics compatible with the approved spec
- avoid breaking the existing “return focus to editor” helpers

- [ ] **Step 4: Run the focused tests and build**

Run:
- `npm test -- src/renderer/editor/search-memory.test.ts src/renderer/editor/search.test.ts`
- `npm run build`

Expected:
- tests PASS
- build PASS

- [ ] **Step 5: Commit only after verification is fully green**

```bash
git add src/renderer/editor/editor.ts src/renderer/editor/search-memory.ts src/renderer/editor/search-memory.test.ts
git commit -m "feat: add editor-owned document search state"
```

### Task 5: Make hot-update refresh preserve search state correctly

**Files:**
- Modify: `src/renderer/editor/editor.ts`
- Modify: `src/renderer/main.ts`
- Test: `src/renderer/editor/content-sync.test.ts`

- [ ] **Step 1: Add or extend a failing regression test where the pure logic lives**

If the fallback logic can be captured in `search-memory.test.ts`, do that first. If a content-sync test is more appropriate, extend `src/renderer/editor/content-sync.test.ts` with the specific regression wording.

- [ ] **Step 2: Refresh search state after programmatic content replacement**

When external file updates arrive:
- recompute match state for the current query
- keep the panel open if it was already open
- resolve the next active match using the approved fallback rule

- [ ] **Step 3: Verify the editor APIs stay stable**

Ensure:
- no stale active index after refresh
- no crash when all matches disappear
- no query loss during hot update

- [ ] **Step 4: Run the focused tests and build**

Run:
- `npm test -- src/renderer/editor/search-memory.test.ts src/renderer/editor/content-sync.test.ts`
- `npm run build`

Expected:
- tests PASS
- build PASS

- [ ] **Step 5: Commit**

```bash
git add src/renderer/editor/editor.ts src/renderer/main.ts src/renderer/editor/content-sync.test.ts src/renderer/editor/search-memory.ts src/renderer/editor/search-memory.test.ts
git commit -m "fix: preserve document search state through hot refresh"
```

---

## Chunk 3: Simplify the Floating Panel to the Approved UI

### Task 6: Reduce the search markup to the minimum approved controls

**Files:**
- Modify: `src/renderer/index.html`
- Modify: `src/renderer/themes/base.css`

- [ ] **Step 1: Remove the old extra controls from the markup**

Delete UI that is out of scope for this release:
- `search-overlay` if no longer needed
- `search-locate`
- `search-context`
- `search-results-toggle`
- `search-results`

Keep only:
- input
- previous
- next
- count
- close

- [ ] **Step 2: Restyle the panel to the approved anchor**

Make the panel:
- float inside the editor content area at top-right
- not push layout
- feel lighter than the current “mini dialog with result list” treatment

- [ ] **Step 3: Run build to catch stale selectors and ids**

Run: `npm run build`
Expected: FAIL until `main.ts` stops referencing removed DOM nodes.

### Task 7: Rewire keyboard, IME, and document-scoped open/close behavior

**Files:**
- Modify: `src/renderer/main.ts`
- Modify: `src/renderer/editor/editor.ts`
- Modify: `src/renderer/editor/search-memory.ts`

- [ ] **Step 1: Rework the panel controller around the approved rules**

Implement:
- `Cmd/Ctrl+F` opens the panel
- selected text seeds the query
- `Enter` jumps next
- `Shift+Enter` jumps previous
- `Esc` closes only when the search input owns the keyboard flow

- [ ] **Step 2: Make IME composition safe**

During composition:
- do not treat `Enter` as “next match”
- do not close on `Esc`
- do not break Chinese pinyin input

- [ ] **Step 3: Enforce the focus-scope rule**

If the panel is visible but editor focus has returned to the document:
- editor `Enter` inserts a newline
- search navigation does not hijack typing

- [ ] **Step 4: Restore per-document temporary query memory**

When switching files:
- close the panel
- keep each document’s last query in temporary memory
- when reopening search on that same document, restore the remembered query unless a fresh selection overrides it

- [ ] **Step 5: Run the relevant tests and build**

Run:
- `npm test -- src/renderer/editor/search-memory.test.ts src/renderer/editor/search.test.ts src/renderer/editor/content-sync.test.ts`
- `npm run build`

Expected:
- tests PASS
- build PASS

- [ ] **Step 6: Commit**

```bash
git add src/renderer/main.ts src/renderer/index.html src/renderer/themes/base.css src/renderer/editor/editor.ts src/renderer/editor/search-memory.ts
git commit -m "feat: ship minimal floating in-document search panel"
```

---

## Chunk 4: Verification and Handoff

### Task 8: Run the full automated verification for the search slice

**Files:**
- No source changes required unless verification fails

- [ ] **Step 1: Run focused automated coverage**

Run:

```bash
npm test -- src/renderer/editor/search-memory.test.ts src/renderer/editor/search.test.ts src/renderer/editor/content-sync.test.ts
```

Expected: PASS

- [ ] **Step 2: Run the full test suite**

Run:

```bash
npm test
```

Expected: PASS

- [ ] **Step 3: Run the production build**

Run:

```bash
npm run build
```

Expected: PASS

### Task 9: Produce human-readable QA evidence

**Files:**
- No source changes required unless QA finds a bug

- [ ] **Step 1: Manually verify the approved acceptance path**

Use a real app window and confirm:

1. `Cmd/Ctrl+F` opens a floating panel at the editor top-right.
2. Selecting text before opening search seeds the query.
3. `Enter` / `Shift+Enter` loops through matches.
4. Empty query shows `0 / 0`.
5. Chinese IME composition is not broken.
6. External file hot updates keep the panel/query alive and recompute the match count.
7. Switching documents closes the panel; reopening search on the original document restores its remembered query.
8. When the panel is still visible but focus has returned to the editor body, pressing `Enter` inserts a newline instead of hijacking input for search navigation.

- [ ] **Step 2: Commit only if QA required a follow-up code fix**

If QA finds no new bug, do not create a no-op commit.

---

Plan complete and saved to `docs/superpowers/plans/2026-05-01-lyramd-in-document-search-implementation.md`. Ready to execute?
