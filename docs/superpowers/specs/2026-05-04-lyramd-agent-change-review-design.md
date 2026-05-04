# LyraMD Agent Change Review Design

## Context

VMark's useful lesson for LyraMD is not its full workstation surface. The part worth borrowing is reviewability: when an AI agent changes a Markdown document, the human should immediately know that something changed and have a lightweight way to inspect the shape of the edit.

LyraMD keeps the smaller product stance. It should remain a focused Markdown editor with live file refresh, not a full Markdown IDE.

## Scope

This iteration adds a compact external-change summary for the currently open document:

- Main process file watching computes a line-level summary before applying a true external update.
- The summary reports added, removed, and changed line counts.
- The renderer shows a small dismissible panel with a short preview.
- Internal autosaves and local echo writes stay ignored by the existing watched-content queue.

## Non-goals

- No full diff viewer.
- No MCP server.
- No terminal, status bar, toolbar, or workspace expansion.
- No persistent version history in this slice.

## Design

The main process owns change detection because it already knows whether a watcher event is an ignored internal save or a true external update. Once `reconcileWatchedContent` decides an update should propagate, the new `summarizeAgentChange` helper compares the previous synced content with the incoming content and emits `agent-change-summary` before the existing `file-changed` event.

The renderer keeps the summary as transient UI state. File opens and new documents clear it. Users can expand the panel for a small preview or dismiss it. This preserves the core live-refresh workflow while making AI edits more auditable.

## Verification

- Unit test the summary helper for changed, added, unchanged, and truncated preview cases.
- Run the existing file-sync tests to protect the local echo behavior.
- Run the full test suite and production build.
