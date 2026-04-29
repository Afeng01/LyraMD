# 2026-04-28 — Auto-Save, Ctrl+N 行为, Zoom 固定 Titlebar, 侧边栏图标

## 摘要

四个小功能组合，提升 LyraMD 的编辑丝滑度和视觉一致性。

---

## 1. 自动保存（3 秒去抖）

### 行为

- 用户停止编辑 **3 秒**后，自动调用 `saveFile` 写盘
- **仅用户编辑触发**（键盘输入、粘贴等 ProseMirror 用户操作），Agent 写入（`setMarkdown` / `file-changed`）不触发自动保存
- 文件从未保存过（无 filePath）时，自动保存静默跳过
- Ctrl+N 时，立即 flush 当前自动保存定时器，确保当前文件写盘后才创建新文档

### 实现方式

- 在 `src/renderer/main.ts` 中监听 ProseMirror `update` 事件（用户输入路径），使用 `clearTimeout`/`setTimeout` 实现 3 秒去抖
- `setMarkdown()` 被调用时（Agent 写入），清除自动保存定时器，不写入
- 在 ProseMirror 侧增加一个导出：`onUserEdit(callback)`，每当用户发起编辑时触发回调

### 与现有保存的关系

- 菜单 `File → Save`（Cmd+S）依然有效，立即保存 + 清除自动保存定时器
- 自动保存复用同一 IPC 通道 `save-file`，不新增通道

---

## 2. Ctrl+N 在当前窗口创建新文档

### 行为

- **修改前**：`CmdOrCtrl+N` → `createWindow()` → 新 BrowserWindow
- **修改后**：`CmdOrCtrl+N` → flush 自动保存 → 清空编辑器 → 窗口标题重置 → 当前文件进入最近文件列表

### 实现方式

- 修改 `src/main/index.ts` 中 File > New 菜单 click 回调：改为发送 `menu-new-file-in-window` IPC 事件给当前聚焦窗口
- 渲染进程收到后：flush 自动保存、调用 `setMarkdown('')` 清空编辑器、更新窗口状态（filePath = null）
- 主进程已有 `findEmptyWindow` 等工具，不受影响

### 边界

- 用户未打开任何文件时按 Ctrl+N：无操作（已经是空白文档），不创建新窗口
- 多窗口场景：Ctrl+N 在当前活动窗口生效，不影响其他窗口

---

## 3. Zoom 固定 Titlebar

### 问题

Electron 的 `zoomIn`/`zoomOut`/`resetZoom` 角色缩放整个 `webContents`，导致 `#titlebar` 内的侧边栏按钮和呼吸灯跟着变大变小。

### 方案

用自定义 zoom 替掉 Electron 内置 role：

- 移除菜单中 `role: 'zoomIn'`、`role: 'zoomOut'`、`role: 'resetZoom'`
- 注册全局快捷键 `CmdOrCtrl+=`、`CmdOrCtrl+-`、`CmdOrCtrl+0`
- 快捷键回调：操作一个 `zoomLevel` 状态（0 为基准，步进 0.5，范围 [-3, 3]）
- 通过 CSS 自定义属性 `--editor-zoom` 应用到 `#editor-shell`，使用 `font-size: calc(16px * var(--editor-zoom))` 或 `transform: scale()`
- `#titlebar` 不设置 `--editor-zoom`，保持 1.0

### 影响范围

- `src/main/index.ts`：菜单修改 + 快捷键注册
- `src/renderer/themes/base.css`：编辑器区域添加 zoom 变量
- 呼吸灯动画 `@keyframes agent-breathe` 中的 `transform: scale()` 不受影响（独立动画）

---

## 4. 侧边栏按钮图标替换

### 行为

把三条横线汉堡图标替换为 Mac Finder 侧边栏风格的简洁折线图标（两条短竖线 + 折线，表达 "面板展开/收起"）。

### 实现方式

- 移除 `#sidebar-toggle` 内的三个 `<span>` 元素
- 替换为内联 SVG（28x28），绘制简洁折线图标
- 颜色继承 `currentColor`，hover 效果不变
- 图标语义：侧边栏关闭时显示收起方向，打开时显示展开方向（可选，后续迭代）

### CSS 调整

- 移除 `#sidebar-toggle span` 相关样式
- 新增 `#sidebar-toggle svg` 居中样式

---

## 5. 应用图标更新

### 流程（沿用之前记录）

1. 将新图标 PNG 复制到 `resources/icon-new.png`
2. 裁切为方形 + 圆角处理 + 透明背景（macOS 标准）
3. 按 824px 内容区 / 1024px 画布比例生成 `resources/icon.png`
4. 生成 `resources/icon.icns`
5. `npm run dist:mac` 重新打包
6. 更新 GitHub Release 资产

---

## 验证清单

- [ ] `npm test` 通过（2 files, 8 tests）
- [ ] `npm run build` 通过
- [ ] `npm run dist:mac` 通过
- [ ] 开发版 Electron 启动无报错
- [ ] 侧边栏按钮和呼吸灯缩放界面时不变
- [ ] Ctrl+N 在当前窗口创建新文档
- [ ] 停止编辑 3 秒后自动写盘
- [ ] Agent 写入时不触发自动保存
- [ ] Cmd+Z 可撤销到自动保存前
