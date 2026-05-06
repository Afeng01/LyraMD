# LyraMD 2.0 Phase C Layout Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the LyraMD 2.0 Phase C visual/layout skeleton while keeping the current Electron + Milkdown editor working.

**Architecture:** Keep the existing Electron main/preload/renderer split. Add small, focused renderer state/helpers for responsive panel placement and background appearance, extend settings persistence, and only add non-destructive layout skeletons before wiring real PTY terminal behavior in a later plan.

**Tech Stack:** Electron, electron-vite, TypeScript strict mode, Milkdown, Vitest, existing DOM renderer, CSS variables. Gemini is used as an external visual/design review input via interactive terminal, not as an implementation authority.

---

## Source Spec

- Design spec: `docs/superpowers/specs/2026-05-06-lyramd-2-phase-c-layout-design.md`
- Current layout entry: `src/renderer/index.html`
- Current renderer orchestration: `src/renderer/main.ts`
- Current styling: `src/renderer/themes/base.css`
- Current settings model: `src/main/settings.ts`, `src/preload/index.ts`, `src/renderer/settings-dialog.ts`
- Current sidebar/workdir model: `src/main/workdir.ts`, `src/main/sidebar-state.ts`, `src/renderer/sidebar-view.ts`

## Gemini Design Review Gate

For visual/aesthetic decisions, run Gemini from an observable interactive terminal, not headless `gemini -p`.

Use this prompt pattern before each visual chunk and again after screenshots:

```text
请作为 LyraMD 的界面与审美设计顾问审查当前 Phase C 方案/截图。只评价视觉层级、信息密度、布局比例、面板切换和背景可读性。不要建议新增产品功能，不要建议重写技术栈。输出：保留点、风险点、必须调整点。
```

If Gemini suggests large feature expansion, ignore that part unless it directly improves Phase C acceptance criteria.

## Scope Boundaries

This plan implements the Phase C skeleton only:

- Responsive right/bottom Agent panel shell.
- Agent/Outline shared panel switch.
- Background settings model and visual application.
- Workdir tree data model and renderer skeleton.
- LyraMD visible naming cleanup where it touches Phase C surfaces.

This plan does not implement:

- Real PTY terminal execution.
- Selection injection into live CLI.
- Tauri migration.
- Tiptap/CodeMirror migration.
- Full file manager operations beyond tree skeleton and create file/folder hooks.

## Chunk 1: Settings And Pure Layout State

### Task 1: Extend App Settings Types

**Files:**
- Modify: `src/main/settings.ts`
- Modify: `src/preload/index.ts`
- Test: `src/main/settings.test.ts`

- [ ] **Step 1: Add failing settings tests**

Add tests covering:

```ts
it('normalizes phase c layout defaults', () => {
  const settings = normalizeAppSettings({})
  expect(settings.agentPanelPosition).toBe('auto')
  expect(settings.background.mode).toBe('default')
  expect(settings.background.scope).toBe('editor')
})

it('rejects invalid background settings', () => {
  const settings = normalizeAppSettings({
    background: {
      mode: 'image',
      scope: 'everything',
      opacity: 3,
      blur: -1,
      dim: 2,
    },
  } as never)
  expect(settings.background.scope).toBe('editor')
  expect(settings.background.opacity).toBeLessThanOrEqual(1)
  expect(settings.background.blur).toBeGreaterThanOrEqual(0)
  expect(settings.background.dim).toBeLessThanOrEqual(1)
})
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
npm test -- src/main/settings.test.ts
```

Expected: FAIL because `agentPanelPosition` and `background` do not exist.

- [ ] **Step 3: Add settings fields**

In `src/main/settings.ts`, add:

```ts
export type AgentPanelPosition = 'auto' | 'bottom' | 'right'
export type BackgroundMode = 'default' | 'color' | 'image'
export type BackgroundScope = 'editor' | 'window'

export interface BackgroundSettings {
  mode: BackgroundMode
  scope: BackgroundScope
  color: string
  imagePath: string | null
  opacity: number
  blur: number
  dim: number
}
```

Extend `AppSettings`:

```ts
agentPanelPosition: AgentPanelPosition
background: BackgroundSettings
```

Default:

```ts
agentPanelPosition: 'auto'
background: {
  mode: 'default',
  scope: 'editor',
  color: '#ffffff',
  imagePath: null,
  opacity: 1,
  blur: 0,
  dim: 0.18,
}
```

Add normalizers with clamped numeric fields.

- [ ] **Step 4: Mirror types in preload**

Update `src/preload/index.ts` with the same exported types and `AppSettings` shape.

- [ ] **Step 5: Run tests**

Run:

```bash
npm test -- src/main/settings.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/main/settings.ts src/preload/index.ts src/main/settings.test.ts
git commit -m "feat: add phase c layout settings"
```

### Task 2: Add Pure Responsive Panel Placement Helper

**Files:**
- Create: `src/renderer/phase-c-layout.ts`
- Test: `src/renderer/phase-c-layout.test.ts`

- [ ] **Step 1: Write failing tests**

Test auto placement, explicit override, and hysteresis:

```ts
expect(resolveAgentPanelPlacement({
  preference: 'auto',
  width: 1500,
  height: 900,
  previous: 'bottom',
})).toBe('right')

expect(resolveAgentPanelPlacement({
  preference: 'bottom',
  width: 1600,
  height: 900,
  previous: 'right',
})).toBe('bottom')

expect(resolveAgentPanelPlacement({
  preference: 'auto',
  width: 1210,
  height: 900,
  previous: 'right',
})).toBe('right')
```

- [ ] **Step 2: Run tests and verify failure**

```bash
npm test -- src/renderer/phase-c-layout.test.ts
```

Expected: FAIL because helper file does not exist.

- [ ] **Step 3: Implement helper**

Create a pure function:

```ts
export type AgentPanelPlacement = 'bottom' | 'right'

export interface ResolveAgentPanelPlacementInput {
  preference: 'auto' | 'bottom' | 'right'
  width: number
  height: number
  previous: AgentPanelPlacement
}

export function resolveAgentPanelPlacement(input: ResolveAgentPanelPlacementInput): AgentPanelPlacement {
  if (input.preference === 'bottom') return 'bottom'
  if (input.preference === 'right') return input.width < 1040 ? 'bottom' : 'right'
  if (input.width >= 1240) return 'right'
  if (input.previous === 'right' && input.width >= 1190) return 'right'
  return 'bottom'
}
```

- [ ] **Step 4: Run tests**

```bash
npm test -- src/renderer/phase-c-layout.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/phase-c-layout.ts src/renderer/phase-c-layout.test.ts
git commit -m "feat: add responsive agent panel placement"
```

## Chunk 2: Agent/Outline Shared Panel Skeleton

### Task 3: Add DOM Skeleton

**Files:**
- Modify: `src/renderer/index.html`
- Modify: `src/renderer/main.ts`
- Modify: `src/renderer/themes/base.css`
- Test: `src/renderer/windows-titlebar-regression.test.ts` or new `src/renderer/phase-c-layout-dom.test.ts`

- [ ] **Step 1: Add test for required panel elements**

Create a renderer DOM test that loads `src/renderer/index.html` and asserts IDs exist:

```ts
expect(document.getElementById('context-panel')).not.toBeNull()
expect(document.getElementById('context-panel-agent-tab')).not.toBeNull()
expect(document.getElementById('context-panel-outline-tab')).not.toBeNull()
expect(document.getElementById('agent-panel')).not.toBeNull()
expect(document.getElementById('agent-terminal-placeholder')).not.toBeNull()
```

- [ ] **Step 2: Run test and verify failure**

```bash
npm test -- src/renderer/phase-c-layout-dom.test.ts
```

Expected: FAIL because new DOM does not exist.

- [ ] **Step 3: Update HTML**

In `src/renderer/index.html`, introduce:

```html
<section id="context-panel" aria-label="Agent and outline panel">
  <div id="context-panel-tabs" role="tablist">
    <button id="context-panel-agent-tab" type="button" role="tab" aria-controls="agent-panel">Agent</button>
    <button id="context-panel-outline-tab" type="button" role="tab" aria-controls="outline-panel">Outline</button>
  </div>
  <section id="agent-panel" role="tabpanel">
    <div id="agent-terminal-placeholder">Agent CLI</div>
  </section>
</section>
```

Move or visually associate existing `#outline-panel` under the shared context panel without breaking current outline rendering. If moving the DOM is too risky in this chunk, keep `#outline-panel` in place and use CSS/JS to make it appear as the outline tab content.

- [ ] **Step 4: Wire tab switching**

In `src/renderer/main.ts`, add minimal state:

```ts
let activeContextPanel: 'agent' | 'outline' = 'agent'
```

Add render helper that toggles:

- `#agent-panel.hidden`
- `#outline-panel` `aria-hidden`
- tab `aria-selected`
- `#app-shell.context-panel-open`
- `#app-shell.context-panel-bottom` / `context-panel-right`

- [ ] **Step 5: Add CSS skeleton**

In `src/renderer/themes/base.css`, style:

- `#context-panel`
- right placement
- bottom placement
- tabs
- terminal placeholder

Keep styling restrained: no decorative gradients, no large rounded cards, no nested cards.

- [ ] **Step 6: Run focused tests**

```bash
npm test -- src/renderer/phase-c-layout-dom.test.ts src/renderer/windows-titlebar-regression.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/index.html src/renderer/main.ts src/renderer/themes/base.css src/renderer/phase-c-layout-dom.test.ts
git commit -m "feat: add agent outline panel skeleton"
```

### Task 4: Apply Responsive Placement In Renderer

**Files:**
- Modify: `src/renderer/main.ts`
- Modify: `src/renderer/phase-c-layout.ts`
- Test: `src/renderer/phase-c-layout.test.ts`

- [ ] **Step 1: Add test for CSS class mapping**

Add a pure helper:

```ts
export function resolveAgentPanelClassName(placement: AgentPanelPlacement): string {
  return placement === 'right' ? 'agent-panel-right' : 'agent-panel-bottom'
}
```

Test both values.

- [ ] **Step 2: Wire resize listener**

In `main.ts`, after settings load:

- Track previous placement.
- On init and `window.resize`, call `resolveAgentPanelPlacement`.
- Apply placement classes to `#app-shell`.
- Never recreate `#agent-panel` during placement changes.

- [ ] **Step 3: Add shortcut-ready toggles**

Do not create a new shortcut yet unless needed. Add click handlers:

- Agent tab switches to Agent.
- Outline tab switches to Outline and reuses existing outline render.

- [ ] **Step 4: Run tests**

```bash
npm test -- src/renderer/phase-c-layout.test.ts src/renderer/phase-c-layout-dom.test.ts
npm run build
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/main.ts src/renderer/phase-c-layout.ts src/renderer/phase-c-layout.test.ts src/renderer/phase-c-layout-dom.test.ts
git commit -m "feat: make agent panel responsive"
```

## Chunk 3: Background Settings Skeleton

### Task 5: Add Background Settings UI

**Files:**
- Modify: `src/renderer/index.html`
- Modify: `src/renderer/settings-dialog.ts`
- Modify: `src/renderer/settings-dialog.test.ts`
- Modify: `src/renderer/themes/base.css`

- [ ] **Step 1: Write failing settings dialog test**

Assert settings UI contains:

- scope segmented control: editor/window
- mode control: default/color/image
- opacity input
- blur input
- dim input
- reset button

- [ ] **Step 2: Update settings HTML**

Add background controls in the existing workspace/appearance pane. Use compact controls, not a large decorative preview card.

- [ ] **Step 3: Wire renderer settings**

In `settings-dialog.ts`:

- Read current `appSettings.background`.
- Update settings via `api.updateSettings({ background: next })`.
- Re-render after update.
- Add validation only as UI nicety; main process normalizer remains source of truth.

- [ ] **Step 4: Add CSS variables application**

Create helper in `main.ts` or a new file:

```ts
applyBackgroundSettings(settings.background)
```

Set CSS vars on `document.documentElement`:

- `--lyra-bg-mode`
- `--lyra-bg-color`
- `--lyra-bg-image`
- `--lyra-bg-opacity`
- `--lyra-bg-blur`
- `--lyra-bg-dim`
- `data-background-scope`

- [ ] **Step 5: Style backgrounds**

In `base.css`:

- Editor-only scope affects `#editor-shell` / `#editor-stage`.
- Window scope affects `#app-shell`.
- Sidebars and panels keep readable surfaces.
- Terminal placeholder always has independent surface.

- [ ] **Step 6: Run tests and build**

```bash
npm test -- src/renderer/settings-dialog.test.ts src/main/settings.test.ts
npm run build
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/index.html src/renderer/settings-dialog.ts src/renderer/settings-dialog.test.ts src/renderer/themes/base.css src/renderer/main.ts
git commit -m "feat: add background appearance controls"
```

## Chunk 4: Workdir Tree Skeleton

### Task 6: Add Tree Data Model

**Files:**
- Modify: `src/main/workdir.ts`
- Modify: `src/preload/index.ts`
- Test: `src/main/workdir.test.ts`

- [ ] **Step 1: Add failing tests**

Create temp directory:

```text
root/
  a.md
  notes/
    b.md
    nested/
      c.md
  image.png
```

Assert tree returns folders and markdown files only.

- [ ] **Step 2: Add types**

In `src/main/workdir.ts`:

```ts
export interface WorkdirTreeNode {
  kind: 'directory' | 'file'
  absolutePath: string
  relativePath: string
  name: string
  children?: WorkdirTreeNode[]
}
```

Add `scanWorkdirTree(rootPath: string): Promise<WorkdirTreeNode[]>`.

Keep existing `scanWorkdir()` for compatibility.

- [ ] **Step 3: Run tests**

```bash
npm test -- src/main/workdir.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/main/workdir.ts src/main/workdir.test.ts src/preload/index.ts
git commit -m "feat: add workdir tree model"
```

### Task 7: Render Tree In Existing Sidebar

**Files:**
- Modify: `src/preload/index.ts`
- Modify: `src/main/index.ts`
- Modify: `src/renderer/sidebar-view.ts`
- Modify: `src/renderer/main.ts`
- Modify: `src/renderer/sidebar-view.test.ts`
- Modify: `src/renderer/themes/base.css`

- [ ] **Step 1: Extend SidebarState**

Add `workdirTreeEntries: WorkdirTreeNode[]` while keeping `workdirEntries` for compatibility during transition.

- [ ] **Step 2: Update main process state producer**

Where `scanWorkdir()` is currently called in `src/main/index.ts`, also call `scanWorkdirTree()` and include it in sidebar state.

- [ ] **Step 3: Add renderer helper tests**

In `sidebar-view.test.ts`, add tests for flattening visible tree rows:

- folder row
- nested file row
- active file row
- collapsed folder hiding children

- [ ] **Step 4: Render tree rows**

In `main.ts`, replace workdir flat list rendering with tree rendering when `workdirTreeEntries` exists.

First version can keep expanded state in renderer memory:

```ts
const expandedWorkdirFolders = new Set<string>()
```

Default top-level folders open; nested folders collapsed unless toggled.

- [ ] **Step 5: Add create folder button placeholder**

Expose UI affordance only. Wire to IPC in the next task.

- [ ] **Step 6: Run tests and build**

```bash
npm test -- src/main/workdir.test.ts src/renderer/sidebar-view.test.ts
npm run build
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/main/index.ts src/preload/index.ts src/renderer/sidebar-view.ts src/renderer/sidebar-view.test.ts src/renderer/main.ts src/renderer/themes/base.css
git commit -m "feat: render workdir as file tree"
```

### Task 8: Add Create Folder IPC

**Files:**
- Modify: `src/main/workdir.ts`
- Modify: `src/main/index.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/main.ts`
- Test: `src/main/workdir.test.ts`

- [ ] **Step 1: Add failing path resolver test**

Add:

```ts
resolveNewWorkdirFolderPath(root, exists)
```

Expected default: `New Folder`, then `New Folder 2`.

- [ ] **Step 2: Implement resolver and IPC**

Main process:

- `create-workdir-folder`
- Create folder under active workdir root for first pass.
- Refresh sidebar state.

Preload:

```ts
createWorkdirFolder: () => Promise<SidebarState | null>
```

Renderer:

- Add button beside existing workdir create file button.
- On click, call `api.createWorkdirFolder()`.

- [ ] **Step 3: Run tests and build**

```bash
npm test -- src/main/workdir.test.ts
npm run build
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/main/workdir.ts src/main/workdir.test.ts src/main/index.ts src/preload/index.ts src/renderer/main.ts
git commit -m "feat: create folders in workdir"
```

## Chunk 5: Naming Cleanup For Phase C Surfaces

### Task 9: Clean User-Visible ColaMD Names

**Files:**
- Modify: `README.md`
- Modify: `README_CN.md`
- Modify: `src/renderer/settings-dialog.ts`
- Modify: `src/renderer/index.html`
- Modify: `mcp/colamd-mcp-server.mjs` only if preserving compatibility wording requires it
- Test: existing relevant tests

- [ ] **Step 1: Search visible names**

Run:

```bash
rg -n "ColaMD|colamd|Cola" README.md README_CN.md src mcp docs | sed -n '1,200p'
```

- [ ] **Step 2: Classify**

Keep:

- Legal/source attribution in `NOTICE.md`.
- Legacy server id if needed for compatibility.

Change:

- User-facing app copy.
- Settings headings.
- Help text.

- [ ] **Step 3: Patch only Phase C-visible surfaces**

Do not rename files or IPC channels in this task.

- [ ] **Step 4: Run tests and build**

```bash
npm test
npm run build
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add README.md README_CN.md src/renderer/settings-dialog.ts src/renderer/index.html mcp/colamd-mcp-server.mjs
git commit -m "docs: align visible naming with lyramd"
```

## Chunk 6: Visual QA And Gemini Review

### Task 10: Run Local App And Capture Review Notes

**Files:**
- Create: `.codex/2026-05-06-lyramd-phase-c-qa.md`

- [ ] **Step 1: Run automated checks**

```bash
npm test
npm run build
git diff --check
```

Expected: PASS.

- [ ] **Step 2: Start dev app**

```bash
npm run dev
```

Expected: Electron opens without runtime errors.

- [ ] **Step 3: Human/Gemini visual review**

In an interactive terminal, run Gemini and provide screenshots or a concise description:

```bash
gemini
```

Prompt:

```text
请审查 LyraMD Phase C 当前界面：左侧文件树、中间编辑器、右侧/底部 Agent 面板、背景设置。只给界面和审美建议，不要新增功能。输出必须包含：1) 通过项；2) 需要调整的视觉问题；3) 不建议改动的地方。
```

- [ ] **Step 4: Record QA**

Create `.codex/2026-05-06-lyramd-phase-c-qa.md`:

```markdown
# LyraMD Phase C QA

## Automated
- npm test:
- npm run build:
- git diff --check:

## Manual
- Wide window:
- Narrow window:
- Agent/Outline switch:
- Background editor scope:
- Background window scope:
- Workdir tree:

## Gemini Review
- Kept:
- Adjusted:
- Rejected:
```

- [ ] **Step 5: Commit QA note**

```bash
git add .codex/2026-05-06-lyramd-phase-c-qa.md
git commit -m "docs: record phase c visual qa"
```

## Final Verification

Run:

```bash
npm test
npm run build
git diff --check
```

Expected:

- All tests pass.
- Build completes.
- Diff check is clean.
- Existing hot update/editor/save/sidebar flows still work.

## Handoff

After this plan is implemented, the next separate plan should cover real Agent CLI terminal execution:

- Add `xterm.js`.
- Add Electron-compatible PTY backend, likely `node-pty`.
- Spawn configured CLI command.
- Preserve terminal session across right/bottom layout changes.
- Inject selected text into the active terminal session.

Do not start that work inside this Phase C skeleton plan.
