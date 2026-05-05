# 2026-05-04 — ColaMD Workbench Stabilization Design

## Status

Drafted from product discussion. Ready for implementation planning after review.

## Product Direction

ColaMD should not become an Obsidian replacement or a full file manager. Its job is to be an Agent-native Markdown workbench: a small, reliable place where Cherry and agents can co-edit Markdown files, recover unfinished work, and inspect the current document quickly.

The stabilizing principle for this release is:

```text
Left side = what am I working on?
Editor = the document itself.
Right side = what is inside this document?
```

The larger Agent collaboration layer, including change highlights and Agent-aware review flows, stays out of this pass.

## Scope

This pass includes:

1. Draft save semantics.
2. Draft title to draft filename sync.
3. Workspace history display.
4. Left sidebar structure: workspaces, pinned, drafts/recent/workdir.
5. Right outline panel.
6. Minimal copy updates for onboarding and save prompts.

This pass does not include:

1. Agent diff view.
2. Conflict resolution between local edits and external Agent writes.
3. Full workspace search.
4. Obsidian-style file tree, tags, backlinks, or knowledge-base features.

## Draft Semantics

Drafts are unfinished, unarchived documents. A draft is not a user-facing final file location; it is a safety net.

### Rules

- A blank document becomes a draft only after the first real edit.
- Drafts auto-save continuously to the configured draft directory.
- Auto-save means "do not lose my work".
- Manual save means "move this work to a formal location".
- Pressing `Cmd/Ctrl+S` while editing a draft opens a save dialog.
- After the user chooses a path, the document becomes a formal file and is removed from Drafts.
- The formal file appears in Recent.
- If saved inside the active workspace, it also appears through that workspace.
- `Cmd/Ctrl+Shift+S` on a draft follows the same migration rule: save formal file, remove draft source.

### Copy

Onboarding should say:

```text
未命名内容会自动保存为草稿。按保存时，会选择正式位置并移出草稿。
```

Draft save dialog should say:

```text
保存后会成为正式文件，并从草稿中移出。草稿内容已自动保存。
```

## Draft Title And Filename Sync

Draft identity should stay stable, but the visible draft file should not keep an opaque generated filename after the user manually names it.

### Rules

- Automatically derived titles do not rename the draft file.
- Manual draft title edits rename the draft file in the draft directory.
- Internal references keep using `draftId`, not the path as the durable identity.
- If the title maps to an existing filename, append a short suffix.
- Pinned state follows the draft after rename.
- When the draft is saved as a formal file, the save dialog defaults to the manual title.

Example:

```text
draft-20260504-102030-1.md
manual title: 数字一的对话
renamed file: 数字一的对话.md
```

## Left Sidebar

The left sidebar answers: what am I working on?

### Structure

```text
Workspaces
Pinned
[ Drafts ] [ Recent ] [ Workdir ]
List content
```

### Workspaces

- When no workspace has been selected, show `选择目录`.
- The workspace area has its own `工作区` header and a small `+` action on the right.
- After selection, the workspace list shows folder names, not `工作目录`.
- Previously opened workspaces are retained.
- Workspace history keeps first-added order; clicking a workspace switches the active workspace without moving it.
- Workspace rows can be dragged to reorder the saved workspace history.
- If there are one to three workspaces, display them compactly.
- If there are more than three, keep a fixed-height scrollable list.
- The active workspace is highlighted.
- `+` adds or chooses another workspace.
- Workspaces themselves are not pinned; they already live in the workspace area.
- The active workspace watches external Markdown file additions/deletions and refreshes the list automatically.

### Pinned

Pinned is a persistent area below Workspaces.
It is collapsible, because pinned items are shortcuts and should not permanently compete with Drafts/Recent for vertical space.

Allowed pinned targets:

- Drafts.
- Formal Markdown files known to the app.

Not allowed:

- Directories.
- Untouched blank documents.
- Files the app does not know about yet.

Known formal files include:

- Files in Recent.
- Files in the active workspace list.
- Files explicitly opened by the user.

Pinned items remain visible in their original list as well. Pinning creates a shortcut, not a move.
Pin/unpin and row removal actions live inside each document row as icon buttons, not as separate text buttons beside the row.
Those row actions are revealed on hover or keyboard focus so the list stays quiet while scanning.
Drafts and Recent do not need a separate "clear/manage" button; removal is available directly from the row.

If a pinned draft is saved as a formal file, the pinned entry migrates to the new file path.

### Drafts / Recent / Workdir Tabs

- The default tab is Drafts.
- If Drafts is empty, the UI may show an empty state and a gentle affordance to switch to Recent, but it should not silently change the user-selected tab.
- Drafts contains unarchived drafts only.
- Recent contains formal files only and keeps up to 20 entries.
- Workdir contains Markdown files from the currently selected workspace, using the current workspace watcher to stay fresh.
- Drafts and Recent stay separate because they represent different document states.
- Removing a Workdir row is destructive to the real workspace file, so it asks for confirmation and moves the file to the system Trash.
- After a Workdir file is removed, Workdir refreshes and stale Recent, Pinned, and title-override references to that file are cleared.

## Right Outline Panel

The right panel answers: what is inside the current document?

### Behavior

- Outline lives on the right, not in the left sidebar.
- It opens through a titlebar icon and a keyboard shortcut.
- Suggested shortcut: `Cmd/Ctrl+Shift+O`.
- It lists heading levels needed for navigation, starting with H1 and H2.
- Clicking an item scrolls the editor to that heading.
- It is hidden by default and should not compete with the editor on narrow windows.

### Future Compatibility

The right panel can later host Agent collaboration affordances:

- Headings changed by Agent.
- Recent external edits grouped by section.
- Lightweight review state.

Those belong to the later Agent collaboration pass, not this stabilization release.

## C Phase: Agent Collaboration Layer

The later C phase should move ColaMD from "Markdown editor with a sidebar" toward "Agent collaboration editing desk".

Candidate capabilities:

- Highlight sections changed by external Agent writes.
- Avoid overwriting local human edits while an Agent update arrives.
- Show whether the current document was recently touched by an Agent.
- Let the outline indicate changed headings.
- Make draft, recent, pinned, and workspace lists reflect active human-Agent work instead of generic file management.

The C phase should start only after this release stabilizes document identity, sidebar structure, and outline navigation.

## Acceptance Criteria

- A draft edited by the user auto-saves without requiring manual action.
- `Cmd/Ctrl+S` on a draft prompts for a formal location and removes the draft after success.
- Onboarding and save copy explain the difference between auto-save and formal save.
- Manual draft title changes rename the underlying draft file.
- Pinned draft entries survive draft rename.
- Pinned draft entries migrate when the draft becomes a formal file.
- The left sidebar shows Workspaces, Pinned, and Drafts/Recent/Workdir in that order.
- The workspace section is a complete area with `工作区`, a right-side `+`, and selected folder rows.
- Clicking a workspace does not reorder it; drag the row handle to change workspace order.
- Pin controls are icon buttons inside each document row.
- Row removal controls sit next to pin controls; no separate clear/manage button is shown.
- Removing a Workdir row confirms and moves the real Markdown file to the system Trash, then updates the sidebar.
- Row action icons appear on hover/focus, not permanently.
- The Pinned section can be collapsed.
- Drafts is the default selected tab.
- Workspace labels show selected folder names or `选择目录`; they do not show `工作目录`.
- More than three workspaces become scrollable.
- Active workspace contents update after external Markdown file create/delete events.
- The outline panel opens on the right and navigates H1/H2 headings.
