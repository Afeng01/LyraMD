# First Phase Markdown And Sidebar Work

Date: 2026-05-06

## Intent

- Expand outline recognition from H1-H2 to all Markdown heading levels H1-H6.
- Keep the sidebar's workspace and pinned regions fixed while only the draft/recent/workdir list scrolls.
- Cap the pinned list at five visible rows before it scrolls.
- Improve rendered image handling for local and relative Markdown image paths without changing saved Markdown text.

## Done

- Added TDD coverage for outline levels, sidebar scroll structure, pinned list cap, and image path resolution.
- Added `markdown-media` image path resolution for HTTP/data/blob/file passthrough, relative paths, Unix absolute paths, and Windows absolute paths.
- Updated CSP to allow rendered local `file:` images.
- Researched VMark's public MCP implementation and mirrored its read -> reason -> write shape for a Codex-only integration.
- Added a local authenticated MCP bridge, a `colamd` sidecar script, and a Settings entry that can install/remove the Codex MCP server.

## Deferred

- YAML `tags:`, inline `#tag`, Obsidian nested tags, and `[[wikilink]]` should be handled in the next Markdown extension phase because they require a product-level syntax and schema decision.
- Right-side link browser and richer Markdown tag/wikilink semantics remain second-stage work.

## Verification

- `npm test`
- `npm run build`
- `node --check mcp/colamd-mcp-server.mjs`
- `git diff --check`
