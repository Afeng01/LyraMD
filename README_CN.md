# LyraMD

**Lyra 的 Agent Native Markdown 编辑器。**

面向人类和 AI agent 的实时 Markdown 协作，保留文件热更新核心，同时加入选中文本 AI 辅助、轻量侧边栏、最近文件和固定工作目录。

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![GitHub release](https://img.shields.io/github/v/release/Afeng01/LyraMD?label=release)](https://github.com/Afeng01/LyraMD/releases)
[![Windows preview](https://img.shields.io/badge/Windows-preview-blue)](https://github.com/Afeng01/LyraMD/releases)

[下载](#下载) | [为什么 fork](#为什么-fork) | [功能](#功能) | [开发](#开发) | [English](README.md)

![LyraMD 截图](docs/assets/lyramd-screenshot.png)

## 功能

- **文件实时刷新**：AI agent 修改当前 Markdown 文件时，LyraMD 自动刷新内容。
- **Agent 变更摘要**：外部修改到达时显示新增、删除、改写行数和简短预览，连续更新会合并，并可一键撤回。
- **本地安全网**：草稿自动保存、文稿级本地 revision 快照、插图前 checkpoint、可见的最近备份入口，以及崩溃后恢复为新草稿。
- **AI 精灵命令面板**：针对选中文本提供可编辑 prompt 模板、模型状态、预览、替换、插入和复制结果。
- **OpenAI-compatible provider 设置**：支持 OpenAI 官方 API Key 或自定义网关，并提供内置连接检测。
- **Codex MCP 集成**：设置页可检测 Codex CLI，并安装 LyraMD MCP bridge，让 Codex 读取和写入当前文档。
- **反馈与问题上报**：设置页可填写问题或建议，打开预填好的 GitHub Issue，不在本地保存 GitHub token。
- **所见即所得 Markdown 编辑**：基于 Milkdown。
- **Markdown 大纲、图片与标签**：大纲识别 H1-H6 标题，渲染本地与相对路径图片，并识别 YAML tags、Obsidian `#tag` / `#nested/tag` 与 `[[wikilink]]`。
- **轻量侧边栏**：工作区与置顶区域固定，草稿 / 最近 / 工作目录 tab 更清晰，长标题可 hover 查看完整内容，文稿列表独立滚动。
- **最近文件管理**：最多保留 10 条，可进入清除模式逐条移除。
- **工作目录**：固定一个目录，递归展示其中的 Markdown 文件。
- **写作工具**：包含确定性的中英排版清理、文档统计、搜索、大纲、本地图片和 Markdown token 样式。
- **主题、字体与导出**：内置主题带各自默认编辑字体，也支持自定义编辑字体、自定义 CSS、PDF 导出和 HTML 导出。

## 为什么 fork

LyraMD 保留原始的 Agent Native 单文件编辑核心，并在这个基础上补了一点个人工作台能力：

- 在同一个窗口里切换一组 Markdown 文件
- 固定长期工作目录
- 保留最近文件，但不把应用变成完整文件管理器

## 开发

```bash
npm install
npm run dev
```

## 下载

从 [Releases](https://github.com/Afeng01/LyraMD/releases) 下载最新构建。

| 平台 | 格式 | 状态 |
| --- | --- | --- |
| macOS Apple Silicon | `LyraMD-1.3.7-arm64.dmg` / `.zip` | 稳定发布目标 |
| Windows x64 | `LyraMD-Setup-1.3.7-x64.exe` | Preview / 需要真实设备 smoke test |

## macOS 安装与打开

从 [Releases](https://github.com/Afeng01/LyraMD/releases) 下载最新的 `.dmg`，打开后把 `LyraMD.app` 拖到 `/Applications`。

LyraMD 目前没有做 Apple 公证，因为公证需要付费 Apple Developer 账号。如果 macOS 第一次打开时拦截：

1. 打开 **系统设置 > 隐私与安全性**。
2. 找到被拦截的 `LyraMD` 提示。
3. 点击 **仍要打开**。
4. macOS 再次确认时继续允许。

也可以第一次右键点击 `LyraMD.app`，选择 **打开**。

签名和公证不是一回事。签名用于标识 App 的发布者；公证是 Apple 对 App 做安全扫描并盖章。面向公开分发时，签名并公证体验最好。当前项目暂时不做公证。

## Windows 安装与打开

Windows 支持目前是预览路径。v1.3.7 release 附带 Windows x64 安装器，但公开稳定发布前仍需要真实 Windows 设备 smoke test。

从 [Releases](https://github.com/Afeng01/LyraMD/releases) 下载 `LyraMD-Setup-*-x64.exe`，运行安装器，并按 NSIS 安装流程完成安装。正式依赖前请先在 Windows 上验证启动、打开 `.md`、保存 / 另存为、外部文件刷新这几条主链路。

Windows preview 版本目前暂不做代码签名。第一次启动时，Microsoft Defender SmartScreen 可能会提示“未知发布者”。只安装官方 GitHub Releases 页面下载的构建；如果你信任这个 unsigned preview build，可以选择 **更多信息 > 仍要运行**。

面向公开 Windows 发版时，建议补 Windows code signing，避免用户遇到 unsigned publisher 警告。

## 更新

LyraMD 的已打包版本会从 GitHub Releases 检查更新，软件内也提供 **帮助 > 检查更新…**。未签名的 macOS 构建使用手动更新流程：LyraMD 会打开最新版 DMG 或 Release 页面，然后由用户手动覆盖安装。Windows 继续使用基于 `latest.yml` 的 electron-updater 元数据流程。

已经安装了不含 updater 的旧构建的用户，需要先手动安装一次带 updater 的版本；之后的新版本才能在 LyraMD 内被发现。macOS 完全自动替换安装仍需要正确签名的 app。

## 构建

```bash
npm run dist:mac
npm run dist:win
npm run dist:linux
```

发布 tag 前先执行 [docs/release-checklist.md](docs/release-checklist.md) 中的发版门禁，尤其是合并工作树后的冷启动 app smoke check。

## 技术栈

- Electron
- Milkdown
- TypeScript
- electron-vite
- electron-builder

## 来源与归属

LyraMD 基于 [ColaMD](https://github.com/marswaveai/ColaMD)，原项目由 marswave.ai 以 MIT License 发布。详见 [NOTICE.md](NOTICE.md) 和 [LICENSE](LICENSE)。

## 开源协议

MIT。
