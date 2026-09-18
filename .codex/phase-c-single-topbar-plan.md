# 阶段 C：单一顶栏 — 文件级实施方案

> 2026-09-18 · 基线 HEAD `5d66a36c`（71 files / 556 tests 全绿）· 只读方案，未改任何源文件。
> 目标（docs/2026-09-15-竞品调研-ColoMD-2.4-主界面优化方案.md §8 阶段 C）：**当 tabs.enabled 开启时**——
> ① 标签条常驻（单文档也显示）；② 单文档也是一个 tab；③ 打开文件落 tab 而非新窗口；
> ④ 启动即「未命名」tab（无恢复会话时）；⑤ 最近文件入口随标签常驻保留。
> tabs.enabled 关闭时行为与现状完全等价。

本文件帮助执行棒回答：改哪个文件哪个函数、怎么改、每个子项怎么测、按什么顺序提交。锚点行号基于 HEAD `5d66a36c`。

---

## 0. 现状核实结论（逐点采信区核对）

| 子项 | 现状 | 结论 |
| --- | --- | --- |
| ① 常驻标签条 | `shouldRenderTabStrip`（src/renderer/window-tabs.ts:27）要求 `enabled && tabs.length > 1`；单文档走 `detachStrip()` 零 DOM 痕迹（同文件 :238 分支） | 需改条件；零痕迹回退机制本身可复用 |
| ② 单文档也是 tab | `createInitialTabCollection`（src/main/window-tabs.ts:63-73）**恒为单个 tab 且是活动 tab**；`WindowState` 的 documentKind/filePath 等 getter 全部委托活动 tab（src/main/index.ts:444-491 注释区） | **模型层已满足，无需主进程改动**；只差渲染层可见性（即 ①） |
| ③ 打开文件落 tab | `openFile`（src/main/index.ts:2199）enabled 分支（:2225-2231）**要求 hostWin `rendererReady`** 才发 `tab-open-request`；未 ready 时掉到 `findEmptyWindow`（:2235）/ 新窗口。IPC `open-file`（:2706）与 `open-file-path`（:2734）各自已有 enabled+ready 路径，未 ready 时走 blank 直载或 `openFile` | 两条 ready 路径已通；**缺口只在「enabled 但宿主渲染层未 ready」的兜底落到新窗口** |
| ④ 启动即未命名 tab | whenReady 启动分支（src/main/index.ts:3865-3900）：enabled+有效快照 → `restoreSessionTabsInWindow`（:2163，恢复整组含 blank）；否则 draft 恢复分支；否则 `createWindow()` → 初始空白 tab「未命名文档」。enabled + 上次是 file 且无快照 → 同样落 `createWindow()` 未命名 tab | **分支序已满足 ④**；缺的是可测性与文档化（分支内联在 whenReady，无单测） |
| ⑤ 最近文件入口常驻 | 时钟按钮 + 下拉在 `handleTabsState` 挂载成功后无条件渲染（src/renderer/window-tabs.ts:269 `renderRecentControl(strip)`）；候选过滤排除已开 tab | **随 ① 自动生效，零改动** |
| 会话写入 | `persistLastActiveDocument`（src/main/index.ts:1800-1815）**无条件**写 tab 快照（开关关闭时集合恒单 tab，写入无害）；恢复分支由 whenReady 的 `areTabsEnabled()` 守卫 | 兼容性已在阶段 A 处理，阶段 C 不需动 |
| 开关关闭等价性 | 关闭时 `sendTabsState` 发 `tabs: []`（src/main/index.ts:1832-1839）→ `shouldRenderTabStrip` false → 摘除节点；`openFile`/whenReady/⌘T 全部有 `areTabsEnabled()` 前置分支回退旧路径 | 回退面完整，阶段 C 改动不得触碰这些守卫 |

---

## 1. 五个子项改动点

### ① 标签条常驻（核心改动，1 个文件 1 行逻辑）

**文件：src/renderer/window-tabs.ts:27-29**

```ts
// 改前
export function shouldRenderTabStrip(payload: TabsStatePayload): boolean {
  return payload?.enabled === true && Array.isArray(payload.tabs) && payload.tabs.length > 1
}
// 改后
export function shouldRenderTabStrip(payload: TabsStatePayload): boolean {
  return payload?.enabled === true && Array.isArray(payload.tabs) && payload.tabs.length > 0
}
```

同步改函数上方 JSDoc（「单文档永不显示标签条」→「阶段 C：开关开启即常驻，单文档也是一个 tab」）及文件头注释。

**为什么这样改就够**：
- `sendTabsState`（src/main/index.ts:1832）在 enabled 时总发真实集合（≥1 个 tab），disabled 时发 `tabs: []` → `length > 0` 对关闭态恒 false，零痕迹回退（`detachStrip`，src/renderer/window-tabs.ts:238 分支）原样生效。
- 防御性：enabled 但 `tabs: []`（理论不可达，集合恒非空）仍返回 false，不会渲染空条。
- 单 tab 时点击自身 → `onActivate` → `tabs-switch` → `activateTabInWindow`（src/main/index.ts:2090）在 `previousTab.id === tabId` 时早退 true，无害。

### ② 单文档也是一个 tab

**无代码改动。** 模型层由 `createInitialTabCollection`（src/main/window-tabs.ts:63）保证；可见性由 ① 解锁。唯一动作：在 ① 的 commit 里补一条模型层显式断言（见 §3 测试清单），把「单文档 = 单 tab」从实现细节升级为契约。

### ③ 打开文件落 tab，不开新窗

**文件：src/main/index.ts，`openFile`（:2199）enabled 分支（:2224-2232）**

```ts
// 改前（:2226）
    if (hostWin && getState(hostWin).rendererReady) {
      // 开启标签页且宿主窗口就绪：渲染层 flush 后通过 tabs-open-document 落新 tab
      hostWin.webContents.send('tab-open-request', { filePath, documentKind: null, draftId: null })
      hostWin.focus()
      return
    }
  }

  // 未开启标签页（或宿主窗口渲染层未就绪）：保持既有行为——空窗复用 / 新窗口
// 改后
    if (hostWin) {
      if (getState(hostWin).rendererReady) {
        // 开启标签页且宿主窗口就绪：渲染层 flush 后通过 tabs-open-document 落新 tab
        hostWin.webContents.send('tab-open-request', { filePath, documentKind: null, draftId: null })
        hostWin.focus()
        return
      }
      // 阶段 C：宿主未 ready 时不再退到新窗口——直接落宿主活动 tab；
      // file-opened 载荷由 pendingFileOpened 缓冲，renderer-ready 握手后补投（:791-808）。
      void loadFileInWindow(hostWin, filePath)
      hostWin.focus()
      return
    }
  }

  // 未开启标签页：保持既有行为——空窗复用 / 新窗口（注释同步收窄）
```

要点：
- `loadFileInWindow`（:2046）写活动 tab 的 filePath/lastSyncedContent 并 `deliverFileOpenedPayload`；未 ready 时载荷进 `state.pendingFileOpened`（:797），`renderer-ready`（:800-808）后补投——所以此路径**不需要渲染层配合**，也不需要 flush（未 ready 意味着编辑器不可能有在途未保存编辑）。
- IPC `open-file`（:2706）/ `open-file-path`（:2734）的未 ready 分支：blank 窗直接 `loadFileInWindow`（已落 tab），非 blank 落 `openFile(filePath, win)` → 改后收敛进宿主 tab，无需另改。
- `findEmptyWindow`（:2247）与新窗口（`createWindow({ filePath, ... })`）仅在 **disabled** 时可达；enabled 时选不出 hostWin 只可能是全窗已毁（极端），保持 `createWindow` 兜底不动。
- `app.on('open-file')`（:3940）与第二实例 `openLaunchFilePath`（:3328）都汇入 `openFile`，自动受益。

**竞态防护（必须写进 commit message 与测试注释）**：`rendererReady` 判定与 `tab-open-request` 之间无锁；本兜底只在「宿主存在但未 ready」时生效，此时渲染层尚未注册任何监听、不可能产生未保存编辑，`loadFileInWindow` 改写活动 tab 安全。会话恢复进行中（`restoreSessionTabsInWindow` await 序列）到达的 openFile 仍走 ready 分支（恢复中窗口 renderer 已 ready），不在本路径竞争。

### ④ 启动即「未命名」tab（无恢复会话时）

**无行为改动；抽纯函数使其可测。**

whenReady 分支序（src/main/index.ts:3865-3900）已实现目标优先级：

1. 有启动参数文件路径 → `createWindow({ filePath })`（命令行/dock 打开，优先级最高，不动）；
2. enabled + `persistedSessionState.tabs/activeTabId` 有效 → `restoreSessionTabsInWindow` 恢复整组（含 blank tab）；
3. lastActiveDocument 是 draft 且文件存在 → 恢复草稿；
4. 否则 `createWindow()` → 初始空白 tab「未命名文档」。

改动：在 **src/main/window-tabs.ts** 末尾新增纯函数，把分支判定从 whenReady 内联下沉（与「纯逻辑留 window-tabs.ts、副作用留 index.ts」的既有模式一致）：

```ts
export type StartupRestorePlan = 'tab-session' | 'draft' | 'blank'

export function decideStartupRestore(input: {
  tabsEnabled: boolean
  hasTabSession: boolean          // persistedSessionState.tabs && activeTabId（已过 parseTabSession 校验）
  lastActiveDraftPath: string | null
}): StartupRestorePlan {
  if (input.tabsEnabled && input.hasTabSession) return 'tab-session'
  if (input.lastActiveDraftPath) return 'draft'
  return 'blank'
}
```

whenReady 分支改为消费该函数（判定文本等价搬移，`existsSync` 由调用方先算好传入 `lastActiveDraftPath`）。**不改任何分支顺序**——特别注意：lastActiveDocument 是 **file** 时现状就落到 `blank`（未命名 tab），这正是 ④ 的语义（「无恢复会话」指无有效 tab 快照；单文档 file 记录是旧格式遗留，恢复它属于阶段 A 之前的单文档行为，阶段 C 不扩大也不收回）。

### ⑤ 最近文件入口随标签常驻

**无代码改动。** `renderRecentControl`（src/renderer/window-tabs.ts:254-270）在条渲染时无条件追加时钟按钮；① 生效后单文档也有入口。`filterRecentFilesForTabStrip` 会把当前唯一已开文档从候选里排除（符合预期：已在 tab 中的文稿不进下拉）。

---

## 2. 三个交叉问题设计

### a) 「打开文件落 tab」现有 openFile 路由

enabled 时 `openFile`（src/main/index.ts:2199）路由顺序：

1. 已在某窗口（含非活动 tab）打开 → `tab-activate-request` flush 后切换（:2212-2216）或 `activateTabInWindow` 直切——**已达标，不动**；
2. enabled + hostWin ready → `tab-open-request` → 渲染层 flush → `tabs-open-document`（:2761 handler：已开同路径切回，未开则 `detachTabWatch` + `addTab` + `loadFileInWindow`）——**已达标，不动**；
3. enabled + hostWin 未 ready → **现状掉到空窗复用/新窗口，唯一违规点** → 改为 `loadFileInWindow(hostWin, filePath)` 落活动 tab（§1-③，pendingFileOpened 补投兜底）；
4. disabled → 空窗复用/新窗口，**保持现状**。

改完后 enabled 全路径无新窗口（除「连 hostWin 都选不出」的全窗销毁兜底）。

### b) 启动「未命名」tab 与会话恢复的优先级与共存

**优先级链（写入时序保证一致性）**：

- 退出/文档变化时 `persistLastActiveDocument`（src/main/index.ts:1800）同时写 `lastActiveDocument`（blank 时置 null）与整组 tab 快照（**无条件写，含 blank tab**，开关关闭时集合恒单 tab 也照写）。
- 启动时 `loadSessionState`（:366-402）用 `parseTabSession`（src/main/window-tabs.ts:338）解析：旧格式（无 tabs 字段）/损坏 → null，`persistedSessionState.tabs = null`。
- 启动分支按 §1-④ 顺序：**有有效整组快照（enabled）→ 恢复整组，包括「退出时就是一个未命名 blank tab」的情形**（`restoreSessionTabsInWindow` 首条目复用初始空白 tab，src/main/index.ts:2168-2176）——此时「恢复会话」与「启动即未命名」结果等价，不冲突；**无有效快照 → 未命名 tab**（`createWindow()` 的初始 tab collection）。

**必须继续兼容的旧格式**（8d30ea9d 已做的整组格式不变，阶段 C 不动 `serializeTabSession`/`parseTabSession`）：
- 旧 session-state 只有 `lastActiveDocument` → `parseTabSession` 返回 null → enabled 时落 `decideStartupRestore` 的 draft/blank 分支：draft 照旧恢复草稿，file 照旧落未命名 tab；
- 开关从开→关：快照仍在盘上，whenReady 的 `areTabsEnabled()` 守卫使整组恢复分支不可达，单文档行为不变；关→开：上次退出（哪怕关闭态）写入的单条 tab 快照恢复为单 tab，无害。

### c) `shouldRenderTabStrip` 新条件与开关回退

- **新条件**：`enabled === true && tabs.length > 0`。enabled 时集合恒非空（模型层不变式），故等价于「enabled 即常驻」；`tabs: []` / payload 缺失 / disabled 三种情形仍 false。
- **完全回退**：关闭开关 → `update-settings`（src/main/index.ts:2938）→ `broadcastTabsState`（:1842）→ 每个窗口收 `{ enabled: false, tabs: [] }` → `handleTabsState` 走 `detachStrip()`：清空子节点、摘除 `#tab-strip`、关闭最近文件下拉并置空引用（src/renderer/window-tabs.ts:238-244）——回到「零 DOM 痕迹」，与阶段 A 前等价。主进程侧 `openFile`/⌘T/whenReady/IPC 各分支的 `areTabsEnabled()` 守卫全部不动。

---

## 3. 测试清单

### src/renderer/window-tabs.test.ts（改写 1 条 + 新增 4 条）

| 用例 | 类型 | 断言要点 |
| --- | --- | --- |
| `开关开启但单 tab 时也显示（阶段 C：标签条常驻）` | **改写**现有「开关开启但单 tab 时不显示（单文档零 DOM 痕迹）」（:28） | `shouldRenderTabStrip({ enabled: true, tabs: [tab()] }) === true` |
| `开关关闭时永不显示，即使有多个 tab` | 保留（:24） | 不动，回归 |
| `开关开启但 tabs 空数组时不显示（防御空集合）` | 新增 | `({ enabled: true, tabs: [] }) === false`；原 :38 断言保留归入此用例 |
| `单 tab 渲染：条挂载且含时钟按钮与最近文件下拉容器` | 新增（用现有最小 DOM 桩 describe，:55） | enabled+单 tab payload → `handleTabsState` 后 `isMounted() === true`，容器内有 `.tab-strip-recent-button`（⑤ 常驻的行为级证明） |
| `从单 tab 常驻切回关闭：节点被摘除（零痕迹回退）` | 新增 | 先喂 enabled+单 tab，再喂 `{ enabled: false, tabs: [] }` → `isMounted() === false` |
| `渲染层模块零痕迹策略`（:209，字符串断言） | 保留 | 不动 |

### src/main/window-tabs.test.ts（新增 3 条）

| 用例 | 断言要点 |
| --- | --- |
| `模型契约：初始集合恒为单 tab（阶段 C「单文档也是一个 tab」）` | 复述现有 :34 断言语义 + `tabDisplayTitle` 为「未命名文档」，作为 ② 的显式契约测试 |
| `decideStartupRestore：有整组快照且开启 → 'tab-session'；无快照 + 草稿 → 'draft'；无快照无草稿 → 'blank'` | 四象限：enabled×hasTabSession×draftPath 组合；**enabled=false 时即使有快照也不返回 'tab-session'**（回退等价的关键断言） |
| `parseTabSession：单 blank 条目快照可解析（「未命名 tab 会话」的恢复输入）` | `{ tabs: [{ id, kind: 'blank', filePath: null, draftId: null }], activeTabId }` → 解析成功且 kind 为 blank |

### 集成回归（跑通即可，不新增）

- `npm test` 全量（基线 556 全绿不得回退）；
- src/main/external-change-guard-regression.test.ts：①②⑤ 不触内容链路，应全绿；
- 手工 before/after（§4 验收）：开关开/关 × 单文档/多文档 × 打开文件（⌘O / 侧边栏 / dock 拖入 / 第二实例）× 冷启动有无会话——截图对照。

---

## 4. 实施顺序（每子项独立 commit）

1. **Commit 1 — ①+②+⑤（渲染层常驻）**：`shouldRenderTabStrip` 条件 + 注释；renderer/window-tabs.test.ts 改写+新增。跑 `npm test`。这是纯显隐改动，风险最低，先行。
2. **Commit 2 — ③（openFile 兜底落 tab）**：src/main/index.ts `openFile` enabled 分支；若要主进程路由可测，随本 commit 把「选 hostWin / ready 判定」抽为 window-tabs.ts 纯函数 `decideOpenFileRoute`（可选，与「纯逻辑下沉」模式一致；不抽则本子项以手工 before/after + 现有回归覆盖）。跑 `npm test` + `npm run build`。
3. **Commit 3 — ④（启动分支可测化）**：window-tabs.ts 新增 `decideStartupRestore`，whenReady 分支改为消费；main/window-tabs.test.ts 新增用例。跑 `npm test`。
4. **收尾**：`npm run build` 全量；六门槛逐条对照（下表）；before/after 截图归档。

**六条安全门槛（§4）影响评估**：

| 门槛 | 影响 |
| --- | --- |
| 1 切换不误标已编辑 | 无——本方案不动 `snapshotTabUnsavedContent`/`setActiveTab`；单 tab 自切换早退 |
| 2 不串路径写入 | **③ 兜底路径写活动 tab**，但仅在渲染层未 ready（无在途编辑）时可达；`canWriteTabToPath` 断言链路不变 |
| 3 autosave 不被切换覆盖 | 无——`resolveTabForSave` 捕获语义不动 |
| 4 外部变更守卫按 tab | 无——watcher/对账路径不动；常驻单 tab 与原单文档 watcher 行为一致 |
| 5 blocked 决策面归属 | 无 |
| 6 关闭窗口全 tab 清理 | 无——`closeAllTabs` 不动 |

## 5. 风险清单

1. **最大风险：③ 的「enabled + 宿主未 ready → `loadFileInWindow` 直写活动 tab」**。它绕过渲染层 flush 协同，安全性完全依赖「未 ready ⇒ 不可能有在途未保存编辑」与 `pendingFileOpened` 补投语义（src/main/index.ts:791-808）。若未来 rendererReady 握手时序变化（例如提前置 ready），该路径会静默覆盖活动 tab 文档状态。缓解：兜底仅在该精确分支使用、注释写明依赖、复用现有 `file-opened` 握手回归。
2. 会话恢复 await 序列期间到达 openFile（恢复中窗口已 ready）走 `tab-open-request`，与 `restoreSessionTabsInWindow` 的 addTab 序列并发——现状已存在，非本方案引入，但常驻后打开入口变多、触发概率上升；测试时补一条手工用例（启动即拖文件）。
3. 视觉/布局：单 tab 常驻占用顶栏纵向空间，窄窗（drawer 断点 `DRAWER_BREAKPOINT`）与全屏下的几何需截图验收；本次不改 CSS，若溢出属后续打磨，不阻塞阶段 C。
4. `filterRecentFilesForTabStrip` 在单文档下排除唯一已开文档，下拉可能常显「暂无最近文件」空态——预期行为，验收时确认不视为回归。
5. enabled=false 回退等价性依赖 `sendTabsState` 继续发 `tabs: []`：重构 `sendTabsState` 时不得改为 disabled 不发消息（否则渲染层持有旧条）。现有测试 :24 已锚定。
