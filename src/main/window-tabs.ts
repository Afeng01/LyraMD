import type { FSWatcher } from 'fs'
import type { HandledExternalContentRecord } from './file-sync'

// 窗口内 tab 数据模型（方案历史见 docs/2026-09-15-竞品调研-ColoMD-2.4-主界面优化方案.md §11）。
// 每个窗口至少有一个 tab；用户关闭标签页偏好时仍保持单文档窗口行为。
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
  /** 最近一次被拦下的外部变更（磁盘内容 + 当时的基线）；供被拦决策面去重，基线推进后自动失效 */
  handledExternalContent: HandledExternalContentRecord | null
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
  /** 供渲染层「最近文件入口」排除已在 tab 中打开的文稿；blank/draft 场景可为 null */
  filePath: string | null
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
    handledExternalContent: null,
    watcher: null,
    debounceTimer: null,
  }
}

/**
 * 初始集合恒为「单个 tab 且它就是活动 tab」——单文档也是一个 tab；
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

export interface CloseTabResult {
  closedTab: WindowTabState
  activeTab: WindowTabState
  wasActive: boolean
  replacedLastTab: boolean
}

/**
 * 从集合关闭指定 tab。活动 tab 关闭时优先激活右侧相邻项，否则取左侧；
 * 关闭最后一个 tab 时以全新的 blank tab 替换，保持窗口始终可继续编辑。
 * watcher / 未保存确认由主进程副作用层负责。
 */
export function closeTabFromCollection(collection: TabCollection, tabId: string): CloseTabResult | null {
  const index = collection.tabs.findIndex((tab) => tab.id === tabId)
  if (index < 0) return null

  const wasActive = collection.activeTabId === tabId
  const [closedTab] = collection.tabs.splice(index, 1)
  if (!closedTab) return null

  const replacedLastTab = collection.tabs.length === 0
  if (replacedLastTab) {
    const replacement = createWindowTabState()
    collection.tabs.push(replacement)
    collection.activeTabId = replacement.id
  } else if (wasActive) {
    collection.activeTabId = collection.tabs[Math.min(index, collection.tabs.length - 1)]!.id
  }

  return {
    closedTab,
    activeTab: getActiveTab(collection),
    wasActive,
    replacedLastTab,
  }
}

/** 拖拽排序：把 draggedId 移动到 targetId 前/后；任一 id 无效时不做任何变更。 */
export function reorderTabInCollection(
  collection: TabCollection,
  draggedTabId: string,
  targetTabId: string,
  placeBefore: boolean,
): boolean {
  if (draggedTabId === targetTabId) return false
  const fromIndex = collection.tabs.findIndex((tab) => tab.id === draggedTabId)
  const targetIndex = collection.tabs.findIndex((tab) => tab.id === targetTabId)
  if (fromIndex < 0 || targetIndex < 0) return false
  const [dragged] = collection.tabs.splice(fromIndex, 1)
  if (!dragged) return false
  const shiftedTargetIndex = collection.tabs.findIndex((tab) => tab.id === targetTabId)
  const insertIndex = placeBefore ? shiftedTargetIndex : shiftedTargetIndex + 1
  collection.tabs.splice(insertIndex, 0, dragged)
  return true
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
  // 只与已同步到磁盘的基线比较；若把旧 unsavedContent 当基线，autosave 失败后再次快照
  // 会把同一份未保存内容误清空。初始 blank tab 的空内容则视为干净状态。
  const savedBaseline = tab.lastSyncedContent ?? (tab.documentKind === 'blank' ? '' : null)
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
    filePath: tab.filePath,
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

// ---- 会话持久化（阶段 A 第二片：会话恢复）----

export interface PersistedTabSessionEntry {
  id: string
  kind: TabDocumentKind
  filePath: string | null
  draftId: string | null
}

export interface PersistedTabSession {
  tabs: PersistedTabSessionEntry[]
  activeTabId: string
}

/** 退出/文档状态变化时快照当前窗口 tab 集合（含 blank tab，保 id 供激活映射）。 */
export function serializeTabSession(collection: TabCollection): PersistedTabSession {
  return {
    tabs: collection.tabs.map((tab) => ({
      id: tab.id,
      kind: tab.documentKind,
      filePath: tab.filePath,
      draftId: tab.draftId,
    })),
    activeTabId: collection.activeTabId,
  }
}

const VALID_SESSION_KINDS: readonly string[] = ['blank', 'draft', 'file']

/**
 * 会话恢复解析：旧格式 / 损坏数据一律返回 null，调用方回退既有单文档恢复行为。
 * 校验规则：tabs 非空数组、条目字段形态合法、id 唯一非空、activeTabId 必须指向其中一条。
 * blank 条目不携带路径与草稿；draft/file 条目必须有非空 filePath。
 */
export function parseTabSession(raw: unknown): PersistedTabSession | null {
  if (!raw || typeof raw !== 'object') return null
  const candidate = raw as { tabs?: unknown; activeTabId?: unknown }
  if (!Array.isArray(candidate.tabs) || candidate.tabs.length === 0) return null
  if (typeof candidate.activeTabId !== 'string' || candidate.activeTabId.length === 0) return null

  const seen = new Set<string>()
  const tabs: PersistedTabSessionEntry[] = []
  for (const entry of candidate.tabs) {
    if (!entry || typeof entry !== 'object') return null
    const { id, kind, filePath, draftId } = entry as Record<string, unknown>
    if (typeof id !== 'string' || id.length === 0 || seen.has(id)) return null
    if (typeof kind !== 'string' || !VALID_SESSION_KINDS.includes(kind)) return null
    if (kind === 'blank') {
      tabs.push({ id, kind: 'blank', filePath: null, draftId: null })
    } else {
      if (typeof filePath !== 'string' || filePath.length === 0) return null
      tabs.push({
        id,
        kind: kind as 'draft' | 'file',
        filePath,
        draftId: typeof draftId === 'string' ? draftId : null,
      })
    }
    seen.add(id)
  }
  if (!seen.has(candidate.activeTabId)) return null
  return { tabs, activeTabId: candidate.activeTabId }
}

export interface LoadedSessionState {
  lastActiveDocument: {
    kind: 'draft' | 'file'
    filePath: string
    draftId: string | null
  } | null
  tabs: PersistedTabSession['tabs'] | null
  activeTabId: string | null
}

/**
 * 会话加载解析：lastActiveDocument 合法时照常恢复；缺失/blank/损坏时活动文档回退为 null，
 * 但不再丢弃整组合法的 tab 快照——persistLastActiveDocument 在活动文档置 blank 时
 * 仍照常写 tabs，加载端必须对等保留，否则 blank 活动文档会把快照白丢。
 */
export function resolveLoadedSessionState(
  lastActiveDocument: unknown,
  tabSession: PersistedTabSession | null,
): LoadedSessionState {
  if (
    lastActiveDocument
    && typeof lastActiveDocument === 'object'
    && (lastActiveDocument.kind === 'draft' || lastActiveDocument.kind === 'file')
    && typeof lastActiveDocument.filePath === 'string'
  ) {
    return {
      lastActiveDocument: {
        kind: lastActiveDocument.kind,
        filePath: lastActiveDocument.filePath,
        draftId: typeof lastActiveDocument.draftId === 'string' ? lastActiveDocument.draftId : null,
      },
      tabs: tabSession?.tabs ?? null,
      activeTabId: tabSession?.activeTabId ?? null,
    }
  }
  return {
    lastActiveDocument: null,
    tabs: tabSession?.tabs ?? null,
    activeTabId: tabSession?.activeTabId ?? null,
  }
}

// ---- 启动恢复决策（阶段 C ④：启动即「未命名」tab，分支可测化）----

export type StartupRestorePlan = 'tab-session' | 'draft' | 'blank'

/**
 * whenReady 启动分支的纯判定（副作用留在 index.ts，与「纯逻辑留 window-tabs.ts」的
 * 既有模式一致）。优先级链与既有 whenReady 分支序逐字等价，不改变任何行为：
 * 1. 开关开启且有有效整组 tab 快照 → 'tab-session'：整组恢复（含 blank tab——
 *    「退出时就是一个未命名 tab」的会话恢复结果与「启动即未命名」等价）；
 * 2. 上次活动文档是草稿且文件仍存在（existsSync 由调用方先算好传入）→ 'draft'；
 * 3. 否则 → 'blank'：全新「未命名文档」tab（阶段 C ④ 的目标语义）。
 * 上次活动文档是单文档 file 时现状即落 'blank'——旧格式遗留行为，阶段 C 不扩大也不收回。
 * 关键回退约束：开关关闭时即使盘上有快照也不返回 'tab-session'，保证关闭态与现状等价。
 */
export function decideStartupRestore(input: {
  tabsEnabled: boolean
  /** persistedSessionState.tabs 与 activeTabId 均有效（已过 resolveLoadedSessionState/parseTabSession 链路） */
  hasTabSession: boolean
  lastActiveDraftPath: string | null
}): StartupRestorePlan {
  if (input.tabsEnabled && input.hasTabSession) return 'tab-session'
  if (input.lastActiveDraftPath) return 'draft'
  return 'blank'
}
