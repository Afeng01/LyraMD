# ColaMD Search Panel Polish Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the in-document search panel feel truly floating, restore reliable keyboard navigation, and add a three-line context preview without regressing search refresh behavior.

**Architecture:** Keep ProseMirror search state as the single source of truth, extend renderer-side panel rendering to consume richer search snapshots, and drive all search navigation through the existing editor search commands. Implement in two slices: search state/preview behavior first, then panel UI/interaction polish.

**Tech Stack:** TypeScript, Vitest, Electron renderer, Milkdown, ProseMirror search

---

## Chunk 1: Search State And Preview Semantics

### Task 1: Encode search preview and activation behavior in tests

**Files:**
- Modify: `src/renderer/editor/search.test.ts`
- Modify: `src/renderer/editor/search-memory.test.ts`
- Test: `src/renderer/editor/search.test.ts`
- Test: `src/renderer/editor/search-memory.test.ts`

- [ ] **Step 1: Write failing preview semantics tests**

Add tests for:
- single-line normalization of multi-line query input
- active preview fallback behavior inputs
- nearest-successor / predecessor refresh expectations

- [ ] **Step 2: Run targeted tests to verify failure**

Run: `npm test -- src/renderer/editor/search.test.ts src/renderer/editor/search-memory.test.ts`
Expected: FAIL on the new expectations only.

- [ ] **Step 3: Implement minimal search helper changes**

Update the search helpers only enough to satisfy:
- query normalization for panel use
- explicit preview fallback contract
- refresh behavior that preserves the approved active-match fallback semantics

- [ ] **Step 4: Re-run targeted tests**

Run: `npm test -- src/renderer/editor/search.test.ts src/renderer/editor/search-memory.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/renderer/editor/search.test.ts src/renderer/editor/search-memory.test.ts src/renderer/editor/search.ts src/renderer/editor/search-memory.ts
git commit -m "test: lock search preview semantics"
```

### Task 2: Expose panel-ready search state from the editor layer

**Files:**
- Modify: `src/renderer/editor/editor.ts`
- Test: `src/renderer/editor/editor-regression.test.ts`
- Test: `src/renderer/editor/session-ux.test.ts`

- [ ] **Step 1: Write failing editor-state tests**

Add tests covering:
- panel query normalization
- initial active match selection after query changes
- preserved focus-friendly state after next/prev operations

- [ ] **Step 2: Run targeted tests to verify failure**

Run: `npm test -- src/renderer/editor/editor-regression.test.ts src/renderer/editor/session-ux.test.ts`
Expected: FAIL on the new editor search expectations.

- [ ] **Step 3: Implement minimal editor state updates**

Adjust `src/renderer/editor/editor.ts` so that:
- panel queries normalize to single-line search strings
- active match picks current selection first, then next match, then wraps
- refresh behavior keeps approved successor / predecessor fallback semantics

- [ ] **Step 4: Re-run targeted tests**

Run: `npm test -- src/renderer/editor/editor-regression.test.ts src/renderer/editor/session-ux.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/renderer/editor/editor.ts src/renderer/editor/editor-regression.test.ts src/renderer/editor/session-ux.test.ts
git commit -m "feat: expose panel-ready search state"
```

---

## Chunk 2: Floating Panel UI And Interaction Polish

### Task 3: Add search context preview markup and styling

**Files:**
- Modify: `src/renderer/index.html`
- Modify: `src/renderer/themes/base.css`
- Test: `src/renderer/session-ux.test.ts`

- [ ] **Step 1: Write failing panel structure tests**

Add tests that assert:
- context preview region exists between input row and navigation row
- empty-state placeholders render correctly
- panel class/attributes support floating anchored behavior

- [ ] **Step 2: Run targeted tests to verify failure**

Run: `npm test -- src/renderer/editor/session-ux.test.ts`
Expected: FAIL on the new search panel structure assertions.

- [ ] **Step 3: Implement minimal markup and CSS**

Update the renderer markup and base theme so that:
- the panel includes previous/current/next preview rows
- the panel visually floats above the editor viewport
- preview rows have explicit empty / active styles

- [ ] **Step 4: Re-run targeted tests**

Run: `npm test -- src/renderer/editor/session-ux.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/renderer/index.html src/renderer/themes/base.css src/renderer/editor/session-ux.test.ts
git commit -m "feat: add search context preview panel UI"
```

### Task 4: Wire panel rendering, focus retention, and keyboard navigation

**Files:**
- Modify: `src/renderer/main.ts`
- Modify: `src/renderer/editor/editor.ts`
- Test: `src/renderer/editor/session-ux.test.ts`
- Test: `src/renderer/editor/content-sync.test.ts`

- [ ] **Step 1: Write failing interaction tests**

Add tests covering:
- `Enter` moves to next result
- `Shift+Enter` moves to previous result
- clicking prev/next keeps focus on the search input
- panel preview refreshes after content sync / hot update

- [ ] **Step 2: Run targeted tests to verify failure**

Run: `npm test -- src/renderer/editor/session-ux.test.ts src/renderer/editor/content-sync.test.ts`
Expected: FAIL on the new interaction and refresh assertions.

- [ ] **Step 3: Implement minimal renderer wiring**

Update `src/renderer/main.ts` and any small supporting editor APIs so that:
- `Cmd/Ctrl+F` re-focuses and selects the panel input
- query memory prefers new selection text when reopening
- next/prev buttons and keyboard both call the same navigation path
- focus stays on the panel input after navigation
- preview rows render the active search snapshot and fallback state

- [ ] **Step 4: Re-run targeted tests**

Run: `npm test -- src/renderer/editor/session-ux.test.ts src/renderer/editor/content-sync.test.ts`
Expected: PASS

- [ ] **Step 5: Run full verification**

Run: `npm test && npm run build`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/renderer/main.ts src/renderer/editor/editor.ts src/renderer/editor/session-ux.test.ts src/renderer/editor/content-sync.test.ts
git add src/renderer/index.html src/renderer/themes/base.css src/renderer/editor/search.ts src/renderer/editor/search-memory.ts src/renderer/editor/search.test.ts src/renderer/editor/editor-regression.test.ts
git commit -m "feat: polish floating search panel interactions"
```

---

## Chunk 3: Final Verification And Handoff

### Task 5: Final review and regression gate

**Files:**
- Modify: `docs/superpowers/plans/2026-05-02-colamd-search-panel-polish-implementation.md`

- [ ] **Step 1: Run final targeted sanity checks**

Run:
- `npm test -- src/renderer/editor/search.test.ts src/renderer/editor/search-memory.test.ts`
- `npm test -- src/renderer/editor/editor-regression.test.ts src/renderer/editor/session-ux.test.ts src/renderer/editor/content-sync.test.ts`

Expected: PASS

- [ ] **Step 2: Run full repository verification**

Run: `npm test && npm run build`
Expected: PASS

- [ ] **Step 3: Update plan checkboxes if execution stayed in-band**

Mark completed steps in this plan only if execution was performed directly from this session.

- [ ] **Step 4: Prepare proof pack**

Collect:
- user-visible changes
- exact tests run
- remaining risks or manual QA gaps

