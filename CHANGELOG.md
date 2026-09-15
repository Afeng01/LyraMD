# 更新日志

LyraMD 自己的版本线是 **1.1.x → 1.2.x → 1.3.x**。仓库里的 `v1.7.x` / `v1.9.0` 等 tag 属于上游 vmark（`upstream`），**不属于本项目**，不要据此判断落后。

格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)；功能落地即 bump patch、绝不攒批是她 2026-08-26 定的版本纪律（minor/major 只留给真正的大变化）。

## 未发布（本地 `main`，待她定版本号；建议 1.4.0）

### 新功能（batch3，2026-08-25 落地，尚未出安装包）

- **数学公式**：`$$…$$` KaTeX 渲染（懒加载），「格式 → 插入公式」（`Cmd+Shift+E`）
- **图表**：` ```mermaid ` 代码块渲染（隔离 sandbox iframe）
- **导出 Word (docx)**：「文件 → 导出 Word…」
- **导出 PDF**：跟随主题、去白边
- **导出 HTML**：样式改为从当前主题样式表按选择器筛选，不再漏 `==高亮==` 和任务列表
- **编辑**：`==高亮==` 标记、可点击的 GFM 任务列表复选框、Markdown 语法速查窗（`Cmd+Shift+/`）
- **代码块复制按钮**：悬停围栏代码块右上角
- **主题文件化**：Light / Dark / Elegant / Newsprint 独立文件 + 「主题 → Import Theme…」+ WCAG AA 对比度守卫（`scripts/check-theme-colors.mjs`）
- **新功能演示**：「帮助 → 新功能演示」内置功能总览 / 待办列表 / 格式速览 / Agent 同步四个样例文稿
- **更新体验**：非模态更新横幅 + 每版一次的 release notes（需发布新版后才能看到）
- **VSCode 联动**：`vscode-extension/` 的 open-in-editor 扩展（需手动装进 VSCode）
- **细节**：保存/打开对话框锚定当前文档旁；关闭拼写红线波浪线

### 文稿安全（2026-09-15，P0 整改第二批）

- **决策面补齐**：被拦下的高风险外部更新，面板新增「接受外部版本」和「查看 diff」（就地展开 LCS diff，最多 200 行）——之前只能否决，现在可以知情接受
- **append-only 事件日志**：所有保存、外部变更（检测/被拦/接受/恢复）、崩溃恢复、revision 恢复事件追加写入 `~/.lyramd/document-journal.jsonl`，每条含前后 checksum 与字数，可回放「哪一次写入把正文改成了什么」；日志写失败不影响正文保存
- 背景：2026-07-09 文稿被打空事故后的系统性整改，现状与剩余项见 `.codex/p0-document-safety-remediation-plan-2026-07-10.md`

### 性能与维护（2026-09-15）

- **启动体积**：主进程入口包 730 kB → 180 kB（`electron-updater` 改为只在检查更新时按需加载；macOS 手动更新流程完全不加载）
- **CSS**：base.css 7411 字符巨型单行拆分（token 流等价性校验，零视觉变化）；删除被完全覆盖的死规则
- **UI 文案**：清理产品界面的 fork 叙事残留；拖拽 MIME 改 `x-lyramd-workspace`
- 测试基线：66 files / 480 → **68 files / 503 tests** 全绿

### 已知待办

- 安装版 destructive drill（等下次发版时做）
- `.codex/` 里的决策记录已纳入版本控制（2026-09-15）

## 1.3.8（2026-07-10）

当前线上与安装包版本（她电脑上装的是 1.3.7）。主要变化：**高风险外部更新不再直接覆盖编辑器**——命中阈值（清空 / 大幅缩短 / 大量删行）时正文保持原样、外部覆盖前的正文单独落盘为恢复点、恢复永远写成新草稿；另有文稿安全面板与本地 revision 快照。详见 `.codex/2026-07-10-lyramd-1-3-8-release-proof.md`。
