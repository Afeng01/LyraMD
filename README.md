# LyraMD

**Lyra's agent-native Markdown editor.**

LyraMD is a personal fork of [ColaMD](https://github.com/marswaveai/ColaMD), adapted for a quieter workflow around AI agents, Markdown files, recent documents, and a lightweight working directory sidebar.

[中文](README_CN.md)

![LyraMD screenshot](docs/assets/lyramd-screenshot.png)

## Features

- **Live file refresh**: when an AI agent edits the current Markdown file, LyraMD reloads it automatically.
- **Agent change summary** for external edits, with compact preview, burst coalescing, and one-click rollback.
- **WYSIWYG Markdown editing** powered by Milkdown.
- **Lightweight sidebar** with current file, recent files, and a persistent working directory.
- **Recent file management** with a compact delete mode.
- **Recursive Markdown workdir list** using relative paths.
- **Themes and export**: built-in themes, custom CSS import, PDF export, and HTML export.

## Why This Fork

ColaMD focuses on an extremely minimal single-file editor. LyraMD keeps that agent-native core, but adds just enough navigation for a personal writing/workbench flow:

- switch among a small set of Markdown files in one window
- keep a long-running work directory pinned
- see recent files without turning the app into a full file manager

## Development

```bash
npm install
npm run dev
```

## Install on macOS

Download the latest `.dmg` from [Releases](https://github.com/Afeng01/LyraMD/releases), open it, and drag `LyraMD.app` into `/Applications`.

LyraMD is currently distributed without Apple notarization because notarization requires a paid Apple Developer account. If macOS blocks the first launch:

1. Open **System Settings > Privacy & Security**.
2. Find the blocked `LyraMD` message.
3. Click **Open Anyway**.
4. Confirm once more when macOS asks.

You can also right-click `LyraMD.app` and choose **Open** for the first launch.

Code signing and notarization are different. Signing identifies who produced an app; notarization is Apple's security scan and approval step. For public distribution outside the App Store, a signed and notarized build gives the smoothest user experience. This project currently ships without notarization.

## Install on Windows

Windows support is currently a preview path. The v1.2.0 release includes a test Windows installer, but it still needs real-device smoke testing before it should be treated as a stable Windows release.

Download `LyraMD-Setup-*-x64.exe` from [Releases](https://github.com/Afeng01/LyraMD/releases), run the installer, and follow the NSIS setup flow. Please verify launch, opening `.md` files, save / save as, and external file refresh on Windows before relying on it for regular work.

Windows preview builds are currently distributed without code signing. On first launch, Microsoft Defender SmartScreen may show an "unknown publisher" warning. Only install builds downloaded from the official GitHub Releases page, and use **More info > Run anyway** only if you trust this unsigned preview build.

For a public Windows release, code signing is recommended so users can install LyraMD without the unsigned publisher warning.

## Build

```bash
npm run dist:mac
npm run dist:win
npm run dist:linux
```

## Tech Stack

- Electron
- Milkdown
- TypeScript
- electron-vite
- electron-builder

## Attribution

LyraMD is based on [ColaMD](https://github.com/marswaveai/ColaMD), released under the MIT License by marswave.ai. See [NOTICE.md](NOTICE.md) and [LICENSE](LICENSE).

## License

MIT.
