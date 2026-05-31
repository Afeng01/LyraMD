# LyraMD history recovery checkpoint

Date: 2026-05-31

## Why this exists

This repository previously had local records under the old folder/project name
`ColaMD`. The current product and release name is `LyraMD`.

Future agents must use `LyraMD` for product, release, README, changelog, and
user-facing narration. The old name may appear only when quoting a historical
session title, legacy path, upstream attribution, or compatibility id.

## Where the previous conversations are

Codex session index:

- `/Users/cherry_xiao/.codex/session_index.jsonl`

Useful original Codex session files found during recovery. Some titles contain
the old local name; treat those titles as historical search handles, not current
product names:

- `优化 ColaMD 编辑器`: `/Users/cherry_xiao/.codex/sessions/2026/05/04/rollout-2026-05-04T16-59-36-019df236-e321-7690-8d6b-7bb9278aad68.jsonl`
- `梳理 LyraMD 1.x 与 2.x`: `/Users/cherry_xiao/.codex/sessions/2026/05/23/rollout-2026-05-23T17-43-30-019e5437-e66b-70a2-9e89-6cb5e6c2de6e.jsonl`
- `修复 LyraMD 顶部按钮失效`: `/Users/cherry_xiao/.codex/sessions/2026/05/31/rollout-2026-05-31T16-15-43-019e7d1a-69ea-7993-9c0c-47c5af4503cd.jsonl`
- Earlier related threads in the same index include `Review LyraMD v1.1.2`, `审查 LyraMD 验收改动`, `审查 ColaMD 修复回归`, and `调试 LyraMD 核心问题`.

Readable memory/index entry:

- `/Users/cherry_xiao/.codex/memories/MEMORY.md`
- Search terms: `ColaMD`, `LyraMD`, `interaction-polish`, `优化LyraMD`, `src-next`.

Chronicle summaries that reconstructed the May 31 interaction-polish work:

- `/Users/cherry_xiao/.codex/memories/extensions/chronicle/resources/2026-05-31T00-37-00-ZdgC-10min-memory-summary.md`
- `/Users/cherry_xiao/.codex/memories/extensions/chronicle/resources/2026-05-31T00-48-00-fgVx-10min-memory-summary.md`
- `/Users/cherry_xiao/.codex/memories/extensions/chronicle/resources/2026-05-31T00-58-00-qtTG-10min-memory-summary.md`
- `/Users/cherry_xiao/.codex/memories/extensions/chronicle/resources/2026-05-31T01-08-00-qqJf-10min-memory-summary.md`
- `/Users/cherry_xiao/.codex/memories/extensions/chronicle/resources/2026-05-31T01-41-00-fcNM-10min-memory-summary.md`
- `/Users/cherry_xiao/.codex/memories/extensions/chronicle/resources/2026-05-31T02-33-00-RcdD-10min-memory-summary.md`
- `/Users/cherry_xiao/.codex/memories/extensions/chronicle/resources/2026-05-31T05-43-00-QWef-10min-memory-summary.md`
- `/Users/cherry_xiao/.codex/memories/extensions/chronicle/resources/2026-05-31T06-27-00-dLZW-10min-memory-summary.md`

## May 31 interaction-polish context

The recovered work used an isolated worktree because the main checkout did not
have a project-local `.worktrees/` convention.

- Worktree: `/Users/cherry_xiao/.config/superpowers/worktrees/ColaMD/interaction-polish`
- Branch: `interaction-polish`
- Commit: `e7603dc5`
- Commit title: `Polish interaction menus and AI palette`
- Verification seen in recovered records: `npm run test`, `45 files / 334 tests`, `npm run build`, and clean post-commit worktree.

The main product decisions recovered from the records:

- LyraMD 1.x stays on the existing Electron + Milkdown `src/` implementation.
- VMark is an interaction reference only, not a migration mandate.
- `Cmd/Ctrl+J` is the preferred AI 精灵 entry.
- AI assistance should behave like a selected-text floating command palette with preview/apply actions, not a destructive direct rewrite.
- `清理中英排版` / CJK formatting remains a deterministic editor tool, separate from the AI default actions.
- Chinese native menus, lighter sidebar tabs, full-title hover, and selection-safe AI behavior were the main interaction polish direction.

## Project docs created from that context

These two files were already present as untracked project docs when this
checkpoint was written:

- `docs/superpowers/specs/2026-05-31-lyramd-interaction-polish-design.md`
- `docs/superpowers/plans/2026-05-31-lyramd-interaction-polish.md`

They capture the design and implementation plan for the interaction-polish work.
This checkpoint adds the missing recovery map: which old conversations and
memory summaries explain where those decisions came from.

## How to resume later

Use these commands from this repo or from `/Users/cherry_xiao`:

```sh
rg -n "ColaMD|LyraMD|interaction-polish|优化LyraMD" /Users/cherry_xiao/.codex/session_index.jsonl
rg -n "ColaMD|LyraMD|interaction-polish|优化LyraMD" /Users/cherry_xiao/.codex/memories/MEMORY.md
rg -l "ColaMD|LyraMD|interaction-polish|优化LyraMD" /Users/cherry_xiao/.codex/sessions /Users/cherry_xiao/.codex/archived_sessions 2>/dev/null
```

When implementing new work, check the current repo state first. This checkout is
`/Users/cherry_xiao/Developer/PROJECT/LyraMD`; do not rename current release
work back to the old local project name.
