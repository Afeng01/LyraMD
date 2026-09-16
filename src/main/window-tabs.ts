import type { FSWatcher } from 'fs'

// 标签页阶段 A 的窗口内 tab 数据模型（docs/2026-09-15-竞品调研-ColoMD-2.4-主界面优化方案.md §4/§8）。
// 设计约束：默认关闭（单 tab）时与既有单文档 WindowState 行为完全等价；
// 本模块只承载纯数据与纯逻辑，Electron/文件系统副作用（watch 挂载、落盘）留在 index.ts。

export type TabDocumentKind = 'blank' | 'draft' | 'file'

export interface WindowTabState {
  id: string
  documentKind: TabDocumentKind
  filePath: string | null
  draftId: string | null
  displayTitle: string
  /** 与磁盘同步的基线内容；watcher 对账、autosave、外部变更守卫都以各自 tab 的这份为准 */
  lastSyncedContent: string | null
  /** 切走 tab 时快照到的未落盘编辑内容；null 表示没有已知未保存编辑（标签条圆点依据） */
  unsavedContent: string | null
  /** 按 tab 隔离：自己写入文件产生的“忽略一次 watcher 事件”凭证，绝不跨 tab 消费 */
  ignoredWatchedContents: Map<string, number>
  /** 只有活动 tab 允许持有挂载中的 watcher；切走时由 detachTabWatch 关闭 */
  watcher: FSWatcher | null
  debounceTimer: ReturnType<typeof setTimeout> | null
}

export interface TabCollection {
  tabs: WindowTabState[]
  activeTabId: string
}

export interface WindowTabView {
  id: string
  title: string
  documentKind: TabDocumentKind
  hasUnsaved: boolean
  isActive: boolean
}

let tabIdCounter = 0

export function nextTabId(): string {
  tabIdCounter += 1
  return `tab-${tabIdCounter}`
}

export function createWindowTabState(): WindowTabState {
  return {
    id: nextTabId(),
    documentKind: 'blank',
    filePath: null,
    draftId: null,
    displayTitle: '未命名文档',
    lastSyncedContent: null,
    unsavedContent: null,
    ignoredWatchedContents: new Map<string, number>(),
    watcher: null,
    debounceTimer: null,
  }
}

/**
 * 初始集合恒为「单个 tab 且它就是活动 tab」——这是“默认关闭时与现状等价”的模型层保证：
 * 所有按 tab 隔离的字段都恰好只有一份，且始终被活动 tab 命中。
 */
export function createInitialTabCollection(): TabCollection {
  const tab = createWindowTabState()
  return {
    tabs: [tab],
    activeTabId: tab.id,
  }
}

export function getActiveTab(collection: TabCollection): WindowTabState {
  const active = collection.tabs.find((tab) => tab.id === collection.activeTabId)
  if (!active) throw new Error(`active tab not found: ${collection.activeTabId}`)
  return active
}

export function findTabById(collection: TabCollection, tabId: string): WindowTabState | null {
  return collection.tabs.find((tab) => tab.id === tabId) ?? null
}

/**
 * 切换 tab 只移动活动指针，绝不改动任何 tab 的内容字段。
 * 这是门槛一（切换不得误标文档为已编辑 / 不得篡改同步基线）的模型层保证。
 */
export function setActiveTab(collection: TabCollection, tabId: string): boolean {
  if (!findTabById(collection, tabId)) return false
  collection.activeTabId = tabId
  return true
}

/** 追加新 tab 并把它设为活动 tab（⌘T / 新开文档落新 tab 的唯一入口）。 */
export function addTab(collection: TabCollection, tab: WindowTabState = createWindowTabState()): WindowTabState {
  collection.tabs.push(tab)
  collection.activeTabId = tab.id
  return tab
}

/** 在同一窗口全部 tab 里按路径找文档；文件可能开在非活动 tab。 */
export function findTabByFilePath(collection: TabCollection, filePath: string): WindowTabState | null {
  return collection.tabs.find((tab) => tab.filePath === filePath) ?? null
}

/**
 * 关闭单个 tab 的 watcher 与 debounce 定时器。
 * 切走 tab、以及窗口关闭时对每个 tab 调用（门槛六：关闭窗口全部 tab 走清理链路）。
 */
export function detachTabWatch(tab: WindowTabState): void {
  if (tab.watcher) {
    tab.watcher.close()
    tab.watcher = null
  }
  if (tab.debounceTimer) {
    clearTimeout(tab.debounceTimer)
    tab.debounceTimer = null
  }
}

export function closeAllTabs(collection: TabCollection): void {
  for (const tab of collection.tabs) {
    detachTabWatch(tab)
  }
}

/**
 * autosave 目标在调用时刻按 tabId 捕获。之后即使活动 tab 已被切换，
 * 落盘仍写入捕获时的 tab——门槛三（autosave 排队期间落盘不被切换覆盖）的模型层保证。
 * 返回 null 表示 tabId 已失效（tab 被关），调用方不得继续写盘。
 */
export function resolveTabForSave(collection: TabCollection, tabId: string): WindowTabState | null {
  return findTabById(collection, tabId)
}

/**
 * 切走 tab 前对编辑器当前内容做快照：与该 tab 的同步基线不同则记为未保存编辑，
 * 切回时由 tabContentForActivation 恢复；相同（已 autosave 过）则清空，标签条不出圆点。
 */
export function snapshotTabUnsavedContent(tab: WindowTabState, editorContent: string): void {
  const savedBaseline = tab.unsavedContent ?? tab.lastSyncedContent
  tab.unsavedContent = editorContent === savedBaseline ? null : editorContent
}

/** 切回某 tab 时投递给编辑器的内容：优先恢复未保存快照，其次同步基线。 */
export function tabContentForActivation(tab: WindowTabState): string {
  return tab.unsavedContent ?? tab.lastSyncedContent ?? ''
}

/** 标签条标题：文档名去掉 .md 后缀（方案 §8 阶段 A 对齐 ColaMD v2.3.0）。 */
export function tabDisplayTitle(tab: WindowTabState): string {
  const title = tab.displayTitle || '未命名文档'
  return title.replace(/\.md$/i, '')
}

export function serializeTabsForRenderer(collection: TabCollection): WindowTabView[] {
  return collection.tabs.map((tab) => ({
    id: tab.id,
    title: tabDisplayTitle(tab),
    documentKind: tab.documentKind,
    hasUnsaved: tab.unsavedContent !== null,
    isActive: tab.id === collection.activeTabId,
  }))
}

/**
 * 门槛二（绝不把 A 文档内容写进 B 的路径）的模型层断言助手：
 * 落盘前校验“写入目标 tab 的 filePath 与调用方准备写入的路径一致”。
 */
export function canWriteTabToPath(tab: WindowTabState, targetPath: string): boolean {
  return tab.filePath !== null && tab.filePath === targetPath
}
