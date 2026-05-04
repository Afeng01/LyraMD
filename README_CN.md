# LyraMD

**Lyra 的 Agent Native Markdown 编辑器。**

LyraMD 基于 [ColaMD](https://github.com/marswaveai/ColaMD) 修改，是一个面向个人 AI 协作工作流的 Markdown 编辑器。它保留 ColaMD 的实时文件刷新和所见即所得编辑能力，同时加入轻量侧边栏、最近文件和固定工作目录。

[English](README.md)

![LyraMD 截图](docs/assets/lyramd-screenshot.png)

## 功能

- **文件实时刷新**：AI agent 修改当前 Markdown 文件时，LyraMD 自动刷新内容。
- **Agent 变更摘要**：外部修改到达时显示新增、删除、改写行数和简短预览。
- **所见即所得 Markdown 编辑**：基于 Milkdown。
- **轻量侧边栏**：当前文件、最近文件、工作目录导航。
- **最近文件管理**：最多保留 10 条，可进入清除模式逐条移除。
- **工作目录**：固定一个目录，递归展示其中的 Markdown 文件。
- **主题与导出**：内置主题、自定义 CSS、PDF 导出、HTML 导出。

## 为什么 fork

ColaMD 的核心是极简的 Agent Native Markdown 编辑器。LyraMD 在这个基础上补了一点个人工作台能力：

- 在同一个窗口里切换一组 Markdown 文件
- 固定长期工作目录
- 保留最近文件，但不把应用变成完整文件管理器

## 开发

```bash
npm install
npm run dev
```

## macOS 安装与打开

从 [Releases](https://github.com/Afeng01/LyraMD/releases) 下载最新的 `.dmg`，打开后把 `LyraMD.app` 拖到 `/Applications`。

LyraMD 目前没有做 Apple 公证，因为公证需要付费 Apple Developer 账号。如果 macOS 第一次打开时拦截：

1. 打开 **系统设置 > 隐私与安全性**。
2. 找到被拦截的 `LyraMD` 提示。
3. 点击 **仍要打开**。
4. macOS 再次确认时继续允许。

也可以第一次右键点击 `LyraMD.app`，选择 **打开**。

签名和公证不是一回事。签名用于标识 App 的发布者；公证是 Apple 对 App 做安全扫描并盖章。面向公开分发时，签名并公证体验最好。当前项目暂时不做公证。

## 构建

```bash
npm run dist:mac
npm run dist:win
npm run dist:linux
```

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
