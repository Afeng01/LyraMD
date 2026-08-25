# LyraMD VS Code Extension (MVP)

> Open the current Markdown file in [LyraMD](https://github.com/Afeng01/LyraMD) — the agent-native Markdown editor with live file watching.

## What it does

Adds one command: **`LyraMD: Open Current Markdown in LyraMD`**.

LyraMD watches files **on disk**, not editor buffers. If the current document has unsaved
changes, this extension saves it first (`document.save()`), then launches LyraMD with the
file path, so LyraMD always shows up-to-date content.

## Install

1. Package the extension (from this directory):
   ```sh
   npm run package
   ```
   This produces `lyramd-open-in-lyramd-0.1.0.vsix` (no dependencies added — `vsce` runs via `npx`).

   Alternatively, build it with the VS Code CLI:
   ```sh
   npx @vscode/vsce package
   ```

2. In VS Code, open the **Extensions** view (`⇧⌘X` / `Ctrl+Shift+X`).

3. Click the **`...`** (More Actions) menu in the top-right of the Extensions view →
   **Install from VSIX...** → select the `.vsix` file.

4. The command is ready immediately. No reload needed for the command itself; reload the
   window if the right-click menu entry does not appear.

## Usage

- Right-click inside a Markdown editor → **LyraMD: Open Current Markdown in LyraMD**.
- Or open the Command Palette (`⇧⌘P` / `Ctrl+Shift+P`) with a Markdown editor active
  (the command only appears when the active editor language is `markdown`).

If the document has unsaved changes, VS Code prompts to save (for new/untitled documents)
or saves silently — only then is the file handed to LyraMD.

## Configuration

| Setting                    | Description |
|----------------------------|-------------|
| `lyramd.executablePath`    | Optional. Path or name of the LyraMD executable. When empty, the platform default is used. |

Platform defaults:

| Platform | Launch command |
|----------|----------------|
| macOS    | `open -a LyraMD <file>` (LyraMD.app resolved via LaunchServices) |
| Linux    | `lyramd <file>` (`lyramd` must be on `PATH`) |
| Windows  | `LyraMD.exe <file>` (`LyraMD.exe` must be on `PATH`) |

Set `lyramd.executablePath` when LyraMD is not on `PATH`, e.g.
`C:\Program Files\LyraMD\LyraMD.exe` on Windows or `/opt/lyramd/lyramd` on Linux.
If launching fails, VS Code shows the underlying error (e.g. app not found).

## Limitations (MVP)

- **Unsaved content must be written to disk first.** The extension auto-saves before
  opening — that is by design, since LyraMD syncs file changes, not editor buffers.
  If the save fails (e.g. dialog cancelled), the file is not opened.
- **No two-way live sync.** This is one-way: VS Code → LyraMD. Editing the same file in
  LyraMD while it is open in VS Code may trigger VS Code's "file changed on disk" prompt.
- **Files on disk only.** Documents that are not `file`-scheme (untitled, git, etc.)
  are rejected with a clear message — save them first.
- **Markdown editors only.** The command is only available when the active editor
  language is `markdown`.

## Development

Pure JavaScript, no build step, no dependencies. Check syntax with:

```sh
npm run check
```

## Packaging / Publishing

To publish to the VS Code Marketplace later:

1. Register a publisher at <https://marketplace.visualstudio.com/manage> and set the
   `publisher` field in `package.json` to it (currently `lyramd`).
2. `npx @vscode/vsce login <publisher>`
3. `npm run package` — then upload the `.vsix` in the Marketplace management page,
   or `npx @vscode/vsce publish` to publish directly.
