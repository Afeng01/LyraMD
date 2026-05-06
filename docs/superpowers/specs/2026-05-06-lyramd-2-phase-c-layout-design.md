# 2026-05-06 — LyraMD 2.0 Phase C 视觉与布局骨架设计

## 状态

基于 Cherry 对 VMark 使用体验的反馈整理。本文只定义 LyraMD 2.0 第一阶段 C 的视觉与布局骨架，不进入代码实现计划。

## 产品方向

LyraMD 2.0 不应该变成 VMark 的复刻，也不应该变成完整知识库或 IDE。它的核心仍然是 Agent Native Markdown 编辑器：人类在文稿里写，Agent 通过真实 CLI 参与写作，外部文件变化继续由 LyraMD 实时刷新。

这一阶段的布局原则是：

```text
左侧 = 我在哪个工作目录 / 文稿树里？
中间 = 当前文稿本身。
右侧 / 底部 = Agent CLI 与文稿结构上下文。
```

Agent 是 2.0 的主能力；大纲是辅助能力。文件树是文稿入口，不是知识库管理系统。

## 范围

Phase C 包含：

1. LyraMD 命名统一与历史 ColaMD/colamd 可见命名清理方案。
2. 左侧工作目录文件树的视觉骨架。
3. 中间编辑区的沉浸式写作画布。
4. 右侧 Agent 优先面板，Outline 弱化为同面板切换项。
5. 小窗口底部 Agent 抽屉、大窗口右侧 Agent 面板的响应式布局。
6. Agent CLI 自动检测与设置覆盖的产品入口。
7. 自定义背景设置入口，支持仅编辑区或整个窗口作用范围。
8. 技术栈路线判断：当前 Phase C 先不迁移编辑器，保留后续 Tauri / Tiptap / CodeMirror 评估口。

Phase C 不包含：

1. VMark 的历史记录体系。
2. AI Genies / prompt marketplace / workflow canvas。
3. 完整多标签 IDE 式工作区。
4. 拖拽移动文件、批量重构、复杂文件管理。
5. Agent 预设动作按钮，如“润色”“扩写”“改写”。
6. 正式迁移到 Tauri、Tiptap 或 CodeMirror。

## 命名策略

产品名统一为 LyraMD。

需要清理的可见命名：

- README / README_CN 中的旧 ColaMD 表述。
- 设置页、集成页、提示文案里的 ColaMD 表述。
- 应用菜单、窗口标题、导出标题中的 ColaMD 表述。
- MCP / CLI 说明中的用户可见 server name。

需要谨慎处理的内部命名：

- 代码文件、测试名、内部 IPC channel 可以分阶段迁移。
- 如果旧 MCP server name `colamd` 已经被用户安装过，不能直接破坏兼容。可先显示为 LyraMD，并保留 `colamd` 作为 legacy server id 或迁移别名。
- `NOTICE.md` 中对原 ColaMD 来源的法律归属不应被删除，只能补充 LyraMD fork 说明。

## 整体布局

### 桌面宽屏

```text
┌─────────────────────────────────────────────────────────────┐
│ Titlebar / drag region                                      │
├──────────────┬──────────────────────────────┬───────────────┤
│ Left Explorer │ Editor Canvas                │ Agent Panel    │
│              │                              │ [Agent][Outline]│
│ File Tree    │ WYSIWYG Markdown             │ xterm CLI      │
│ Pinned       │                              │               │
│ Drafts       │                              │               │
│ Recent       │                              │               │
└──────────────┴──────────────────────────────┴───────────────┘
```

左侧负责入口，中间负责写作，右侧负责 Agent 和结构上下文。右侧默认显示 Agent；Outline 通过图标或快捷键切换到同一个面板，不常驻抢占空间。

### 窄屏 / 小窗口

```text
┌────────────────────────────────────┐
│ Titlebar                            │
├──────────────┬─────────────────────┤
│ Left / Icon  │ Editor Canvas        │
├──────────────┴─────────────────────┤
│ Agent Bottom Drawer                 │
└────────────────────────────────────┘
```

当窗口较窄时，Agent 面板自动变成底部抽屉。布局变化不能重启 CLI，也不能丢失终端滚动历史或会话状态。

## 左侧文件树

左侧文件树参考 VMark 的顺滑感，但功能范围更轻。

第一版需要：

- 显示工作目录的文件夹层级。
- Markdown 文件优先显示。
- 支持新建 Markdown 文件。
- 支持新建文件夹。
- 当前文件高亮。
- 文件切换要快，避免出现明显空白闪烁。
- 文件夹展开/折叠状态在当前会话内保持。

第一版不需要：

- 拖拽移动文件。
- 右键菜单全量操作。
- 非 Markdown 文件管理。
- Git 状态、标签、反链、知识库关系。
- 多根复杂 workspace 管理。

左侧仍可保留置顶、草稿、最近，但它们不应和文件树争夺过多视觉空间。建议文件树是主内容，置顶/草稿/最近作为轻量分组或折叠入口。

## 编辑区

编辑区继续强调 LyraMD 的极简写作感。

要求：

- 保留当前 WYSIWYG Markdown 编辑体验。
- 不新增常驻工具栏。
- 不把 Agent 操作做成一排预设功能按钮。
- 选中文本后只出现一个轻量 Agent 入口，用于把选区送入终端。
- 背景设置不能破坏正文可读性。

选区 Agent 入口的最小语义：

```text
选中文本 -> 点击 Agent 按钮 -> 打开/聚焦 Agent CLI -> 注入文档路径、选中文本和简短上下文
```

LyraMD 不替用户决定是润色、扩写还是重写。用户在真实 CLI 中继续表达意图。

## 右侧 Agent / Outline 面板

右侧面板以 Agent 为默认主视图。

### Agent 视图

Agent 视图承载真实终端，而不是聊天 UI。

要求：

- 使用真实 CLI 会话。
- 支持自动检测 Codex、Claude、Gemini 等本机 CLI。
- 设置页允许用户覆盖默认命令。
- CLI 会话随布局迁移保持不断线。
- 工作目录优先作为终端 cwd。
- 终端区域默认有自己的可读底色，避免背景图干扰。

### Outline 视图

Outline 是辅助，不是主角。

要求：

- 和 Agent 共用右侧面板。
- 通过顶部或侧边图标切换。
- 支持快捷键切换。
- 在窄屏时可以作为临时面板或浮层打开。
- 不回到“左侧塞满 Files / Outline / History”的结构。

## 响应式规则

初始建议：

- `< 900px`：隐藏或压缩左侧；Agent 强制底部抽屉。
- `900px - 1240px`：左侧保留，Agent 默认底部抽屉或按用户偏好打开。
- `>= 1240px`：Agent 可进入右侧面板。
- `>= 1440px`：右侧 Agent 面板可常驻，推荐宽度为窗口宽度的 25%-30%，并设置最小/最大宽度。

需要加入迟滞区，避免窗口宽度在阈值附近变化时 Agent 面板在右侧和底部之间反复跳动。

用户设置可覆盖自动规则：

- Auto：按窗口尺寸自动决定。
- Bottom：始终底部。
- Right：始终右侧，但窄屏时允许降级到底部以保护编辑区。

## 自定义背景

背景设置进入普通设置页，而不是只靠自定义 CSS。

第一版支持：

- 纯色背景。
- 本地图片背景。
- 作用范围：仅编辑区 / 整个窗口。
- 透明度。
- 暗化。
- 模糊。
- 恢复默认。

可读性保护：

- 编辑区文字下方必须保留足够对比度。
- 当背景作用于整个窗口时，侧边栏和 Agent 面板应使用半透明但稳定的底色。
- 终端区域默认保留独立 terminal surface，不让背景纹理直接穿透到命令输出。
- 不做过强毛玻璃，不做大面积装饰光效。
- 不引入渐变球、氛围背景或纯装饰视觉元素。

## 技术栈判断

### Phase C 结论

Phase C 先不迁移技术栈。继续基于当前 Electron + TypeScript + Milkdown 做视觉和布局骨架设计与增量实现。

原因：

- 当前 LyraMD 已有文件热更新、草稿、工作目录、设置、大纲、主题、MCP/Codex 等 1.x 能力。
- Phase C 的核心风险是信息架构和布局，不是 Electron 或 Milkdown 本身。
- 立刻迁移会把“布局骨架”扩大成“大重写”，使需求验证变慢。
- Milkdown 仍能提供当前需要的 WYSIWYG Markdown 体验。

### 后续可评估路线

后续如果决定做 2.0 重写，优先评估：

1. Tauri + React + Tiptap。
2. Tauri + React + Milkdown。
3. Tauri + React + Tiptap + CodeMirror source mode。

不建议直接把 CodeMirror 6 作为唯一主编辑器，除非 Cherry 明确接受 LyraMD 从 WYSIWYG Markdown 变成偏源码编辑器。

CodeMirror 6 更适合：

- Source Mode。
- Agent patch / diff view。
- Markdown 原文编辑。
- 精确 decorations、lint、位置映射。

Tiptap 更适合：

- 深度定制 ProseMirror rich-text 编辑体验。
- 更直接控制 node/mark/extension。
- 与 VMark 技术路线对齐。

Milkdown 更适合：

- 延续当前 WYSIWYG Markdown。
- 保持迁移成本低。
- 避免过早重写编辑器核心。

## VMark 借鉴与边界

应该借鉴：

- 响应式终端布局：宽屏右侧，窄屏底部。
- 简洁终端面板。
- 文件树的新建文件 / 新建文件夹入口。
- 图标化侧边栏切换。
- 文稿切换的顺滑感。

不应吸收：

- 历史记录体系。
- Files / Outline / History 全塞左侧。
- AI Genies 体系。
- 工作流画布。
- 重型多标签 / 多窗口文档管理。
- 复杂右键菜单和 IDE 式文件操作。
- 让 UI 变成 VMark 功能合集。

## 验收标准

- 所有用户可见产品名在新设计中统一为 LyraMD。
- 左侧能够表达工作目录文件夹树，而不是扁平 Markdown 列表。
- 大屏时 Agent 可以作为右侧主面板显示。
- 小窗口时 Agent 可以作为底部抽屉显示。
- Agent 布局变化不会重启终端会话。
- Outline 不再是左侧主结构的一部分，而是右侧 Agent 面板的弱化切换项。
- 选中文本后能看到一个克制的 Agent 入口设计。
- 设置里能表达 Agent CLI 自动检测与手动覆盖。
- 设置里能表达背景作用范围：仅编辑区 / 整个窗口。
- 背景设置不会让正文或终端输出不可读。
- Phase C 不要求迁移到 Tauri、Tiptap 或 CodeMirror。

## 后续实施拆分建议

实施计划应拆成独立阶段：

1. 命名清理与视觉变量准备。
2. App shell 改成左 / 中 / 右 / 底部响应式布局。
3. 右侧 Agent / Outline 面板骨架。
4. 底部 Agent 抽屉骨架。
5. 自定义背景设置与 CSS 变量。
6. 文件树数据结构与新建文件夹入口。
7. 选区送入 Agent CLI 的交互设计与终端接入。

每个阶段都应保留现有热更新和编辑器基本链路可用。
