# Agent Onboarding Shortcuts Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Agent update affordance easier to discover, shorten its auto-dismiss delay to 3 seconds, and turn the Settings shortcut list into real persisted custom shortcuts.

**Architecture:** Keep the visible surface minimal: reuse the existing Agent change panel and Settings dialog rather than adding a new onboarding page. Persist shortcuts inside `AppSettings`, use those settings to render Electron menu accelerators, and use the same shortcut map in the renderer for renderer-owned actions such as Search.

**Tech Stack:** Electron menu accelerators, preload IPC, TypeScript strict mode, Vitest.

---

## Chunk 1: Agent Hint And CJK Shortcut

### Task 1: Shorten Agent auto-dismiss and add first-change expansion

**Files:**
- Modify: `src/renderer/agent-change-autodismiss.ts`
- Modify: `src/renderer/main.ts`
- Test: `src/renderer/agent-change-autodismiss.test.ts`
- Test: `src/renderer/agent-change-session.test.ts`

- [ ] Add failing tests for 3000ms auto-dismiss and first external update default-expanded state.
- [ ] Implement minimal changes: set delay to 3000ms and expand the first Agent update session only once per renderer lifecycle.
- [ ] Run targeted renderer tests.

### Task 2: Add Agent collaboration copy and CJK shortcut visibility

**Files:**
- Modify: `src/renderer/index.html`
- Modify: `src/main/index.ts`
- Test: `src/renderer/agent-change-panel-regression.test.ts`
- Test: `src/renderer/editor/cjk-format-regression.test.ts`

- [ ] Add failing regression tests that Settings includes an Agent collaboration section and CJK cleanup appears in shortcuts.
- [ ] Add `CmdOrCtrl+Shift+F` as the default CJK cleanup accelerator.
- [ ] Keep the Settings UI as a reference surface, not a new onboarding page.

## Chunk 2: Persisted Custom Shortcuts

### Task 3: Persist shortcut map in AppSettings

**Files:**
- Modify: `src/main/settings.ts`
- Modify: `src/preload/index.ts`
- Test: `src/main/settings.test.ts`

- [ ] Add failing tests for loading default shortcuts, preserving supported overrides, and rejecting malformed accelerators.
- [ ] Implement a settings-owned shortcut map with default accelerators and normalization.
- [ ] Extend settings IPC types to carry `shortcuts`.

### Task 4: Wire custom shortcuts to Settings, menu, and renderer actions

**Files:**
- Modify: `src/renderer/settings-dialog.ts`
- Modify: `src/renderer/main.ts`
- Modify: `src/main/index.ts`
- Test: `src/renderer/settings-dialog.test.ts`
- Test: `src/main/menu-regression.test.ts`

- [ ] Add failing tests that Settings calls `updateSettings({ shortcuts })` when a shortcut is recorded.
- [ ] Add failing tests that Electron menu accelerators read from `appSettings.shortcuts`.
- [ ] Implement shortcut recording with persistent settings refresh.
- [ ] Rebuild the app menu when shortcuts change.
- [ ] Use the shortcut map for renderer-owned shortcuts like Search and for Electron menu accelerators including Clean CJK.

## Verification

- [ ] `npm test`
- [ ] `npm run build`
- [ ] `git diff --check`
- [ ] Manual smoke: customize CJK shortcut in Settings, restart dev app, confirm the shortcut text persists and the menu accelerator changes.
