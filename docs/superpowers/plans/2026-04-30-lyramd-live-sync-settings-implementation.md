# LyraMD 实时同步与设置交互 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix LyraMD’s external live-refresh reliability first, then add document-title/file-name sync, a floating settings dialog, explicit Save As migration behavior including “save as then delete current path”, and clipboard copy cleanup.

**Architecture:** Keep the current Electron main/renderer split, but treat this work as four bounded slices. Main process owns file watching, path migration, and persisted settings. Renderer owns the floating settings UI, title-edit affordances, and clipboard-facing interaction. Shared pure helpers should absorb edge-case logic so each slice can be tested without relying on the full app shell.

**Tech Stack:** Electron, electron-vite, TypeScript, Milkdown/ProseMirror, Vitest

---

## File Structure

### New files

- `src/main/settings.ts`
  Pure helpers for persisted settings normalization, defaults, and small enum validation.

- `src/main/settings.test.ts`
  Tests for settings defaults and migration/sanitization.

- `src/renderer/settings-dialog.ts`
  Small renderer-side UI controller for the floating settings modal.

### Modified files

- `src/main/index.ts`
  File watching, rename recovery, file reload propagation, save-path migration, title/file-name sync routing, settings IPC, and persistence.

- `src/main/file-sync.ts`
- `src/main/file-sync.test.ts`
  Watch-event reconciliation helpers and focused tests for `rename` recovery decisions.

- `src/preload/index.ts`
- `src/renderer/env.d.ts`
  Settings and path-migration IPC bridge additions.

- `src/renderer/main.ts`
- `src/renderer/index.html`
- `src/renderer/themes/base.css`
  Settings modal rendering, title interactions, new menu/command handling, and Save As behavior prompts.

- `src/renderer/editor/editor.ts`
  Clipboard cleanup behavior and any title-edit hook points tied to current editor state.

- `docs/superpowers/specs/2026-04-30-lyramd-live-sync-settings-design.md`
  Update only if implementation reveals a real spec correction.

---

## Chunk 1: 修复实时热更新底座

### Task 1: 为 `rename` 替换写入补一组失败测试

**Files:**
- Modify: `src/main/file-sync.test.ts`
- Modify: `src/main/file-sync.ts`

- [ ] **Step 1: 写失败测试，覆盖“外部 replace 触发 rename”的同步决策**

至少覆盖：

- `change` 事件继续按已有内容去重逻辑工作
- `rename` 事件会被识别为需要重读并尝试重绑 watcher
- 收到 `rename` 后，后续真正的新内容不会因为旧的同步基线被吃掉

- [ ] **Step 2: 运行 focused test，确认当前实现不能覆盖该场景**

Run: `npm test -- src/main/file-sync.test.ts`
Expected: FAIL because current helpers do not model rename/rebind behavior.

- [ ] **Step 3: 在纯 helper 层补最小状态机**

增加纯逻辑，至少能表达：

- 当前事件类型
- 是否需要重新绑定 watcher
- 是否需要主动读取文件内容

- [ ] **Step 4: 重新运行 focused test**

Run: `npm test -- src/main/file-sync.test.ts`
Expected: PASS

### Task 2: 在主进程 watcher 中落地 `rename` 恢复逻辑

**Files:**
- Modify: `src/main/index.ts`

- [ ] **Step 1: 把 `watchFile()` 从“只处理 change”改成显式处理 `rename` + `change`**

要求：

- `change` 仍走正常 debounce + readFile
- `rename` 触发一次重读和 watcher 重绑
- 不能因为重绑造成重复 watcher 泄漏

- [ ] **Step 2: 保持现有 renderer defer/ignore 语义不被破坏**

外部变化仍然通过现有 `file-changed` 通道进入 renderer，让本地保存队列继续拥有 defer 权。

- [ ] **Step 3: 运行主流程相关测试和构建**

Run:
- `npm test -- src/main/file-sync.test.ts src/renderer/editor/content-sync.test.ts`
- `npm run build`

Expected:
- tests PASS
- build PASS

- [ ] **Step 4: 做一次最小人工验证**

验证脚本或人工步骤要写进提交说明：

1. 打开一个真实 `.md`
2. 用外部脚本做 `write tmp && rename tmp file`
3. 确认 LyraMD 自动刷新
4. 连续重复两次，确认无需重启

---

## Chunk 2: 文档标题与文件名同步

### Task 3: 明确标题来源，并先修窗口标题显示

**Files:**
- Modify: `src/main/index.ts`
- Modify: `src/main/drafts.ts`
- Modify: `src/renderer/main.ts`

- [ ] **Step 1: 抽一个共享“当前文档显示标题”规则**

统一规则：

- 正式文件：优先首个一级标题，没有则回退 basename
- 草稿：优先 `displayTitle`
- 空白文档：未命名文档

- [ ] **Step 2: 写 focused test 或纯 helper test**

至少覆盖：

- `# Title` 优先于文件名显示
- 无标题时回退文件名
- 空白内容不生成假标题

- [ ] **Step 3: 更新窗口标题和侧边栏当前项显示**

要求：

- 用户改文档标题后，窗口标题可实时变化
- 不要求这一步就改文件名

- [ ] **Step 4: 运行相关测试和 build**

Run:
- `npm test -- src/main/drafts.test.ts`
- `npm run build`

Expected: PASS

### Task 4: 加入文件名同步策略与一次性提示

**Files:**
- Create: `src/main/settings.ts`
- Create: `src/main/settings.test.ts`
- Modify: `src/main/index.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/env.d.ts`
- Modify: `src/renderer/main.ts`

- [ ] **Step 1: 为设置增加标题同步策略枚举**

最少支持：

```ts
type TitleSyncMode = 'ask' | 'always' | 'never'
```

- [ ] **Step 2: 写设置默认值/清洗测试**

Run: `npm test -- src/main/settings.test.ts`
Expected: FAIL until helper exists.

- [ ] **Step 3: 实现“标题变化后是否提示同步文件名”的判定**

只在这些条件都满足时进入提示：

- 当前文档有真实路径
- 用户主动编辑导致一级标题变化
- 新标题与当前文件名明显不同
- 该变化不是外部 watcher 刷新导致

- [ ] **Step 4: renderer 先接一个最小确认流程**

第一版可以先用轻量 confirm-style modal，不必一步到位做复杂 inline prompt。

选项至少包括：

- `仅同步这次`
- `以后总是询问`
- `不要再提醒`

- [ ] **Step 5: 实现成功 rename 后的会话切换**

要求：

- 当前会话切到新路径
- recent/workdir/sidebar 跟上
- watcher 指向新路径

- [ ] **Step 6: 运行 focused tests + build**

Run:
- `npm test -- src/main/settings.test.ts`
- `npm run build`

Expected: PASS

当前进度备注（2026-04-30）：
- 已完成 settings 基础设施：`titleSyncMode = ask | always | never` 的持久化与 IPC。
- 已完成 `always/never` 的主进程决策基础：正式文件保存后会根据标题变化与 `titleSyncMode` 决定是否自动 rename。
- 已完成主进程显式 rename 通路：新增基于标题的 rename IPC，供后续 `ask` 提示和双击改标题 UI 复用。
- 已完成 `ask` 的最小提示交互，并改成直接调用显式 rename IPC，不再通过“临时切 always 再保存”的 workaround 实现。
- 已完成 sidebar 当前标题区域的双击改标题入口。
- 已根据 review 收口 4 个问题：`always` 当前次改名不生效、无 H1 时误删正文、标题同步缺少目标路径冲突保护、以及改名后显示标题退回文件名。

### Task 5: 增加“双击标题修改”入口

**Files:**
- Modify: `src/renderer/index.html`
- Modify: `src/renderer/main.ts`
- Modify: `src/renderer/themes/base.css`

- [ ] **Step 1: 在当前文档标题区域增加可双击进入编辑态的容器**

- [ ] **Step 2: 实现编辑态最小交互**

要求：

- 双击进入
- `Enter` 确认
- `Escape` 取消
- 与现有侧边栏交互不冲突

- [ ] **Step 3: 若用户启用了同步文件名策略，则走同一条 rename 通路**

- [ ] **Step 4: 做人工验证**

1. 双击当前标题
2. 改标题
3. 确认窗口标题更新
4. 若启用同步，确认文件路径同步更新

---

## Chunk 3: 设置弹窗与“另存并迁移”

### Task 6: 实现设置持久化与 IPC

**Files:**
- Modify: `src/main/index.ts`
- Modify: `src/main/settings.ts`
- Modify: `src/main/settings.test.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/env.d.ts`

- [ ] **Step 1: 扩展设置模型**

至少包括：

```ts
type SaveAsMode = 'switch' | 'move'
```

以及：

- `titleSyncMode`
- `saveAsMode`
- 现有 draft/theme 相关入口需要的最小字段

- [ ] **Step 2: 写设置序列化测试**

覆盖未知值回退到默认值。

- [ ] **Step 3: 加入 get/update settings IPC**

- [ ] **Step 4: 运行 focused test**

Run: `npm test -- src/main/settings.test.ts`
Expected: PASS

### Task 7: 渲染层增加悬浮设置弹窗

**Files:**
- Create: `src/renderer/settings-dialog.ts`
- Modify: `src/renderer/index.html`
- Modify: `src/renderer/main.ts`
- Modify: `src/renderer/themes/base.css`

- [ ] **Step 1: 写出最小 modal 结构**

内容先聚合在一个面板里，不分 tab。

- [ ] **Step 2: 接通首批设置项**

至少包括：

- 标题同步策略
- 另存为默认行为
- 默认草稿目录入口
- 主题入口

- [ ] **Step 3: 做键盘与关闭行为**

要求：

- `Esc` 关闭
- 点击遮罩关闭
- 焦点不会丢到不可见区域

- [ ] **Step 4: build + 人工检查**

Run: `npm run build`
Expected: PASS

### Task 8: 实现“另存为后删除当前路径”

**Files:**
- Modify: `src/main/index.ts`
- Modify: `src/renderer/main.ts`

- [ ] **Step 1: 为正式文件 Save As 增加两条明确通路**

至少区分：

- `save-file-as` -> 切到新路径，保留旧路径
- `save-file-as-move` -> 切到新路径，并删除旧路径

- [ ] **Step 2: 抽取安全的路径迁移 helper**

顺序必须固定：

1. 写新路径
2. 更新当前会话目标
3. 尝试删除旧路径
4. 删除失败时保留新路径成功结果，并回传“迁移不完整”

- [ ] **Step 3: 草稿转正式文件继续按身份迁移处理**

草稿旧路径应移除，不保留双副本。

- [ ] **Step 4: 写 focused tests**

至少覆盖：

- `switch` 模式保留旧文件
- `move` 模式删除旧文件
- 删除失败时不回滚新文件

- [ ] **Step 5: 做人工验证**

1. 正式文件执行“另存为”
2. 确认新旧文件都存在
3. 正式文件执行“另存并迁移”
4. 确认新文件存在，旧文件消失

---

## Chunk 4: Clipboard 复制链路修复

### Task 9: 为复制输出补最小复现测试

**Files:**
- Modify: `src/renderer/editor/editor.ts`
- Create or Modify: renderer-side clipboard-focused test file as needed

- [ ] **Step 1: 建一个最小测试夹具，覆盖两段普通段落复制**

至少验证：

- 中间没有额外空白段
- 首尾没有裸 `br`

- [ ] **Step 2: 运行 focused test，确认现状失败**

- [ ] **Step 3: 最小化调整 `enhanceClipboard()`**

要求：

- 继续保留样式增强
- 但清理首尾 `br`
- 不人为扩大段落间距语义

- [ ] **Step 4: 回归验证**

Run:
- focused clipboard tests
- `npm run build`

Expected: PASS

---

## Final Verification

### Task 10: 全链路验收

**Files:**
- No source changes required unless fixes are found

- [ ] **Step 1: 跑完整自动测试**

Run: `npm test`
Expected: PASS

- [ ] **Step 2: 跑构建**

Run: `npm run build`
Expected: PASS

- [ ] **Step 3: 做人工验收 proof pack**

至少记录：

1. 外部 rename 覆盖写入仍能实时刷新
2. 标题变化可更新窗口标题
3. 设置弹窗可改标题同步和另存为模式
4. “另存并迁移”会删除旧路径
5. 复制两段文本不再多一行或泄漏 `br`

- [ ] **Step 4: 更新必要文档/记忆并准备切分子任务**

把最终状态同步回：

- `docs/superpowers/specs/2026-04-30-lyramd-live-sync-settings-design.md`
- 当前 plan 文件
- 项目 memory / daily（如实现已开始）

---

Plan complete and saved to `docs/superpowers/plans/2026-04-30-lyramd-live-sync-settings-implementation.md`. Ready to execute?
