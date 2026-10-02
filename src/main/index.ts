import { app, BrowserWindow, dialog, ipcMain, Menu, net, protocol, shell } from 'electron'
import { join, basename, dirname, extname, isAbsolute, relative } from 'path'
import { readFile, writeFile, readdir, copyFile, mkdir, rename, unlink, stat } from 'fs/promises'
import { FSWatcher, existsSync, readdirSync, watch } from 'fs'
import { pathToFileURL } from 'url'
import {
  clampSidebarWidth,
  createWindowSidebarViewState,
  filterMissingRecentFiles,
  getSidebarOpenForWindow,
  normalizeDrawerSidebarOpen,
  normalizeSidebarState,
  pushRecentFile,
  removeRecentFile,
  removeWorkspacePath,
  renameWorkspacePathInState,
  reorderWorkspacePaths,
  type PersistedSidebarState,
} from './sidebar-state'
import {
  createMaterializedDraftEntry,
  deriveDocumentTitle,
  deriveDraftDisplayTitle,
  isBlankDocumentContent,
  promoteDraftEntries,
  resolveManualDraftPath,
  sanitizeMarkdownFileStem,
  updateDraftEntryManualTitle,
  upsertDraftEntry,
  type DraftEntry,
} from './drafts'
import {
  consumeIgnoredWatchedContent,
  decideReactivatedTabSync,
  decideWatchEvent,
  isAlreadyHandledExternalContent,
  reconcileWatchedContent,
  recordIgnoredWatchedContent,
  watchTargetFile,
} from './file-sync'
import { DEFAULT_SHORTCUTS, DEFAULT_APP_SETTINGS, loadAppSettings, updateAppSettings, type AppSettings, type ShortcutAction } from './settings'
import { shouldPromptForFormalSave, shouldRemoveSourceAfterSaveAs } from './save-as'
import {
  applyDocumentAssetMoves,
  createImageAssetFileName,
  isSupportedImageMimeType,
  planDocumentAssetMigration,
  resolveDocumentAssetDirectoryPath,
} from './image-assets'
import { buildTitleSyncPath, decideTitleSync } from './title-sync'
import { flattenWorkdirTree, resolveNewWorkdirFolderPath, resolveNewWorkdirMarkdownPath, scanWorkdirTree, shouldRefreshWorkdirForWatchEvent, type WorkdirTreeNode } from './workdir'
import { moveFileToTrashAndVerify } from './file-removal'
import { summarizeAgentChange } from './agent-change-summary'
import { assessExternalChangeRisk } from './external-change-risk'
import { createDocumentJournal, describeJournalContent } from './document-journal'
import {
  clearCrashRecoveryState,
  clearExternalChangeRecoveryState,
  createDocumentRevisionKey,
  listRevisionSnapshots,
  moveDocumentRevisionSnapshots,
  readCrashRecoveryState,
  readExternalChangeRecoveryState,
  readRevisionSnapshotById,
  recordRevisionSnapshot,
  writeCrashRecoveryState,
  writeExternalChangeRecoveryState,
  type CrashRecoveryState,
  type ExternalChangeRecoveryState,
  type RevisionDocumentKind,
  type RevisionReason,
  type RevisionSnapshotInput,
  type StoredRevisionSnapshot,
} from './revision-store'
import {
  addTab,
  canWriteTabToPath,
  closeAllTabs,
  closeTabFromCollection,
  createInitialTabCollection,
  decideStartupRestore,
  detachTabWatch,
  findTabById,
  findTabByFilePath,
  getActiveTab,
  parseTabSession,
  reorderTabInCollection,
  resolveLoadedSessionState,
  resolveTabForSave,
  serializeTabSession,
  serializeTabsForRenderer,
  setActiveTab,
  snapshotTabUnsavedContent,
  tabContentForActivation,
  type PersistedTabSession,
  type TabCollection,
  type WindowTabState,
} from './window-tabs'
import { createSettingsWindowOptions, createWindowOptions } from './window-platform'
import { EDITABLE_FILE_FILTERS } from './file-extensions'
import { decideSecondInstanceAction, extractEditableLaunchPaths } from './windows-launch'
import { resolveZoomShortcut } from './zoom-shortcuts'
import {
  addWorkspacePath,
  DEFAULT_MAX_WORKSPACES,
  canTogglePinnedFile,
  migratePinnedDraftToFile,
  normalizeSidebarTab,
  removePinnedFile,
  replacePinnedFilePath,
  togglePinnedItem,
} from './workbench-state'
import {
  CODEX_MCP_SERVER_NAME,
  detectCodexCli,
  getCodexConfigPath,
  getMcpBridgeFilePath,
  installCodexMcpServer,
  isCodexMcpConfigured,
  removeCodexMcpServer,
  resolveSidecarScriptPath,
  type CodexIntegrationStatus,
} from './codex-integration'
import { createMcpBridgeController, type McpBridgeRequest } from './mcp-bridge'
import { completeAiHelperPrompt, testAiHelperConnection } from './ai-provider'
import { checkForUpdatesFromMenu, configureAutoUpdates, installDownloadedUpdate, setUpdateVersionSkipChecker, startUpdateDownload } from './updater'
import {
  isUpdateVersionSkipped,
  parseReleaseNoticeState,
  serializeReleaseNoticeState,
  shouldShowReleaseNoticeOnLaunch,
  withReleaseNoticeShown,
  withSkippedUpdateVersion,
  type ReleaseNoticeState,
} from './update-notice'
import { shouldPromptForInstalledBundleRefresh } from './runtime-update-guard'
import { LOCAL_MEDIA_PROTOCOL, localMediaUrlToAbsolutePath } from '../shared/local-media'

// Custom themes directory
const appDataDir = join(app.getPath('home'), '.lyramd')
// 被拦下的高风险外部变更，决策面「查看 diff」可展示的最大预览行数
const BLOCKED_DIFF_PREVIEW_LINES = 200
const documentJournalPath = join(appDataDir, 'document-journal.jsonl')
const documentJournal = createDocumentJournal(documentJournalPath, {
  appVersion: app.getVersion ? app.getVersion() : undefined,
})

function journalSaveEventType(reason: RevisionReason): 'autosave' | 'manual-save' | 'save-as' | 'rename' | 'image-checkpoint' {
  if (reason === 'autosave') return 'autosave'
  if (reason === 'save-as') return 'save-as'
  if (reason === 'rename') return 'rename'
  if (reason === 'image-checkpoint') return 'image-checkpoint'
  return 'manual-save'
}
const themesDir = join(appDataDir, 'themes')
const sidebarStatePath = join(appDataDir, 'sidebar-state.json')
const sessionStatePath = join(appDataDir, 'session-state.json')
const settingsPath = join(appDataDir, 'settings.json')
const releaseNoticePath = join(appDataDir, 'release-notice.json')
const revisionsDir = join(appDataDir, 'revisions')
const crashRecoveryStatePath = join(appDataDir, 'crash-recovery.json')
const externalChangeRecoveryStatePath = join(appDataDir, 'external-change-recovery.json')
const mcpBridgeFilePath = getMcpBridgeFilePath(appDataDir)
const DRAWER_BREAKPOINT = 960
const APP_BUNDLE_REFRESH_CHECK_INTERVAL_MS = 60_000
const appLaunchTimeMs = Date.now()

protocol.registerSchemesAsPrivileged([
  {
    scheme: LOCAL_MEDIA_PROTOCOL,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
    },
  },
])

type DocumentKind = 'blank' | 'draft' | 'file'

interface PersistedSessionState {
  lastActiveDocument: {
    kind: Exclude<DocumentKind, 'blank'>
    filePath: string
    draftId?: string | null
  } | null
  /** 阶段 A 会话恢复：上次退出的 tab 集合快照（含 blank），null 表示旧格式/无效 */
  tabs: PersistedTabSession['tabs'] | null
  activeTabId: string | null
}

interface SidebarSnapshot extends PersistedSidebarState {
  currentDocumentKind: DocumentKind
  currentFilePath: string | null
  currentDraftId: string | null
  currentDisplayTitle: string
  isDrawerMode: boolean
  workspaceTrees: Array<{ rootPath: string; tree: WorkdirTreeNode[] }>
}

let sidebarState: PersistedSidebarState = normalizeSidebarState(null)
let workdirWatchers: FSWatcher[] = []
let watchedWorkdirPaths: string[] = []
let workdirRefreshTimer: NodeJS.Timeout | null = null
let persistedSessionState: PersistedSessionState = {
  lastActiveDocument: null,
  tabs: null,
  activeTabId: null,
}
let appSettings: AppSettings = DEFAULT_APP_SETTINGS

async function ensureAppDataDir(): Promise<void> {
  await mkdir(appDataDir, { recursive: true })
}

async function ensureThemesDir(): Promise<void> {
  await mkdir(themesDir, { recursive: true })
}

async function scanCustomThemes(): Promise<string[]> {
  try {
    const files = await readdir(themesDir)
    return files.filter(f => f.endsWith('.css')).sort()
  } catch {
    return []
  }
}

function stopWatchingWorkdir(): void {
  if (workdirRefreshTimer) {
    clearTimeout(workdirRefreshTimer)
    workdirRefreshTimer = null
  }
  if (workdirWatchers.length > 0) {
    for (const watcher of workdirWatchers) {
      watcher.close()
    }
    workdirWatchers = []
  }
  watchedWorkdirPaths = []
}

function scheduleWorkdirRefresh(): void {
  if (workdirRefreshTimer) clearTimeout(workdirRefreshTimer)
  workdirRefreshTimer = setTimeout(() => {
    workdirRefreshTimer = null
    refreshWorkdirEntries()
      .then(() => {
        broadcastSidebarState()
      })
      .catch(() => {})
  }, 160)
}

function samePathList(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((pathValue, index) => pathValue === b[index])
}

function watchWorkdirPaths(workdirPaths: string[]): void {
  if (samePathList(watchedWorkdirPaths, workdirPaths)) return
  stopWatchingWorkdir()
  if (workdirPaths.length === 0) return

  const attachWatcher = (workdirPath: string, recursive: boolean): FSWatcher => watch(
    workdirPath,
    { recursive },
    (_eventType, fileName) => {
      if (!shouldRefreshWorkdirForWatchEvent(fileName)) return
      scheduleWorkdirRefresh()
    },
  )

  for (const workdirPath of workdirPaths) {
    try {
      workdirWatchers.push(attachWatcher(workdirPath, true))
    } catch {
      try {
        workdirWatchers.push(attachWatcher(workdirPath, false))
      } catch {
        continue
      }
    }
  }
  watchedWorkdirPaths = workdirPaths
}

async function refreshWorkdirEntries(): Promise<void> {
  const existingWorkspacePaths = sidebarState.workspacePaths.filter((workspacePath) => existsSync(workspacePath))
  const defaultWorkdirPath = sidebarState.workdirPath && existingWorkspacePaths.includes(sidebarState.workdirPath)
    ? sidebarState.workdirPath
    : existingWorkspacePaths[0] ?? null

  sidebarState.workspacePaths = existingWorkspacePaths
  sidebarState.workdirPath = defaultWorkdirPath
  watchWorkdirPaths(existingWorkspacePaths)

  sidebarState.expandedWorkspacePaths = sidebarState.expandedWorkspacePaths.filter((workspacePath) => existingWorkspacePaths.includes(workspacePath))
  const windows = BrowserWindow.getAllWindows()
  await Promise.all(windows.map((win) => refreshWorkdirEntriesForWindow(win)))
}

const workdirRefreshInFlight = new Map<number, Promise<void>>()

function refreshWorkdirEntriesForWindow(win: BrowserWindow): Promise<void> {
  // 同一窗口的并发刷新去重：启动期全局刷新与 did-finish-load 各触发一次，
  // 复用同一个 in-flight Promise，避免对同一工作区重复全量扫描。
  const inFlight = workdirRefreshInFlight.get(win.id)
  if (inFlight) return inFlight
  const task = doRefreshWorkdirEntriesForWindow(win).finally(() => {
    workdirRefreshInFlight.delete(win.id)
  })
  workdirRefreshInFlight.set(win.id, task)
  return task
}

async function doRefreshWorkdirEntriesForWindow(win: BrowserWindow): Promise<void> {
  const state = getState(win)
  const existingWorkspacePaths = sidebarState.workspacePaths.filter((workspacePath) => existsSync(workspacePath))
  const activeWorkdirPath = state.workdirPath && existingWorkspacePaths.includes(state.workdirPath)
    ? state.workdirPath
    : sidebarState.workdirPath && existingWorkspacePaths.includes(sidebarState.workdirPath)
      ? sidebarState.workdirPath
      : existingWorkspacePaths[0] ?? null

  state.workdirPath = activeWorkdirPath

  const expandedPaths = sidebarState.expandedWorkspacePaths
    .filter((workspacePath) => existingWorkspacePaths.includes(workspacePath))
  state.workspaceTrees = await Promise.all(expandedPaths.map(async (rootPath) => {
    try {
      return { rootPath, tree: await scanWorkdirTree(rootPath) }
    } catch {
      return { rootPath, tree: [] }
    }
  }))

}

let sidebarPersistQueue: Promise<void> = Promise.resolve()
let sidebarQuitFlushStarted = false

function persistSidebarState(): Promise<void> {
  const payload = JSON.stringify(sidebarState, null, 2)
  sidebarPersistQueue = sidebarPersistQueue
    .catch(() => {})
    .then(() => writeFile(sidebarStatePath, payload, 'utf-8'))
  return sidebarPersistQueue
}

function persistSessionState(): void {
  const payload = JSON.stringify(persistedSessionState, null, 2)
  writeFile(sessionStatePath, payload, 'utf-8').catch(() => {})
}

async function loadSidebarState(): Promise<void> {
  try {
    const raw = await readFile(sidebarStatePath, 'utf-8')
    sidebarState = normalizeSidebarState(JSON.parse(raw))
  } catch {
    sidebarState = normalizeSidebarState(null)
  }

  sidebarState.recentFiles = filterMissingRecentFiles(sidebarState.recentFiles, (filePath) => existsSync(filePath))
  sidebarState.draftEntries = sidebarState.draftEntries.filter((entry) => existsSync(entry.path))
  sidebarState.workspacePaths = sidebarState.workspacePaths.filter((workspacePath) => existsSync(workspacePath))
  sidebarState.expandedWorkspacePaths = sidebarState.expandedWorkspacePaths.filter((workspacePath) => sidebarState.workspacePaths.includes(workspacePath))
  await persistSidebarState()
  // 工作目录扫描不再阻塞启动链路：它是最重的启动 IO（递归遍历整个工作区），
  // 改由 app.whenReady 在首窗创建后后台执行（见 whenReady 内注释）。
}

async function loadSessionState(): Promise<void> {
  let lastActiveDocument: Partial<PersistedSessionState>['lastActiveDocument'] = null
  let tabSession: PersistedTabSession | null = null
  try {
    const raw = await readFile(sessionStatePath, 'utf-8')
    const parsed = JSON.parse(raw) as Partial<PersistedSessionState>
    lastActiveDocument = parsed.lastActiveDocument ?? null
    tabSession = parseTabSession({ tabs: parsed.tabs, activeTabId: parsed.activeTabId })
  } catch {
    // fall through to defaults
  }
  // 活动文档无效时仅回退 lastActiveDocument，不再连带丢弃整组合法 tab 快照。
  persistedSessionState = resolveLoadedSessionState(lastActiveDocument, tabSession)
}

async function loadSettingsState(): Promise<void> {
  appSettings = await loadAppSettings(settingsPath)
}

let releaseNoticeState: ReleaseNoticeState = { skippedVersion: null, lastShownVersion: null }

async function loadReleaseNoticeState(): Promise<void> {
  try {
    const raw = await readFile(releaseNoticePath, 'utf-8')
    releaseNoticeState = parseReleaseNoticeState(JSON.parse(raw))
  } catch {
    releaseNoticeState = { skippedVersion: null, lastShownVersion: null }
  }
  setUpdateVersionSkipChecker((version) => isUpdateVersionSkipped(releaseNoticeState, version))
}

function persistReleaseNoticeState(): Promise<void> {
  return writeFile(releaseNoticePath, serializeReleaseNoticeState(releaseNoticeState), 'utf-8').catch(() => {})
}

// 每个新版本安装后的首次启动，在主窗口内打开一次设置 surface 的「反馈与更新」面板。
async function maybeOpenReleaseNotesOnce(): Promise<void> {
  const currentVersion = app.getVersion()
  if (!shouldShowReleaseNoticeOnLaunch(releaseNoticeState, currentVersion)) return

  releaseNoticeState = withReleaseNoticeShown(releaseNoticeState, currentVersion)
  await persistReleaseNoticeState()
  const mainWin = BrowserWindow.getAllWindows().find((candidate) => {
    if (candidate.isDestroyed()) return false
    try {
      return !candidate.webContents.getURL().includes('settingsWindow=1')
    } catch {
      return false
    }
  })
  if (!mainWin) return
  mainWin.webContents.send('settings-open-pane', 'release-notes')
  if (mainWin.isMinimized()) mainWin.restore()
  mainWin.show()
  mainWin.focus()
}

// Per-window state
//
// 标签页阶段 A：单文档状态（documentKind/filePath/draftId/displayTitle/lastSyncedContent/
// ignoredWatchedContents/watcher/debounceTimer）迁入 per-window 的 tab 集合
// （WindowTabState + activeTabId，见 window-tabs.ts）。窗口级状态（侧边栏、
// 工作目录缓存、渲染层握手）仍留在窗口上。
//
// 下方 documentKind 等 getter/setter 把既有代码的 state.filePath 读写全部委托给活动 tab：
// 单 tab 时与旧的单文档 WindowState 行为逐字节等价；多 tab 的新文档通过 addTab 落入新标签。
interface WindowState {
  activeSidebarTab: PersistedSidebarState['activeSidebarTab']
  drawerSidebarOpen: boolean
  desktopSidebarOpen: boolean
  isDrawerMode: boolean
  tabs: TabCollection
  // 以下字段由 WindowStateImpl 的 getter/setter 委托给活动 tab（见上注释）
  readonly activeTab: WindowTabState
  documentKind: DocumentKind
  filePath: string | null
  draftId: string | null
  displayTitle: string
  lastSyncedContent: string | null
  readonly ignoredWatchedContents: Map<string, number>
  watcher: FSWatcher | null
  debounceTimer: ReturnType<typeof setTimeout> | null
  workdirPath: string | null
  workspaceTrees: Array<{ rootPath: string; tree: WorkdirTreeNode[] }>
  // 渲染层监听器就绪前到达的初始内容，先暂存，握手后再投递
  rendererReady: boolean
  pendingFileOpened: { path: string | null; content: string } | null
}

class WindowStateImpl implements WindowState {
  activeSidebarTab: PersistedSidebarState['activeSidebarTab']
  drawerSidebarOpen = false
  desktopSidebarOpen: boolean
  isDrawerMode = false
  tabs: TabCollection
  workdirPath: string | null
  workspaceTrees: Array<{ rootPath: string; tree: WorkdirTreeNode[] }> = []
  rendererReady = false
  pendingFileOpened: { path: string | null; content: string } | null = null

  constructor(sidebarViewState: { activeSidebarTab: PersistedSidebarState['activeSidebarTab']; workdirPath: string | null; desktopSidebarOpen: boolean }) {
    this.activeSidebarTab = sidebarViewState.activeSidebarTab
    this.desktopSidebarOpen = sidebarViewState.desktopSidebarOpen
    this.workdirPath = sidebarViewState.workdirPath
    this.tabs = createInitialTabCollection()
  }

  get activeTab(): WindowTabState {
    return getActiveTab(this.tabs)
  }

  get documentKind(): DocumentKind {
    return this.activeTab.documentKind
  }

  set documentKind(value: DocumentKind) {
    this.activeTab.documentKind = value
  }

  get filePath(): string | null {
    return this.activeTab.filePath
  }

  set filePath(value: string | null) {
    this.activeTab.filePath = value
  }

  get draftId(): string | null {
    return this.activeTab.draftId
  }

  set draftId(value: string | null) {
    this.activeTab.draftId = value
  }

  get displayTitle(): string {
    return this.activeTab.displayTitle
  }

  set displayTitle(value: string) {
    this.activeTab.displayTitle = value
  }

  get lastSyncedContent(): string | null {
    return this.activeTab.lastSyncedContent
  }

  set lastSyncedContent(value: string | null) {
    this.activeTab.lastSyncedContent = value
  }

  get ignoredWatchedContents(): Map<string, number> {
    return this.activeTab.ignoredWatchedContents
  }

  get watcher(): FSWatcher | null {
    return this.activeTab.watcher
  }

  set watcher(value: FSWatcher | null) {
    this.activeTab.watcher = value
  }

  get debounceTimer(): ReturnType<typeof setTimeout> | null {
    return this.activeTab.debounceTimer
  }

  set debounceTimer(value: ReturnType<typeof setTimeout> | null) {
    this.activeTab.debounceTimer = value
  }
}

const windowStates = new Map<number, WindowState>()
// 会话恢复进行中的窗口 id 集合：恢复序列可能正在逐条装载 tab，
// 此期间到达的 openFile 不得直写活动 tab（会顶掉恢复出的标签），退回空窗/新窗路径。
const sessionRestoreInFlightWindows = new Set<number>()
let settingsWindow: BrowserWindow | null = null
let pendingFilePaths: string[] = []
const hasSingleInstanceLock = app.isPackaged ? app.requestSingleInstanceLock() : true
let installedBundleRefreshPromptShown = false
let installedBundleRefreshCheckTimer: NodeJS.Timeout | null = null

function buildRevisionSnapshotFromWindowState(
  state: WindowState,
  content: string,
  reason: RevisionReason,
): RevisionSnapshotInput | null {
  if (state.documentKind === 'blank' || !state.filePath) return null

  return {
    content,
    displayTitle: state.displayTitle,
    documentKind: state.documentKind,
    draftId: state.draftId,
    filePath: state.filePath,
    reason,
    updatedAt: Date.now(),
  }
}

async function recordRevisionForWindowState(
  state: WindowState,
  content: string,
  reason: RevisionReason,
): Promise<void> {
  const snapshot = buildRevisionSnapshotFromWindowState(state, content, reason)
  if (!snapshot) return
  await recordManagedRevisionSnapshot(snapshot).catch(() => {})
}

// 版本快照按 tab 取字段而非 state 活动委托：saveToPath 早退分支里发起保存的 tab
// 可能已不是活动 tab，快照的 docPath 必须归属发起保存的那个 tab。
function buildRevisionSnapshotFromTab(
  tab: WindowTabState,
  content: string,
  reason: RevisionReason,
): RevisionSnapshotInput | null {
  if (tab.documentKind === 'blank' || !tab.filePath) return null

  return {
    content,
    displayTitle: tab.displayTitle,
    documentKind: tab.documentKind,
    draftId: tab.draftId,
    filePath: tab.filePath,
    reason,
    updatedAt: Date.now(),
  }
}

function getMaxRevisionsPerDocument(): number {
  return appSettings.documentSafety?.maxRevisionsPerDocument
    ?? DEFAULT_APP_SETTINGS.documentSafety.maxRevisionsPerDocument
}

function recordManagedRevisionSnapshot(snapshot: RevisionSnapshotInput): Promise<StoredRevisionSnapshot> {
  return recordRevisionSnapshot(revisionsDir, snapshot, getMaxRevisionsPerDocument())
}

function formatCrashReasonLabel(reason: string): string {
  if (reason === 'oom') return '内存不足'
  if (reason === 'crashed') return '渲染器崩溃'
  if (reason === 'killed') return '渲染器被终止'
  if (reason === 'abnormal-exit') return '异常退出'
  if (reason === 'launch-failed') return '启动失败'
  return '渲染器异常中断'
}

function formatRevisionReasonLabel(reason: RevisionReason): string {
  if (reason === 'autosave') return '自动保存'
  if (reason === 'save') return '手动保存'
  if (reason === 'save-as') return '另存为'
  if (reason === 'rename') return '重命名'
  if (reason === 'image-checkpoint') return '插图前检查点'
  if (reason === 'external-change') return '外部更新前备份'
  if (reason === 'crash') return '异常恢复点'
  if (reason === 'restore') return '从备份恢复'
  if (reason === 'tab-close') return '关闭标签前备份'
  return '本地备份'
}

function createRevisionSummary(
  snapshot: StoredRevisionSnapshot,
  previousSnapshot: StoredRevisionSnapshot | null,
) {
  return {
    changeSummary: previousSnapshot
      ? summarizeAgentChange(previousSnapshot.content, snapshot.content, {
        maxComparisonCells: 40000,
        maxPreviewLines: 3,
      })
      : null,
    displayTitle: snapshot.displayTitle,
    documentKind: snapshot.documentKind,
    id: snapshot.id,
    reason: formatRevisionReasonLabel(snapshot.reason),
    updatedAt: snapshot.updatedAt,
  }
}

function createCurrentDocumentRevisionKey(state: WindowState): string | null {
  if (state.documentKind === 'blank' || !state.filePath) return null
  return createDocumentRevisionKey({
    documentKind: state.documentKind,
    draftId: state.draftId,
    filePath: state.filePath,
  })
}

async function moveRevisionHistoryForDocument(
  source: {
    documentKind: RevisionDocumentKind
    draftId: string | null
    filePath: string | null
  },
  target: {
    documentKind: RevisionDocumentKind
    draftId: string | null
    filePath: string | null
  },
): Promise<void> {
  const sourceKey = createDocumentRevisionKey(source)
  const targetKey = createDocumentRevisionKey(target)
  await moveDocumentRevisionSnapshots(revisionsDir, sourceKey, targetKey).catch(() => {})
}

async function persistCrashRecoveryForWindowState(
  state: WindowState,
  reason: string,
): Promise<void> {
  if (state.documentKind === 'blank' || !state.filePath || state.lastSyncedContent === null) return

  const snapshot = await recordManagedRevisionSnapshot({
    content: state.lastSyncedContent,
    displayTitle: state.displayTitle,
    documentKind: state.documentKind,
    draftId: state.draftId,
    filePath: state.filePath,
    reason: 'crash',
    updatedAt: Date.now(),
  }).catch(() => null)
  if (!snapshot) return

  const recoveryState: CrashRecoveryState = {
    reason,
    snapshot,
    status: 'crashed',
    updatedAt: Date.now(),
  }
  await writeCrashRecoveryState(crashRecoveryStatePath, recoveryState).catch(() => {})
  void documentJournal.record({
    type: 'crash-recovery-generated',
    docPath: snapshot.filePath,
    draftId: snapshot.draftId,
    displayTitle: snapshot.displayTitle,
    source: 'internal',
    next: describeJournalContent(snapshot.content),
    detail: reason,
  })
}

async function persistExternalChangeRecoveryForWindowState(
  state: WindowState,
  reason: string,
  contentOverride: string | null = null,
): Promise<void> {
  const syncedContent = contentOverride ?? state.lastSyncedContent
  if (state.documentKind === 'blank' || !state.filePath || syncedContent === null) return

  const snapshot = await recordManagedRevisionSnapshot({
    content: syncedContent,
    displayTitle: state.displayTitle,
    documentKind: state.documentKind,
    draftId: state.draftId,
    filePath: state.filePath,
    reason: 'external-change',
    updatedAt: Date.now(),
  }).catch(() => null)
  if (!snapshot) return

  const recoveryState: ExternalChangeRecoveryState = {
    reason,
    snapshot,
    status: 'pending-external-change',
    updatedAt: Date.now(),
  }
  await writeExternalChangeRecoveryState(externalChangeRecoveryStatePath, recoveryState).catch(() => {})
}

interface RendererMcpRequestPayload {
  args?: Record<string, unknown>
  id: string
  type: string
}

interface RendererMcpResponsePayload {
  data?: unknown
  error?: string
  id: string
  success: boolean
}

interface PendingRendererMcpRequest {
  reject: (error: Error) => void
  resolve: (data: unknown) => void
  timeout: NodeJS.Timeout
  webContentsId: number
}

const pendingRendererMcpRequests = new Map<string, PendingRendererMcpRequest>()
let mcpRequestCounter = 0

const mcpBridge = createMcpBridgeController({
  bridgeFilePath: mcpBridgeFilePath,
  handleRequest: (request) => forwardMcpRequestToRenderer(request),
})

if (!hasSingleInstanceLock) {
  app.quit()
} else {
  app.on('second-instance', (_event, argv) => {
    handleSecondInstanceLaunch(argv)
  })
}

// 渲染层就绪握手：demo/速查等新窗口在 did-finish-load 推送 file-opened 时，
// 渲染层可能还没注册监听器，消息会丢（表现为弹出一个空白新窗口）。
// 渲染层完成监听注册后发 renderer-ready，主进程再补投暂存的初始内容。
function deliverFileOpenedPayload(win: BrowserWindow, payload: { path: string | null; content: string }): void {
  const state = getState(win)
  if (state.rendererReady && !win.isDestroyed()) {
    win.webContents.send('file-opened', payload)
    return
  }
  state.pendingFileOpened = payload
}

ipcMain.on('renderer-ready', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win) return
  const state = getState(win)
  state.rendererReady = true
  if (state.pendingFileOpened && !win.isDestroyed()) {
    win.webContents.send('file-opened', state.pendingFileOpened)
    state.pendingFileOpened = null
  }
  // 阶段 A 会话恢复：启动恢复路径会在渲染层注册监听器之前推送 tabs-state（消息丢失），
  // 握手时重推一次，保证标签条首帧集合不丢。
  sendTabsState(win)
})

function getState(win: BrowserWindow): WindowState {
  let state = windowStates.get(win.id)
  if (!state) {
    const sidebarViewState = createWindowSidebarViewState(sidebarState)
    state = new WindowStateImpl({
      activeSidebarTab: sidebarViewState.activeSidebarTab,
      workdirPath: sidebarViewState.workdirPath,
      desktopSidebarOpen: sidebarState.sidebarOpen,
    })
    windowStates.set(win.id, state)
  }
  return state
}

function getMcpTargetWindow(): BrowserWindow | null {
  const focused = BrowserWindow.getFocusedWindow()
  if (focused && !focused.isDestroyed()) return focused
  return BrowserWindow.getAllWindows().find((win) => !win.isDestroyed()) ?? null
}

function forwardMcpRequestToRenderer(request: McpBridgeRequest): Promise<unknown> {
  const win = getMcpTargetWindow()
  if (!win) return Promise.reject(new Error('No LyraMD window is available'))

  const id = `mcp_${++mcpRequestCounter}_${Date.now()}`
  const payload: RendererMcpRequestPayload = {
    id,
    type: request.type,
    args: request.args,
  }

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pendingRendererMcpRequests.delete(id)
      reject(new Error(`MCP renderer request timed out: ${request.type}`))
    }, 10000)

    pendingRendererMcpRequests.set(id, {
      reject,
      resolve,
      timeout,
      webContentsId: win.webContents.id,
    })
    win.webContents.send('mcp-document-request', payload)
  })
}

function getCodexIntegrationPaths() {
  return {
    bridgeFilePath: mcpBridgeFilePath,
    codexConfigPath: getCodexConfigPath(app.getPath('home')),
    sidecarScriptPath: resolveSidecarScriptPath({
      appPath: app.getAppPath(),
      isPackaged: app.isPackaged,
      resourcesPath: process.resourcesPath,
    }),
  }
}

async function resolveCodexIntegrationStatus(error: string | null = null): Promise<CodexIntegrationStatus> {
  const paths = getCodexIntegrationPaths()
  const bridgeStatus = mcpBridge.getStatus()
  const codex = await detectCodexCli()
  const codexMcpConfigured = await isCodexMcpConfigured(codex.command, paths.codexConfigPath)

  return {
    bridgeFilePath: paths.bridgeFilePath,
    bridgePort: bridgeStatus.port,
    bridgeRunning: bridgeStatus.running,
    codexCommand: codex.command,
    codexConfigPath: paths.codexConfigPath,
    codexInstalled: codex.command !== null,
    codexMcpConfigured,
    error,
    serverName: CODEX_MCP_SERVER_NAME,
    sidecarScriptPath: paths.sidecarScriptPath,
    version: codex.version,
  }
}

function getWinFromEvent(event: Electron.IpcMainInvokeEvent): BrowserWindow | null {
  return BrowserWindow.fromWebContents(event.sender)
}

function queuePendingFilePaths(filePaths: string[]): void {
  for (const filePath of filePaths) {
    if (!pendingFilePaths.includes(filePath)) {
      pendingFilePaths.push(filePath)
    }
  }
}

function focusFirstWindow(): void {
  const win = BrowserWindow.getAllWindows()[0]
  if (!win) return
  if (win.isMinimized()) win.restore()
  win.focus()
}

function openLaunchFilePath(filePath: string): void {
  if (app.isReady()) {
    openFile(filePath)
  } else {
    queuePendingFilePaths([filePath])
  }
}

function handleSecondInstanceLaunch(argv: string[]): void {
  const filePaths = extractEditableLaunchPaths(argv, { isPackaged: app.isPackaged })
  const action = decideSecondInstanceAction(filePaths)

  if (action.kind === 'open-files') {
    for (const filePath of action.filePaths) {
      openLaunchFilePath(filePath)
    }
    return
  }

  focusFirstWindow()
}

function isDrawerModeForWindow(win: BrowserWindow): boolean {
  return win.getBounds().width < DRAWER_BREAKPOINT
}

function createSidebarSnapshot(win: BrowserWindow): SidebarSnapshot {
  const state = getState(win)
  const drawerMode = isDrawerModeForWindow(win)
  const sidebarOpen = getSidebarOpenForWindow(
    sidebarState.sidebarOpen,
    drawerMode,
    state.drawerSidebarOpen,
    state.desktopSidebarOpen,
  )
  return {
    ...sidebarState,
    activeSidebarTab: state.activeSidebarTab,
    sidebarOpen,
    workdirPath: state.workdirPath,
    currentDocumentKind: state.documentKind,
    currentFilePath: state.filePath,
    currentDraftId: state.draftId,
    currentDisplayTitle: state.displayTitle,
    isDrawerMode: drawerMode,
    workspaceTrees: state.workspaceTrees,
  }
}

function sendSidebarState(win: BrowserWindow): void {
  const state = getState(win)
  const nextDrawerMode = isDrawerModeForWindow(win)
  state.drawerSidebarOpen = normalizeDrawerSidebarOpen(state.isDrawerMode, nextDrawerMode, state.drawerSidebarOpen)
  state.isDrawerMode = nextDrawerMode
  if (!win.isDestroyed()) {
    win.webContents.send('sidebar-state', createSidebarSnapshot(win))
  }
}

function broadcastSidebarState(): void {
  for (const win of BrowserWindow.getAllWindows()) {
    sendSidebarState(win)
  }
}

function broadcastSettingsState(): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('settings-updated', appSettings)
  }
}

function getDialogParentWindow(): BrowserWindow | undefined {
  return BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0] ?? undefined
}

async function checkForInstalledBundleRefresh(): Promise<void> {
  if (installedBundleRefreshPromptShown || !app.isPackaged) return

  const bundleStats = await stat(app.getAppPath()).catch(() => null)
  const shouldPrompt = shouldPromptForInstalledBundleRefresh({
    bundleMtimeMs: bundleStats?.mtimeMs ?? null,
    currentLaunchTimeMs: appLaunchTimeMs,
    isPackaged: app.isPackaged,
  })
  if (!shouldPrompt) return

  installedBundleRefreshPromptShown = true
  const result = await dialog.showMessageBox(getDialogParentWindow(), {
    type: 'warning',
    buttons: ['重启应用', '稍后'],
    defaultId: 0,
    cancelId: 1,
    message: 'LyraMD 安装包已更新',
    detail: '检测到磁盘上的 LyraMD 已被替换为较新的版本，但当前窗口仍在运行旧实例。请重启应用，让最新的文稿安全修复真正生效。',
  }).catch(() => null)

  if (result?.response === 0) {
    app.relaunch()
    app.exit(0)
  }
}

function scheduleInstalledBundleRefreshChecks(): void {
  if (!app.isPackaged || installedBundleRefreshCheckTimer) return

  installedBundleRefreshCheckTimer = setInterval(() => {
    void checkForInstalledBundleRefresh().catch(() => {})
  }, APP_BUNDLE_REFRESH_CHECK_INTERVAL_MS)

  void checkForInstalledBundleRefresh().catch(() => {})
}

function recordRecentFile(filePath: string): void {
  sidebarState.recentFiles = pushRecentFile(sidebarState.recentFiles, filePath)
  persistSidebarState()
}

function replaceRecentFilePath(previousPath: string, nextPath: string): void {
  sidebarState.recentFiles = sidebarState.recentFiles.map((entry) => (
    entry === previousPath ? nextPath : entry
  ))
  recordRecentFile(nextPath)
}

function getFileTitleOverride(filePath: string | null): string | null {
  if (!filePath) return null
  const override = sidebarState.fileTitleOverrides[filePath]
  return typeof override === 'string' && override.trim().length > 0 ? override : null
}

function setFileTitleOverride(filePath: string, nextTitle: string): void {
  const trimmedTitle = nextTitle.trim()
  if (!trimmedTitle) {
    delete sidebarState.fileTitleOverrides[filePath]
  } else {
    sidebarState.fileTitleOverrides[filePath] = trimmedTitle
  }
  persistSidebarState()
}

function moveFileTitleOverride(previousPath: string, nextPath: string): void {
  const override = getFileTitleOverride(previousPath)
  if (!override) return
  delete sidebarState.fileTitleOverrides[previousPath]
  sidebarState.fileTitleOverrides[nextPath] = override
  persistSidebarState()
}

function resolveFileDisplayTitle(filePath: string, content: string): string {
  return getFileTitleOverride(filePath) ?? deriveDocumentTitle(content, basename(filePath))
}

function resolveDraftDisplayTitle(draftId: string | null, content: string): string {
  return deriveDraftDisplayTitle(content, findDraftEntryById(draftId)?.manualTitle)
}

function isSupportedImageExtension(filePath: string): boolean {
  const extension = extname(filePath).toLowerCase()
  return extension === '.png'
    || extension === '.jpg'
    || extension === '.jpeg'
    || extension === '.webp'
    || extension === '.gif'
}

async function materializeBlankDocumentForImageAssets(win: BrowserWindow): Promise<SidebarSnapshot | null> {
  const state = getState(win)
  if (state.documentKind !== 'blank') return null

  const now = Date.now()
  const draftDirectoryPath = getEffectiveDraftDirectoryPath()
  await mkdir(draftDirectoryPath, { recursive: true })
  const draftEntry = createMaterializedDraftEntry({
    draftDirectoryPath,
    now,
    suffix: sidebarState.draftEntries.length + 1,
  })
  await writeFile(draftEntry.path, '', 'utf-8')
  sidebarState.draftEntries = [draftEntry, ...sidebarState.draftEntries]
  await persistSidebarState()
  setFileDocumentState(win, draftEntry.path, 'draft', draftEntry.id)
  state.lastSyncedContent = ''
  recordIgnoredWatchedContent(state.ignoredWatchedContents, '')
  broadcastSidebarState()
  return createSidebarSnapshot(win)
}

async function ensureDocumentPathForImageAssets(win: BrowserWindow): Promise<{
  markdownPath: string | null
  sidebarSnapshot: SidebarSnapshot | null
}> {
  const state = getState(win)
  if (state.documentKind !== 'blank' && state.filePath) {
    return {
      markdownPath: state.filePath,
      sidebarSnapshot: null,
    }
  }

  const sidebarSnapshot = await materializeBlankDocumentForImageAssets(win)
  return {
    markdownPath: getState(win).filePath,
    sidebarSnapshot,
  }
}

async function copyManagedDocumentAssets({
  sourcePath,
  targetPath,
  content,
}: {
  sourcePath: string | null
  targetPath: string
  content: string
}): Promise<{ content: string; assetMoves: Array<{ from: string; to: string }> }> {
  if (!sourcePath || sourcePath === targetPath) {
    return { content, assetMoves: [] }
  }

  const plan = planDocumentAssetMigration({
    sourceMarkdownPath: sourcePath,
    targetMarkdownPath: targetPath,
    markdown: content,
  })
  const existingAssetMoves = plan.assetMoves.filter((move) => existsSync(move.from))
  await applyDocumentAssetMoves({
    assetMoves: existingAssetMoves,
    mode: 'copy',
  })
  return {
    content: plan.markdown,
    assetMoves: existingAssetMoves,
  }
}

async function removeManagedDocumentAssetSources(assetMoves: Array<{ from: string; to: string }>): Promise<void> {
  for (const move of assetMoves) {
    if (!existsSync(move.from)) continue
    await unlink(move.from).catch(() => {})
  }
}

async function relocateManagedDocument({
  sourcePath,
  targetPath,
  content,
  removeSource,
}: {
  sourcePath: string
  targetPath: string
  content: string
  removeSource: boolean
}): Promise<string> {
  const migrated = await copyManagedDocumentAssets({
    sourcePath,
    targetPath,
    content,
  })
  await writeFile(targetPath, migrated.content, 'utf-8')
  if (!removeSource) return migrated.content

  await removeSourceFileAfterSaveAs(sourcePath)
  await removeManagedDocumentAssetSources(migrated.assetMoves)
  return migrated.content
}

async function persistImageAssetForWindow(
  win: BrowserWindow,
  payload: { bytes: Uint8Array; fileName: string; mimeType: string },
): Promise<{ absoluteImagePath: string; markdownImagePath: string; sidebarState: SidebarSnapshot | null } | null> {
  if (!isSupportedImageMimeType(payload.mimeType) && !isSupportedImageExtension(payload.fileName)) {
    return null
  }

  const { markdownPath, sidebarSnapshot } = await ensureDocumentPathForImageAssets(win)
  if (!markdownPath) return null
  const state = getState(win)
  if (state.lastSyncedContent !== null) {
    await recordRevisionForWindowState(state, state.lastSyncedContent, 'image-checkpoint')
  }

  const assetDirectoryPath = resolveDocumentAssetDirectoryPath(markdownPath)
  await mkdir(assetDirectoryPath, { recursive: true })
  const existingFileNames = existsSync(assetDirectoryPath)
    ? new Set(readdirSync(assetDirectoryPath))
    : new Set<string>()
  const fileName = createImageAssetFileName({
    originalName: payload.fileName,
    mimeType: payload.mimeType,
    now: Date.now(),
    existingFileNames,
  })
  const absoluteImagePath = join(assetDirectoryPath, fileName)
  await writeFile(absoluteImagePath, payload.bytes)

  return {
    absoluteImagePath,
    markdownImagePath: `./${basename(assetDirectoryPath)}/${fileName}`,
    sidebarState: sidebarSnapshot,
  }
}

async function readLocalImageAsDataUrl(imagePath: string): Promise<string | null> {
  if (!existsSync(imagePath) || !isSupportedImageExtension(imagePath)) return null

  const mimeType = ({
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
  } as const)[extname(imagePath).toLowerCase() as '.png' | '.jpg' | '.jpeg' | '.webp' | '.gif']
  if (!mimeType) return null

  const buffer = await readFile(imagePath)
  return `data:${mimeType};base64,${buffer.toString('base64')}`
}

async function getCrashRecoverySummary(): Promise<{
  displayTitle: string
  documentKind: RevisionSnapshotInput['documentKind']
  filePath: string | null
  hasContent: boolean
  reason: string
  updatedAt: number
} | null> {
  const recoveryState = await readCrashRecoveryState(crashRecoveryStatePath)
  if (!recoveryState) return null

  return {
    displayTitle: recoveryState.snapshot.displayTitle,
    documentKind: recoveryState.snapshot.documentKind,
    filePath: recoveryState.snapshot.filePath,
    hasContent: recoveryState.snapshot.content.trim().length > 0,
    reason: recoveryState.reason,
    updatedAt: recoveryState.updatedAt,
  }
}

async function getExternalChangeRecoverySummary(): Promise<{
  displayTitle: string
  documentKind: RevisionSnapshotInput['documentKind']
  filePath: string | null
  hasContent: boolean
  reason: string
  updatedAt: number
} | null> {
  const recoveryState = await readExternalChangeRecoveryState(externalChangeRecoveryStatePath)
  if (!recoveryState) return null

  return {
    displayTitle: recoveryState.snapshot.displayTitle,
    documentKind: recoveryState.snapshot.documentKind,
    filePath: recoveryState.snapshot.filePath,
    hasContent: recoveryState.snapshot.content.trim().length > 0,
    reason: recoveryState.reason,
    updatedAt: recoveryState.updatedAt,
  }
}

async function restoreRevisionSnapshotToDraft(
  triggerWin: BrowserWindow,
  snapshot: StoredRevisionSnapshot,
  reason: RevisionReason,
): Promise<boolean> {
  const draftDirectoryPath = getEffectiveDraftDirectoryPath()
  await mkdir(draftDirectoryPath, { recursive: true })
  const now = Date.now()
  const nextDraftState = upsertDraftEntry({
    entries: sidebarState.draftEntries,
    content: snapshot.content,
    draftDirectoryPath,
    now,
    suffix: sidebarState.draftEntries.length + 1,
  })
  const draftEntry = nextDraftState.draftEntry ?? createMaterializedDraftEntry({
    draftDirectoryPath,
    now,
    suffix: sidebarState.draftEntries.length + 1,
  })

  if (!nextDraftState.draftEntry) {
    sidebarState.draftEntries = [draftEntry, ...sidebarState.draftEntries]
  } else {
    sidebarState.draftEntries = nextDraftState.entries
  }
  await writeFile(draftEntry.path, snapshot.content, 'utf-8')
  await persistSidebarState()
  await recordManagedRevisionSnapshot({
    content: snapshot.content,
    displayTitle: draftEntry.displayTitle,
    documentKind: 'draft',
    draftId: draftEntry.id,
    filePath: draftEntry.path,
    reason,
    updatedAt: now,
  }).catch(() => {})

  const activeState = getState(triggerWin)
  const targetWin = activeState.documentKind === 'blank' && !activeState.filePath
    ? triggerWin
    : createWindowMatchingSize(triggerWin)
  await loadFileInWindow(targetWin, draftEntry.path, {
    documentKind: 'draft',
    draftId: draftEntry.id,
    recordRecent: false,
  })
  targetWin.focus()
  broadcastSidebarState()
  return true
}

async function restoreCrashRecoveryToDraft(triggerWin: BrowserWindow): Promise<boolean> {
  const recoveryState = await readCrashRecoveryState(crashRecoveryStatePath)
  if (!recoveryState) return false

  const restored = await restoreRevisionSnapshotToDraft(triggerWin, recoveryState.snapshot, 'crash')
  if (restored) {
    await clearCrashRecoveryState(crashRecoveryStatePath).catch(() => {})
    void documentJournal.record({
      type: 'crash-recovery-restored',
      docPath: recoveryState.snapshot.filePath,
      draftId: recoveryState.snapshot.draftId,
      displayTitle: recoveryState.snapshot.displayTitle,
      source: 'user',
      next: describeJournalContent(recoveryState.snapshot.content),
    })
  }
  return restored
}

async function restoreExternalChangeRecoveryToDraft(triggerWin: BrowserWindow): Promise<boolean> {
  const recoveryState = await readExternalChangeRecoveryState(externalChangeRecoveryStatePath)
  if (!recoveryState) return false

  const restored = await restoreRevisionSnapshotToDraft(triggerWin, recoveryState.snapshot, 'restore')
  if (restored) {
    await clearExternalChangeRecoveryState(externalChangeRecoveryStatePath).catch(() => {})
    void documentJournal.record({
      type: 'external-change-restored',
      docPath: recoveryState.snapshot.filePath,
      draftId: recoveryState.snapshot.draftId,
      displayTitle: recoveryState.snapshot.displayTitle,
      source: 'user',
      next: describeJournalContent(recoveryState.snapshot.content),
    })
  }
  return restored
}

async function listDocumentRevisionsForWindow(win: BrowserWindow): Promise<Array<{
  changeSummary: ReturnType<typeof summarizeAgentChange> | null
  displayTitle: string
  documentKind: RevisionDocumentKind
  id: string
  reason: string
  updatedAt: number
}>> {
  const state = getState(win)
  const documentKey = createCurrentDocumentRevisionKey(state)
  if (!documentKey) return []

  const snapshots = await listRevisionSnapshots(revisionsDir, documentKey).catch(() => [])
  return snapshots.map((snapshot, index) => createRevisionSummary(snapshot, snapshots[index + 1] ?? null))
}

async function restoreDocumentRevisionToDraft(triggerWin: BrowserWindow, revisionId: string): Promise<boolean> {
  const state = getState(triggerWin)
  const documentKey = createCurrentDocumentRevisionKey(state)
  if (!documentKey) return false

  const snapshot = await readRevisionSnapshotById(revisionsDir, documentKey, revisionId).catch(() => null)
  if (!snapshot) return false
  const restored = await restoreRevisionSnapshotToDraft(triggerWin, snapshot, 'restore')
  if (restored) {
    void documentJournal.record({
      type: 'revision-restored',
      docPath: state.filePath,
      draftId: state.draftId,
      displayTitle: snapshot.displayTitle,
      source: 'user',
      next: describeJournalContent(snapshot.content),
      detail: revisionId,
    })
  }
  return restored
}

async function openRevisionsDirectoryForWindow(win: BrowserWindow): Promise<boolean> {
  const state = getState(win)
  const documentKey = createCurrentDocumentRevisionKey(state)
  const targetPath = documentKey ? join(revisionsDir, documentKey) : revisionsDir
  await mkdir(targetPath, { recursive: true }).catch(() => {})
  const result = await shell.openPath(targetPath).catch(() => 'failed')
  return result === ''
}

function registerLocalMediaProtocol(): void {
  protocol.handle(LOCAL_MEDIA_PROTOCOL, async (request) => {
    const imagePath = localMediaUrlToAbsolutePath(request.url)
    if (!imagePath || !existsSync(imagePath) || !isSupportedImageExtension(imagePath)) {
      return new Response('Not Found', { status: 404 })
    }

    return net.fetch(pathToFileURL(imagePath).toString())
  })
}

async function renameCurrentFileToPath(win: BrowserWindow, nextPath: string): Promise<{ path: string | null }> {
  const state = getState(win)
  if (!state.filePath || state.documentKind !== 'file') return { path: null }

  const previousPath = state.filePath
  if (previousPath === nextPath) return { path: nextPath }
  if (existsSync(nextPath)) return { path: null }

  const currentDisplayTitle = state.displayTitle
  const currentContent = await readFile(previousPath, 'utf-8').catch(() => null)
  if (currentContent === null) return { path: null }
  await relocateManagedDocument({
    sourcePath: previousPath,
    targetPath: nextPath,
    content: currentContent,
    removeSource: true,
  })
  await moveRevisionHistoryForDocument(
    { documentKind: 'file', draftId: null, filePath: previousPath },
    { documentKind: 'file', draftId: null, filePath: nextPath },
  )
  moveFileTitleOverride(previousPath, nextPath)
  sidebarState.pinnedItems = replacePinnedFilePath(sidebarState.pinnedItems, previousPath, nextPath)
  await persistSidebarState()
  setFileDocumentState(win, nextPath, 'file', null)
  state.displayTitle = currentDisplayTitle
  state.lastSyncedContent = currentContent
  updateTitle(win)
  replaceRecentFilePath(previousPath, nextPath)
  await persistSidebarState()
  await recordRevisionForWindowState(state, currentContent, 'rename')
  if (isPathInsideAnyWorkspace(previousPath) || isPathInsideAnyWorkspace(nextPath)) {
    await refreshWorkdirEntries()
  }
  broadcastSidebarState()
  return { path: nextPath }
}

async function renameFormalFileByTitleForAllWindows(
  triggerWin: BrowserWindow,
  previousPath: string,
  nextTitle: string,
): Promise<SidebarSnapshot> {
  const trimmedTitle = nextTitle.trim()
  const nextPath = buildTitleSyncPath(previousPath, trimmedTitle)
  if (!trimmedTitle || !nextPath || previousPath === nextPath || !existsSync(previousPath) || existsSync(nextPath)) {
    return createSidebarSnapshot(triggerWin)
  }

  const draftEntry = sidebarState.draftEntries.find((entry) => entry.path === previousPath)
  if (draftEntry) {
    try {
      await applyManualDraftTitle(draftEntry, trimmedTitle)
      broadcastSidebarState()
    } catch {
      return createSidebarSnapshot(triggerWin)
    }
    return createSidebarSnapshot(triggerWin)
  }

  const displayTitle = basename(nextPath, extname(nextPath))
  const currentContent = await readFile(previousPath, 'utf-8').catch(() => null)
  if (currentContent === null) {
    return createSidebarSnapshot(triggerWin)
  }
  try {
    await relocateManagedDocument({
      sourcePath: previousPath,
      targetPath: nextPath,
      content: currentContent,
      removeSource: true,
    })
  } catch {
    return createSidebarSnapshot(triggerWin)
  }
  await moveRevisionHistoryForDocument(
    { documentKind: 'file', draftId: null, filePath: previousPath },
    { documentKind: 'file', draftId: null, filePath: nextPath },
  )

  delete sidebarState.fileTitleOverrides[previousPath]
  sidebarState.fileTitleOverrides[nextPath] = displayTitle
  sidebarState.pinnedItems = replacePinnedFilePath(sidebarState.pinnedItems, previousPath, nextPath)
  replaceRecentFilePath(previousPath, nextPath)
  await persistSidebarState()

  for (const window of BrowserWindow.getAllWindows()) {
    const state = getState(window)
    if (state.documentKind !== 'file' || state.filePath !== previousPath) continue
    setFileDocumentState(window, nextPath, 'file', null)
    state.displayTitle = displayTitle
    state.lastSyncedContent = currentContent
    updateTitle(window)
  }
  await recordManagedRevisionSnapshot({
    content: currentContent,
    displayTitle,
    documentKind: 'file',
    draftId: null,
    filePath: nextPath,
    reason: 'rename',
    updatedAt: Date.now(),
  }).catch(() => {})

  if (isPathInsideAnyWorkspace(previousPath) || isPathInsideAnyWorkspace(nextPath)) {
    await refreshWorkdirEntries()
  }

  broadcastSidebarState()
  return createSidebarSnapshot(triggerWin)
}

function updateDraftEntry(entry: DraftEntry): void {
  sidebarState.draftEntries = sidebarState.draftEntries.map((candidate) => (
    candidate.id === entry.id ? entry : candidate
  ))
  persistSidebarState()
}

function removeDraftEntry({ draftId, draftPath }: { draftId?: string | null; draftPath?: string | null }): void {
  sidebarState.draftEntries = promoteDraftEntries(sidebarState.draftEntries, { draftId, draftPath })
  persistSidebarState()
}

async function applyManualDraftTitle(draftEntry: DraftEntry, nextTitle: string): Promise<DraftEntry> {
  const trimmedTitle = nextTitle.trim()
  const previousPath = draftEntry.path
  const currentContent = await readFile(previousPath, 'utf-8').catch(() => '')
  const nextPath = resolveManualDraftPath(
    dirname(previousPath),
    trimmedTitle,
    (candidatePath) => candidatePath !== previousPath && existsSync(candidatePath),
  )

  if (nextPath !== previousPath) {
    await relocateManagedDocument({
      sourcePath: previousPath,
      targetPath: nextPath,
      content: currentContent,
      removeSource: true,
    })
  }

  const nextEntry = updateDraftEntryManualTitle(draftEntry, trimmedTitle, nextPath, Date.now())
  updateDraftEntry(nextEntry)

  for (const window of BrowserWindow.getAllWindows()) {
    const state = getState(window)
    const pointsAtDraft = state.documentKind === 'draft'
      && (state.draftId === draftEntry.id || state.filePath === previousPath)
    if (!pointsAtDraft) continue

    setFileDocumentState(window, nextEntry.path, 'draft', nextEntry.id)
    state.displayTitle = nextEntry.displayTitle
    updateTitle(window)
  }

  await recordManagedRevisionSnapshot({
    content: currentContent,
    displayTitle: nextEntry.displayTitle,
    documentKind: 'draft',
    draftId: nextEntry.id,
    filePath: nextEntry.path,
    reason: 'rename',
    updatedAt: Date.now(),
  }).catch(() => {})

  return nextEntry
}

function setBlankDocumentState(win: BrowserWindow): void {
  const state = getState(win)
  stopWatching(state)
  state.documentKind = 'blank'
  state.filePath = null
  state.draftId = null
  state.displayTitle = '未命名文档'
  state.lastSyncedContent = null
  state.ignoredWatchedContents.clear()
  updateTitle(win)
  persistLastActiveDocument(state)
}

function setFileDocumentState(win: BrowserWindow, filePath: string, documentKind: Exclude<DocumentKind, 'blank'>, draftId: string | null = null): void {
  const state = getState(win)
  const shouldRewatch = state.filePath !== filePath || state.watcher === null
  state.documentKind = documentKind
  state.filePath = filePath
  state.draftId = draftId
  state.displayTitle = documentKind === 'draft'
    ? findDraftEntryById(draftId)?.displayTitle ?? '未命名草稿'
    : getFileTitleOverride(filePath) ?? basename(filePath)
  if (shouldRewatch) {
    watchFile(win, state)
  }
  updateTitle(win)
  persistLastActiveDocument(state)
}

function isPathInsideDirectory(rootPath: string, filePath: string): boolean {
  const relativePath = relative(rootPath, filePath)
  return relativePath !== '' && !relativePath.startsWith('..') && !relativePath.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`)
}

function getWorkspaceRootForPath(filePath: string | null): string | null {
  if (!filePath) return null
  return sidebarState.workspacePaths.find((workspacePath) => isPathInsideDirectory(workspacePath, filePath)) ?? null
}

function isPathInsideAnyWorkspace(filePath: string): boolean {
  return getWorkspaceRootForPath(filePath) !== null
}

function resolveWorkdirCreationRoot(win: BrowserWindow): string | null {
  const state = getState(win)
  if (state.workdirPath && existsSync(state.workdirPath)) return state.workdirPath
  const currentRoot = getWorkspaceRootForPath(state.filePath)
  if (currentRoot && existsSync(currentRoot)) return currentRoot
  if (sidebarState.workdirPath && existsSync(sidebarState.workdirPath)) return sidebarState.workdirPath
  return sidebarState.workspacePaths.find((workspacePath) => existsSync(workspacePath)) ?? null
}

function createWindow(initialDocument?: { filePath: string; documentKind?: Exclude<DocumentKind, 'blank'>; draftId?: string | null }, initialContent?: string): BrowserWindow {
  const win = new BrowserWindow(createWindowOptions({
    platform: process.platform,
    preloadPath: join(__dirname, '../preload/index.js'),
  }))

  const state = getState(win)

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  win.webContents.setZoomLevel(0)
  win.webContents.on('before-input-event', (event, input) => {
    const action = resolveZoomShortcut({
      control: input.control,
      key: input.key,
      meta: input.meta,
      shift: input.shift,
    })
    if (action.kind === 'none') return

    event.preventDefault()
    win.webContents.setZoomLevel(0)
    if (action.kind === 'zoom-reset') {
      win.webContents.send('menu-zoom', { level: 0 })
      return
    }

    win.webContents.send('menu-zoom', { delta: action.kind === 'zoom-in' ? 1 : -1 })
  })

  win.webContents.on('did-finish-load', () => {
    win.webContents.setZoomLevel(0)
    refreshWorkdirEntriesForWindow(win)
      .then(() => sendSidebarState(win))
      .catch(() => sendSidebarState(win))
    if (initialDocument) {
      loadFileInWindow(win, initialDocument.filePath, {
        documentKind: initialDocument.documentKind,
        draftId: initialDocument.draftId,
        recordRecent: initialDocument.documentKind !== 'draft',
      })
    } else if (initialContent) {
      // 内存内容（如语法速查、新功能演示）——无文件、无 watcher、不进最近列表
      deliverFileOpenedPayload(win, { path: null, content: initialContent })
    }
  })

  win.webContents.on('render-process-gone', (_event, details) => {
    if (details.reason === 'clean-exit') return
    void persistCrashRecoveryForWindowState(state, formatCrashReasonLabel(details.reason))
  })

  win.on('closed', () => {
    // 门槛六：窗口关闭时每个 tab 都走 watcher/debounce 清理，不止活动 tab。
    closeAllTabs(state.tabs)
    windowStates.delete(win.id)
  })

  win.on('resize', () => {
    sendSidebarState(win)
  })

  updateTitle(win)
  return win
}

function createWindowMatchingSize(sourceWin: BrowserWindow | null): BrowserWindow {
  const nextWin = createWindow()
  if (sourceWin && !sourceWin.isDestroyed()) {
    const { width, height } = sourceWin.getBounds()
    nextWin.setSize(width, height)
  }
  return nextWin
}

// 帮助 > Markdown 语法速查 打开的内置模板
const cheatsheetPath = app.isPackaged
  ? join(process.resourcesPath, 'templates', 'cheatsheet.md')
  : join(__dirname, '../../resources/templates/cheatsheet.md')

async function openCheatsheet(): Promise<void> {
  try {
    const content = await readFile(cheatsheetPath, 'utf-8')
    createWindow(undefined, content)
  } catch {
    createWindow()
  }
}

// 帮助 > 新功能演示 打开的内置示例（内存副本，同语法速查）
const demoDir = app.isPackaged
  ? join(process.resourcesPath, 'demo')
  : join(__dirname, '../../resources/demo')

async function openDemo(fileName: string): Promise<void> {
  try {
    const content = await readFile(join(demoDir, fileName), 'utf-8')
    createWindow(undefined, content)
  } catch {
    createWindow()
  }
}

function buildSettingsWindowUrl(pane?: string): string {
  const params = new URLSearchParams({ settingsWindow: '1' })
  if (pane) params.set('pane', pane)
  return params.toString()
}

function loadSettingsWindow(win: BrowserWindow, pane?: string): void {
  const query = buildSettingsWindowUrl(pane)
  if (process.env.ELECTRON_RENDERER_URL) {
    const url = new URL(process.env.ELECTRON_RENDERER_URL)
    url.search = query
    win.loadURL(url.toString())
    return
  }
  win.loadFile(join(__dirname, '../renderer/index.html'), {
    query: Object.fromEntries(new URLSearchParams(query)),
  })
}

function openSettingsWindow(pane?: string): BrowserWindow {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    if (pane) settingsWindow.webContents.send('settings-open-pane', pane)
    settingsWindow.show()
    settingsWindow.focus()
    return settingsWindow
  }

  const win = new BrowserWindow(createSettingsWindowOptions({
    platform: process.platform,
    preloadPath: join(__dirname, '../preload/index.js'),
  }))
  settingsWindow = win
  loadSettingsWindow(win, pane)
  win.on('closed', () => {
    if (settingsWindow?.id === win.id) settingsWindow = null
  })
  return win
}

function findDraftEntryById(draftId: string | null): DraftEntry | null {
  if (!draftId) return null
  return sidebarState.draftEntries.find((entry) => entry.id === draftId) ?? null
}

function persistLastActiveDocument(state: WindowState): void {
  if (state.documentKind === 'blank' || !state.filePath) {
    persistedSessionState.lastActiveDocument = null
  } else {
    persistedSessionState.lastActiveDocument = {
      kind: state.documentKind,
      filePath: state.filePath,
      draftId: state.draftId,
    }
  }
  // 阶段 A 会话恢复：与 lastActiveDocument 合并写入当前窗口的 tab 集合快照（含 blank）。
  // 开关关闭时集合恒为单 tab，写入无害；恢复分支由 areTabsEnabled() 守卫。
  const tabSession = serializeTabSession(state.tabs)
  persistedSessionState.tabs = tabSession.tabs
  persistedSessionState.activeTabId = tabSession.activeTabId

  persistSessionState()
}

function defaultDraftDirectoryPath(): string {
  return join(app.getPath('documents'), 'LyraMD Drafts')
}

function registerDraftWorkspacePath(workspacePath: string): void {
  sidebarState.workspacePaths = [
    workspacePath,
    ...sidebarState.workspacePaths.filter((path) => path !== workspacePath),
  ].slice(0, DEFAULT_MAX_WORKSPACES)
  sidebarState.expandedWorkspacePaths = [...new Set([...sidebarState.expandedWorkspacePaths, workspacePath])]
}

function getEffectiveDraftDirectoryPath(): string {
  return sidebarState.draftDirectoryPath ?? defaultDraftDirectoryPath()
}

// 标签页已是唯一形态（设置项已随 2026-10 设置重构移除）；函数保留为守卫点，便于将来需要单文档模式时回退。
function areTabsEnabled(): boolean {
  return true
}

function sendTabsState(win: BrowserWindow): void {
  if (win.isDestroyed()) return
  const state = getState(win)
  win.webContents.send('tabs-state', {
    enabled: areTabsEnabled(),
    tabs: areTabsEnabled() ? serializeTabsForRenderer(state.tabs) : [],
  })
}

// 全窗口广播 tabs-state；只发给已建立过 WindowState 的主窗口（不绌始化设置窗等无状态窗口）。
function broadcastTabsState(): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed() && windowStates.has(win.id)) sendTabsState(win)
  }
}

function updateTitle(win: BrowserWindow): void {
  const state = getState(win)
  win.setTitle(`${state.displayTitle} — LyraMD`)
  // 标签条视图跟随文档状态（标题/未保存/集合）变化刷新；开关关闭时不打扰，
  // 卸载通知由 update-settings 的 broadcastTabsState 负责（问题 4）。
  if (areTabsEnabled()) sendTabsState(win)
}

function suggestFileName(win: BrowserWindow, content?: string): string | undefined {
  const state = getState(win)
  if (state.documentKind === 'draft') {
    return sanitizeMarkdownFileStem(
      state.displayTitle || (content ? deriveDocumentTitle(content, '未命名草稿') : '未命名草稿'),
    )
  }
  if (state.filePath) return basename(state.filePath, '.md')
  if (!content) return undefined
  // Extract first heading or first non-empty line
  const match = content.match(/^#\s+(.+)/m) || content.match(/^(.+)/m)
  if (!match) return undefined
  return match[1].trim().replace(/[/\\:*?"<>|]/g, '').slice(0, 60) || undefined
}

// Directory the file in this window lives in. Drafts are excluded on purpose:
// their side file sits in the drafts folder, so anchoring there would bury the
// formal file / export next to the draft instead of beside real notes.
function currentDocumentDirectory(win: BrowserWindow): string | undefined {
  const state = getState(win)
  if (state.documentKind !== 'file' || !state.filePath) return undefined
  return dirname(state.filePath)
}

// Save dialogs should open beside the currently edited Markdown file (upstream
// be065ea3). With no anchor directory, Electron keeps its platform default
// (typically ~/Documents) and only uses the suggested name.
function suggestSavePath(win: BrowserWindow, fileName?: string): string | undefined {
  const name = fileName ?? suggestFileName(win)
  if (!name) return undefined
  return join(currentDocumentDirectory(win) ?? '', name)
}

function stopWatching(state: WindowState): void {
  if (state.watcher) {
    state.watcher.close()
    state.watcher = null
  }
  if (state.debounceTimer) {
    clearTimeout(state.debounceTimer)
    state.debounceTimer = null
  }
}

function watchFile(win: BrowserWindow, state: WindowState): void {
  if (!state.filePath) return
  stopWatching(state)
  const filePath = state.filePath
  // watcher 只挂在活动 tab 上；捕获发起 watch 的 tab，
  // debounce 回调发现活动 tab 已切走时直接作废本次事件（门槛二/三的隔离保证）。
  const watchedTab = state.activeTab
  state.watcher = watchTargetFile(filePath, (eventType) => {
    const watchDecision = decideWatchEvent(eventType)
    if (!watchDecision.shouldReadFile) return

    if (state.debounceTimer) clearTimeout(state.debounceTimer)
    state.debounceTimer = setTimeout(() => {
      readFile(filePath, 'utf-8')
        .then((data) => {
          handleExternalFileContent(win, state, watchedTab, data)
        })
        .catch(() => {})
    }, 100)
  })
}

// 外部变更对账的唯一决策路径：watcher 事件与 tab 重新激活后的磁盘补读都收敛到这里，
// 保证「低风险自动采纳 / 高风险 blockedDestructiveApply 决策面」语义一致（门槛四/五）。
// 目标 tab 显式传参而非读 state 活动委托字段：补读是异步的，期间活动 tab 可能再次切走，
// 字段必须归属发起读取的那个 tab。
function handleExternalFileContent(
  win: BrowserWindow,
  state: WindowState,
  tab: WindowTabState,
  data: string,
  options: { forceDecision?: boolean; suppressContentApply?: boolean } = {},
): void {
  if (state.activeTab !== tab) return
  if (consumeIgnoredWatchedContent(tab.ignoredWatchedContents, data)) return
  // 被拦决策面去重：同一次磁盘内容且基线未推进（用户既没接受也没改本地）时，
  // watcher 重放 / 反复切换补读不再重复弹决策面；基线一变即重新对账。
  if (isAlreadyHandledExternalContent(tab.handledExternalContent, data, tab.lastSyncedContent)) return
  const previousContent = tab.lastSyncedContent ?? ''
  const syncDecision = reconcileWatchedContent(tab.lastSyncedContent, data)
  if (!syncDecision.shouldPropagate) return
  if (previousContent !== data && previousContent.length > 0) {
    void recordRevisionForWindowState(state, previousContent, 'external-change')
  }
  const changeSummary = summarizeAgentChange(previousContent, data)
  const changeRisk = assessExternalChangeRisk(previousContent, data, changeSummary)
  // forceDecision：该 tab 带未保存编辑的补读，外部内容不允许静默采纳，低风险也升级为决策面。
  const blockedDestructiveApply = (changeRisk.isDestructive || options.forceDecision === true) && previousContent.length > 0
  if (previousContent !== data) {
    void documentJournal.record({
      type: blockedDestructiveApply ? 'external-change-blocked' : 'external-change-detected',
      docPath: tab.filePath,
      draftId: tab.draftId,
      displayTitle: tab.displayTitle,
      source: 'external',
      risk: { isDestructive: changeRisk.isDestructive, reason: changeRisk.reason },
      previous: describeJournalContent(previousContent),
      next: describeJournalContent(data),
    })
  }
  if (blockedDestructiveApply) {
    // 被拦时快照的是外部变更前的本地基线；传参而非展开 state——
    // WindowState 是带原型 getter 的类实例，对象展开会丢失按 tab 委托的字段。
    tab.handledExternalContent = { diskContent: data, baseline: previousContent }
    void persistExternalChangeRecoveryForWindowState(state, changeRisk.reason ?? 'external-change', previousContent)
  } else {
    tab.lastSyncedContent = syncDecision.nextSyncedContent
  }

  if (!blockedDestructiveApply && tab.documentKind === 'draft' && tab.draftId) {
    const nextEntry = findDraftEntryById(tab.draftId)
    if (nextEntry) {
      updateDraftEntry({
        ...nextEntry,
        updatedAt: Date.now(),
        displayTitle: deriveDraftDisplayTitle(data, nextEntry.manualTitle),
      })
      tab.displayTitle = resolveDraftDisplayTitle(tab.draftId, data)
      updateTitle(win)
    }
  } else if (!blockedDestructiveApply && tab.documentKind === 'file' && tab.filePath) {
    tab.displayTitle = resolveFileDisplayTitle(tab.filePath, data)
    updateTitle(win)
  }
  if (!win.isDestroyed()) {
    win.webContents.send('agent-change-summary', {
      applyBlocked: blockedDestructiveApply,
      previousContent,
      summary: changeSummary,
      risk: changeRisk,
      // 被拦下时额外带一份更完整的 diff 预览，供「查看 diff」决策面使用
      ...(blockedDestructiveApply
        ? { fullSummary: summarizeAgentChange(previousContent, data, { maxPreviewLines: BLOCKED_DIFF_PREVIEW_LINES }) }
        : {}),
    })
  }
  // suppressContentApply（带未保存编辑的补读）：正常场景跳过 file-changed 投递以免覆盖
  // 渲染层内容。但渲染层对 agent-change-summary 的唯一消费点是 onFileChanged →
  // processIncomingDocumentContent，因此 blockedDestructiveApply 时必须补发一份
  // file-changed(previousContent)（与非 suppress blocked 路径同形）：渲染层对
  // applyBlocked 载荷走决策面，不落盘也不覆盖未保存内容，否则决策面永远到不了用户眼前。
  if (!win.isDestroyed() && (options.suppressContentApply !== true || blockedDestructiveApply)) {
    win.webContents.send('file-changed', blockedDestructiveApply ? previousContent : data)
  }
  if (!win.isDestroyed()) sendSidebarState(win)
}

async function loadFileInWindow(
  win: BrowserWindow,
  filePath: string,
  options: { documentKind?: Exclude<DocumentKind, 'blank'>; draftId?: string | null; recordRecent?: boolean } = {},
): Promise<boolean> {
  try {
    const data = await readFile(filePath, 'utf-8')
    const documentKind = options.documentKind ?? 'file'
    setFileDocumentState(win, filePath, documentKind, options.draftId ?? null)
    const state = getState(win)
    state.lastSyncedContent = data
    state.displayTitle = documentKind === 'draft'
      ? resolveDraftDisplayTitle(options.draftId ?? null, data)
      : resolveFileDisplayTitle(filePath, data)
    state.ignoredWatchedContents.clear()
    if (options.recordRecent !== false && documentKind === 'file') {
      recordRecentFile(filePath)
    }
    deliverFileOpenedPayload(win, { path: filePath, content: data })
    broadcastSidebarState()
    return true
  } catch {
    if (options.documentKind === 'draft') {
      removeDraftEntry({ draftId: options.draftId, draftPath: filePath })
    }
    sidebarState.recentFiles = filterMissingRecentFiles(sidebarState.recentFiles, (candidate) => existsSync(candidate))
    persistSidebarState()
    broadcastSidebarState()
    return false
  }
}

// Find window that already has this file open
function findWindowForFile(filePath: string): BrowserWindow | null {
  for (const [id, state] of windowStates) {
    if (state.filePath === filePath) {
      return BrowserWindow.fromId(id) || null
    }
  }
  return null
}

// 激活窗口内的某个 tab（阶段 A 的 tab 切换入口）。
// editorContentSnapshot 来自渲染层切走前的编辑器内容，用于把未保存编辑快照回原 tab。
function activateTabInWindow(win: BrowserWindow, tabId: string, editorContentSnapshot?: string): boolean {
  const state = getState(win)
  const tab = findTabById(state.tabs, tabId)
  if (!tab) return false
  const previousTab = state.activeTab
  if (previousTab.id === tabId) return true

  if (typeof editorContentSnapshot === 'string') {
    snapshotTabUnsavedContent(previousTab, editorContentSnapshot)
  }
  detachTabWatch(previousTab)
  setActiveTab(state.tabs, tabId)
  // state 现在委托到新活动 tab；watchFile 会为它挂 watcher
  watchFile(win, state)
  // 门槛五：watcher 在 tab 切走期间被卸载，fs.watch 重挂不会回放历史事件。
  // 重新激活后补读一次磁盘：内容与该 tab 基线一致则无事；不一致则走与 watcher
  // 事件完全相同的外部变更对账路径（低风险自动采纳 / 高风险 blocked 决策面），
  // 杜绝「切走期间外部修改永久漏检 → 切回 stale → autosave 静默覆盖外部修改」。
  if (tab.filePath) {
    const reactivatedTab = tab
    readFile(tab.filePath, 'utf-8')
      .then((data) => {
        const reactivationDecision = decideReactivatedTabSync(
          reactivatedTab.lastSyncedContent,
          reactivatedTab.ignoredWatchedContents,
          data,
        )
        if (!reactivationDecision.shouldHandleExternalChange) return
        // 该 tab 带未保存编辑时，外部内容不能直接投递进编辑器：升级为决策面——
        // forceDecision 让低风险变更也走 blocked 分支，suppressContentApply 跳过 file-changed。
        handleExternalFileContent(
          win,
          state,
          reactivatedTab,
          data,
          reactivatedTab.unsavedContent !== null
            ? { forceDecision: true, suppressContentApply: true }
            : undefined,
        )
      })
      .catch(() => {})
  }
  updateTitle(win)
  deliverFileOpenedPayload(win, { path: tab.filePath, content: tabContentForActivation(tab) })
  persistLastActiveDocument(state)
  sendSidebarState(win)
  sendTabsState(win)
  return true
}

// ⌘T / 新开文档落新 tab：在当前窗口追加一个空白 tab 并激活。
function createTabInWindow(win: BrowserWindow, editorContentSnapshot?: string): boolean {
  if (!areTabsEnabled()) return false
  const state = getState(win)
  const previousTab = state.activeTab
  if (typeof editorContentSnapshot === 'string') {
    snapshotTabUnsavedContent(previousTab, editorContentSnapshot)
  }
  // 原活动 tab 转为非活动：先卸 watcher/debounce，避免旧事件落到新活动 tab（门槛二/三）
  detachTabWatch(previousTab)
  addTab(state.tabs)
  updateTitle(win)
  deliverFileOpenedPayload(win, { path: null, content: '' })
  persistLastActiveDocument(state)
  sendSidebarState(win)
  return true
}

// 关闭 tab 前由渲染层 flush 活动文档并回传正文；若快照仍脏，必须明确确认丢弃。
// 关闭当前 tab 时优先切到右侧相邻项，最后一个 tab 则替换为全新 blank tab。
async function closeTabInWindow(win: BrowserWindow, tabId: string, editorContentSnapshot?: string): Promise<boolean> {
  if (!areTabsEnabled()) return false
  const state = getState(win)
  const target = findTabById(state.tabs, tabId)
  if (!target) return false
  if (typeof editorContentSnapshot === 'string') {
    snapshotTabUnsavedContent(state.activeTab, editorContentSnapshot)
  }

  if (target.unsavedContent !== null) {
    const { response } = await dialog.showMessageBox(win, {
      type: 'warning',
      title: '关闭未保存的标签？',
      message: `“${target.displayTitle || '未命名文档'}”仍有未保存内容。`,
      detail: '关闭标签会丢弃这部分内容。要保留文稿，请取消并先确认保存状态。',
      buttons: ['取消', '丢弃并关闭'],
      defaultId: 0,
      cancelId: 0,
    })
    if (response !== 1) {
      sendTabsState(win)
      return false
    }
    // 用户确认丢弃：先把未保存正文留一份本地备份（不弹提醒，恢复入口在「文稿安全」里）
    await recordManagedRevisionSnapshot({
      content: target.unsavedContent,
      displayTitle: target.displayTitle || '未命名文档',
      documentKind: target.documentKind,
      draftId: target.draftId,
      filePath: target.filePath,
      reason: 'tab-close',
    }).catch(() => {})
  }

  const wasActive = state.tabs.activeTabId === tabId
  if (wasActive && state.tabs.tabs.length > 1) {
    const index = state.tabs.tabs.findIndex((tab) => tab.id === tabId)
    const nextTab = state.tabs.tabs[index + 1] ?? state.tabs.tabs[index - 1]
    if (!nextTab || !activateTabInWindow(win, nextTab.id)) return false
  }

  const result = closeTabFromCollection(state.tabs, tabId)
  if (!result) return false
  detachTabWatch(result.closedTab)

  if (result.replacedLastTab) {
    updateTitle(win)
    deliverFileOpenedPayload(win, { path: null, content: '' })
  }
  persistLastActiveDocument(state)
  sendSidebarState(win)
  sendTabsState(win)
  return true
}

// 阶段 A 会话恢复：启动时把上次退出的 tab 集合恢复进首窗。
// 首条目复用窗口创建时的初始空白 tab，其余条目 detachTabWatch + addTab + loadFileInWindow——
// 内容投递与 watcher 挂载全部走 A1 既有路径（file-opened 握手补投、watcher 只挂活动 tab）。
// 文件已不存在的条目直接跳过；最后按 activeTabId 激活，激活复用 activateTabInWindow
// （含磁盘补读对账），保证编辑器最终显示的是活动 tab 的内容而非最后加载的那一个。
async function restoreSessionTabsInWindow(win: BrowserWindow, session: PersistedTabSession): Promise<void> {
  const state = getState(win)
  const restoredTabs = new Map<string, WindowTabState>()
  sessionRestoreInFlightWindows.add(win.id)
  try {
    for (const [index, entry] of session.tabs.entries()) {
      if (index === 0) {
        // 首条目复用初始空白 tab，避免多出一个永不使用的空 tab
        restoredTabs.set(entry.id, state.activeTab)
        if (entry.kind === 'blank' || entry.filePath === null || !existsSync(entry.filePath)) continue
        await loadFileInWindow(win, entry.filePath, {
          documentKind: entry.kind,
          draftId: entry.draftId,
          recordRecent: false,
        })
        continue
      }
      if (entry.kind !== 'blank' && (entry.filePath === null || !existsSync(entry.filePath))) continue
      // 原活动 tab 转为非活动：先卸 watcher/debounce，再落新 tab（门槛二/三）
      detachTabWatch(state.activeTab)
      restoredTabs.set(entry.id, addTab(state.tabs))
      if (entry.kind === 'blank') continue
      await loadFileInWindow(win, entry.filePath, {
        documentKind: entry.kind,
        draftId: entry.draftId,
        recordRecent: false,
      })
    }

    const targetTab = restoredTabs.get(session.activeTabId) ?? null
    if (targetTab && targetTab.id !== state.tabs.activeTabId) {
      activateTabInWindow(win, targetTab.id)
    }
  } finally {
    sessionRestoreInFlightWindows.delete(win.id)
    sendTabsState(win)
  }
}

// Open file: reuse existing window or create new one
function openFile(filePath: string, targetWin?: BrowserWindow | null): void {
  // 已在某窗口（含非活动 tab）打开：聚焦并切到对应 tab
  for (const [id, state] of windowStates) {
    const tab = findTabByFilePath(state.tabs, filePath)
    if (!tab) continue
    const win = BrowserWindow.fromId(id)
    if (!win) continue
    recordRecentFile(filePath)
    broadcastSidebarState()
    if (state.tabs.activeTabId === tab.id) {
      win.focus()
      return
    }
    if (areTabsEnabled() && state.rendererReady) {
      // 让渲染层先 flush 未保存编辑，再带快照回来切换，避免丢编辑
      win.webContents.send('tab-activate-request', tab.id)
    } else {
      activateTabInWindow(win, tab.id)
    }
    win.focus()
    return
  }

  if (areTabsEnabled()) {
    const hostWin = targetWin && !targetWin.isDestroyed()
      ? targetWin
      : getFocusedWindow() ?? BrowserWindow.getAllWindows().find((candidate) => !candidate.isDestroyed()) ?? null
    if (hostWin) {
      if (getState(hostWin).rendererReady) {
        // 开启标签页且宿主窗口就绪：渲染层 flush 后通过 tabs-open-document 落新 tab
        hostWin.webContents.send('tab-open-request', { filePath, documentKind: null, draftId: null })
        hostWin.focus()
        return
      }
      // 阶段 C：宿主存在但渲染层未 ready 时不再退到空窗复用/新窗口——直接落宿主活动 tab。
      // file-opened 载荷由 pendingFileOpened 缓冲，renderer-ready 握手后补投，无需渲染层配合。
      // 安全依赖（本兑底仅限此精确分支，不得推广到 ready 路径）：未 ready ⇒ 渲染层
      // 尚未注册任何监听 ⇒ 不可能有在途未保存编辑，改写活动 tab 不会丢编辑。
      // 例外：会话恢复进行中不兑底——恢复序列正在逐条装载 tab，直写活动 tab 会
      // 顶掉恢复出的标签；落到下方空窗复用/新窗口的既有路径。
      if (!sessionRestoreInFlightWindows.has(hostWin.id)) {
        void loadFileInWindow(hostWin, filePath)
        hostWin.focus()
        return
      }
    }
  }

  // 未开启标签页：保持既有行为——空窗复用 / 新窗口
  const emptyWin = findEmptyWindow()
  if (emptyWin) {
    loadFileInWindow(emptyWin, filePath)
    emptyWin.focus()
    return
  }

  // Create new window
  const win = createWindow({ filePath, documentKind: 'file' })
  win.focus()
}

function findEmptyWindow(): BrowserWindow | null {
  for (const [id, state] of windowStates) {
    if (!state.filePath) {
      return BrowserWindow.fromId(id) || null
    }
  }
  return null
}

async function saveToPath(
  win: BrowserWindow,
  filePath: string,
  content: string,
  reason: RevisionReason = 'save',
): Promise<boolean> {
  const state = getState(win)
  // 保存目标 tab 在进入时锁定：写盘期间用户切走 tab，结果只写回发起保存的 tab，
  // 绝不触碰新活动 tab（门槛二/三：不把 A 文档内容写进 B 的路径）。
  const saveTabId = state.tabs.activeTabId
  const saveTabAtEntry = resolveTabForSave(state.tabs, saveTabId)
  // 门槛二：非另存为场景，目标路径必须与发起保存 tab 的路径一致（canWriteTabToPath），
  // 不一致直接拒绝写盘，避免把内容写进别的文档；另存为的目标路径本来就是新的，跳过校验。
  if (saveTabAtEntry && reason !== 'save-as' && !canWriteTabToPath(saveTabAtEntry, filePath)) {
    return false
  }
  try {
    const previousFilePath = state.filePath
    const previousDisplayTitle = state.displayTitle
    const previousContentForJournal = state.lastSyncedContent
    await writeFile(filePath, content, 'utf-8')
    const saveTab = resolveTabForSave(state.tabs, saveTabId)
    if (!saveTab || state.tabs.activeTabId !== saveTabId) {
      if (saveTab) {
        saveTab.lastSyncedContent = content
        recordIgnoredWatchedContent(saveTab.ignoredWatchedContents, content)
        // 早退分支同样补版本 + journal：docPath 用发起保存 tab 的路径（问题 2）。
        const snapshot = buildRevisionSnapshotFromTab(saveTab, content, reason)
        if (snapshot) {
          await recordManagedRevisionSnapshot(snapshot).catch(() => {})
        }
        void documentJournal.record({
          type: journalSaveEventType(reason),
          docPath: saveTab.filePath,
          draftId: saveTab.draftId,
          displayTitle: saveTab.displayTitle,
          source: 'internal',
          previous: previousContentForJournal === null ? null : describeJournalContent(previousContentForJournal),
          next: describeJournalContent(content),
        })
      }
      return true
    }
    recordIgnoredWatchedContent(state.ignoredWatchedContents, content)
    state.lastSyncedContent = content
    setFileDocumentState(win, filePath, state.documentKind === 'draft' ? 'draft' : 'file', state.draftId)
    state.displayTitle = state.documentKind === 'draft'
      ? resolveDraftDisplayTitle(state.draftId, content)
      : resolveFileDisplayTitle(filePath, content)
    updateTitle(win)
    if (state.documentKind === 'draft' && state.draftId) {
      const existingEntry = findDraftEntryById(state.draftId)
      if (existingEntry) {
        updateDraftEntry({
          ...existingEntry,
          updatedAt: Date.now(),
          displayTitle: deriveDraftDisplayTitle(content, existingEntry.manualTitle),
        })
      }
    } else {
      recordRecentFile(filePath)
    }
    if (state.documentKind === 'file' && previousFilePath) {
      const syncDecision = decideTitleSync({
        mode: appSettings.titleSyncMode,
        filePath: previousFilePath,
        previousTitle: previousDisplayTitle,
        nextTitle: state.displayTitle,
      })

      if (syncDecision.shouldRename && syncDecision.nextPath && syncDecision.nextPath !== previousFilePath) {
        const renameResult = await renameCurrentFileToPath(win, syncDecision.nextPath)
        if (renameResult.path) {
          state.lastSyncedContent = content
        }
      }
    }
    if (isPathInsideAnyWorkspace(filePath)) {
      await refreshWorkdirEntries()
    }
    if (state.filePath && state.filePath !== filePath && isPathInsideAnyWorkspace(state.filePath)) {
      await refreshWorkdirEntries()
    }
    await recordRevisionForWindowState(state, content, reason)
    void documentJournal.record({
      type: journalSaveEventType(reason),
      docPath: filePath,
      draftId: state.draftId,
      displayTitle: state.displayTitle,
      source: 'internal',
      previous: previousContentForJournal === null ? null : describeJournalContent(previousContentForJournal),
      next: describeJournalContent(content),
    })
    broadcastSidebarState()
    return true
  } catch {
    return false
  }
}

async function removeSourceFileAfterSaveAs(sourcePath: string): Promise<void> {
  await unlink(sourcePath).catch(async () => {
    await shell.trashItem(sourcePath)
    if (existsSync(sourcePath)) {
      throw new Error('save-as-source-cleanup-failed')
    }
  })
}

async function saveFileAsForWindow(win: BrowserWindow, nextPath: string, content: string): Promise<boolean> {
  const state = getState(win)
  const sourcePath = state.filePath
  const sourceDraftId = state.draftId
  const previousDocumentKind = state.documentKind
  const sourceDraft = sourceDraftId ? findDraftEntryById(sourceDraftId) : null

  if (previousDocumentKind === 'draft' && sourcePath) {
    try {
      const nextContent = await relocateManagedDocument({
        sourcePath,
        targetPath: nextPath,
        content,
        removeSource: shouldRemoveSourceAfterSaveAs({
          documentKind: previousDocumentKind,
          currentPath: sourcePath,
          nextPath,
          saveAsMode: appSettings.saveAsMode,
        }),
      })

      removeDraftEntry({ draftId: sourceDraftId, draftPath: sourcePath })
      sidebarState.pinnedItems = migratePinnedDraftToFile(sidebarState.pinnedItems, sourceDraftId, nextPath)
      await persistSidebarState()
      recordIgnoredWatchedContent(state.ignoredWatchedContents, nextContent)
      setFileDocumentState(win, nextPath, 'file', null)
      state.lastSyncedContent = nextContent
      await moveRevisionHistoryForDocument(
        { documentKind: 'draft', draftId: sourceDraftId, filePath: sourcePath },
        { documentKind: 'file', draftId: null, filePath: nextPath },
      )
      if (sourceDraft?.manualTitle) {
        setFileTitleOverride(nextPath, sourceDraft.manualTitle)
      }
      state.displayTitle = resolveFileDisplayTitle(nextPath, nextContent)
      updateTitle(win)
      recordRecentFile(nextPath)
      await recordRevisionForWindowState(state, nextContent, 'save-as')
      if (isPathInsideAnyWorkspace(sourcePath) || isPathInsideAnyWorkspace(nextPath)) {
        await refreshWorkdirEntries()
      }
      broadcastSidebarState()
      return true
    } catch {
      return false
    }
  }

  const removeSource = shouldRemoveSourceAfterSaveAs({
    documentKind: previousDocumentKind,
    currentPath: sourcePath,
    nextPath,
    saveAsMode: appSettings.saveAsMode,
  })
  const migrated = await copyManagedDocumentAssets({
    sourcePath,
    targetPath: nextPath,
    content,
  })
  const didSave = await saveToPath(win, nextPath, migrated.content, 'save-as')
  if (!didSave) return false

  if (removeSource && sourcePath) {
    await moveRevisionHistoryForDocument(
      { documentKind: 'file', draftId: null, filePath: sourcePath },
      { documentKind: 'file', draftId: null, filePath: nextPath },
    )
  }

  if (removeSource && sourcePath) {
    try {
      await removeSourceFileAfterSaveAs(sourcePath)
      await removeManagedDocumentAssetSources(migrated.assetMoves)
    } catch {
      return false
    }
  }

  return true
}

async function autosaveWindowDocument(
  win: BrowserWindow,
  content: string,
): Promise<{ kind: DocumentKind; path: string | null }> {
  const state = getState(win)

  if (state.documentKind === 'blank') {
    if (isBlankDocumentContent(content)) {
      return { kind: 'blank', path: null }
    }

    const now = Date.now()
    const draftDirectoryPath = getEffectiveDraftDirectoryPath()
    await mkdir(draftDirectoryPath, { recursive: true })
    const nextDraftState = upsertDraftEntry({
      entries: sidebarState.draftEntries,
      content,
      draftDirectoryPath,
      now,
      suffix: sidebarState.draftEntries.length + 1,
    })

    if (!nextDraftState.draftEntry) {
      return { kind: 'blank', path: null }
    }

    sidebarState.draftEntries = nextDraftState.entries
    persistSidebarState()
    state.documentKind = 'draft'
    state.filePath = nextDraftState.draftEntry.path
    state.draftId = nextDraftState.draftEntry.id
  } else if (state.documentKind === 'draft') {
    const existingEntry = findDraftEntryById(state.draftId) ?? sidebarState.draftEntries.find((entry) => entry.path === state.filePath) ?? null
    const nextDraftState = upsertDraftEntry({
      entries: sidebarState.draftEntries,
      content,
      draftDirectoryPath: getEffectiveDraftDirectoryPath(),
      now: Date.now(),
      existingEntry,
    })
    if (nextDraftState.draftEntry) {
      sidebarState.draftEntries = nextDraftState.entries
      persistSidebarState()
      state.filePath = nextDraftState.draftEntry.path
      state.draftId = nextDraftState.draftEntry.id
    }
  }

  if (!state.filePath) {
    return { kind: 'blank', path: null }
  }

  await saveToPath(win, state.filePath, content, 'autosave')
  return { kind: state.documentKind, path: state.filePath }
}

function toggleSidebarForWindow(win: BrowserWindow | null): boolean {
  if (!win) return false

  const state = getState(win)
  const drawerMode = isDrawerModeForWindow(win)
  state.drawerSidebarOpen = normalizeDrawerSidebarOpen(state.isDrawerMode, drawerMode, state.drawerSidebarOpen)
  state.isDrawerMode = drawerMode

  if (drawerMode) {
    state.drawerSidebarOpen = !state.drawerSidebarOpen
    sendSidebarState(win)
    return state.drawerSidebarOpen
  }

  state.desktopSidebarOpen = !state.desktopSidebarOpen
  sendSidebarState(win)
  return state.desktopSidebarOpen
}

function beginBlankDocumentSession(win: BrowserWindow): SidebarSnapshot {
  setBlankDocumentState(win)
  const snapshot = createSidebarSnapshot(win)
  sendSidebarState(win)
  return snapshot
}

async function clearDraftsForAllWindows(triggerWin: BrowserWindow): Promise<SidebarSnapshot> {
  const draftEntries = [...sidebarState.draftEntries]
  const removedEntries: DraftEntry[] = []

  for (const entry of draftEntries) {
    if (!existsSync(entry.path)) {
      removedEntries.push(entry)
      continue
    }
    const didRemove = await moveFileToTrashAndVerify(entry.path, {
      trashItem: (targetPath) => shell.trashItem(targetPath),
      exists: (targetPath) => existsSync(targetPath),
    })
    if (didRemove) removedEntries.push(entry)
  }

  sidebarState.draftEntries = sidebarState.draftEntries.filter((entry) => (
    !removedEntries.some((removedEntry) => removedEntry.id === entry.id)
  ))
  await persistSidebarState()

  for (const win of BrowserWindow.getAllWindows()) {
    const state = getState(win)
    if (!state.filePath || !removedEntries.some((entry) => entry.path === state.filePath)) continue
    setBlankDocumentState(win)
    if (!win.isDestroyed()) {
      win.webContents.send('new-file')
    }
  }

  await refreshWorkdirEntries()

  broadcastSidebarState()
  return createSidebarSnapshot(triggerWin)
}

async function createWorkdirFileInWindow(win: BrowserWindow): Promise<SidebarSnapshot> {
  const state = getState(win)
  const creationRoot = resolveWorkdirCreationRoot(win)
  if (!creationRoot) {
    return createSidebarSnapshot(win)
  }
  return createWorkdirFileInDir(win, creationRoot)
}

/** 在指定文件夹里新建文稿（右键菜单入口）：创建后直接在当前窗口打开为新 tab/文档。 */
async function createWorkdirFileInDir(win: BrowserWindow, dirPath: string): Promise<SidebarSnapshot> {
  const state = getState(win)
  const nextPath = resolveNewWorkdirMarkdownPath(dirPath, (candidatePath) => existsSync(candidatePath))
  await writeFile(nextPath, '', 'utf-8')
  state.workdirPath = dirPath
  state.activeSidebarTab = 'workdir'
  sidebarState.workdirPath = dirPath
  await refreshWorkdirEntries()
  await persistSidebarState()
  await loadFileInWindow(win, nextPath, { documentKind: 'file' })
  broadcastSidebarState()
  return createSidebarSnapshot(win)
}

async function createWorkdirFolderInWindow(win: BrowserWindow): Promise<SidebarSnapshot> {
  const state = getState(win)
  const creationRoot = resolveWorkdirCreationRoot(win)
  if (!creationRoot) {
    return createSidebarSnapshot(win)
  }

  const nextPath = resolveNewWorkdirFolderPath(creationRoot, (candidatePath) => existsSync(candidatePath))
  await mkdir(nextPath)
  state.workdirPath = creationRoot
  state.activeSidebarTab = 'workdir'
  sidebarState.workdirPath = creationRoot
  await refreshWorkdirEntries()
  await persistSidebarState()
  broadcastSidebarState()
  return createSidebarSnapshot(win)
}

async function removeDraftForAllWindows(triggerWin: BrowserWindow, draftId: string): Promise<SidebarSnapshot> {
  const draftEntry = sidebarState.draftEntries.find((entry) => entry.id === draftId)
  if (!draftEntry) {
    return createSidebarSnapshot(triggerWin)
  }

  if (existsSync(draftEntry.path)) {
    const didRemove = await moveFileToTrashAndVerify(draftEntry.path, {
      trashItem: (targetPath) => shell.trashItem(targetPath),
      exists: (targetPath) => existsSync(targetPath),
    })
    if (!didRemove) {
      await refreshWorkdirEntries()
      broadcastSidebarState()
      return createSidebarSnapshot(triggerWin)
    }
  }

  removeDraftEntry({ draftId: draftEntry.id, draftPath: draftEntry.path })

  for (const win of BrowserWindow.getAllWindows()) {
    const state = getState(win)
    if (state.filePath !== draftEntry.path) continue
    setBlankDocumentState(win)
    if (!win.isDestroyed()) {
      win.webContents.send('new-file')
    }
  }

  await refreshWorkdirEntries()

  broadcastSidebarState()
  return createSidebarSnapshot(triggerWin)
}

async function removeFormalFileReferences(filePath: string): Promise<void> {
  sidebarState.recentFiles = removeRecentFile(sidebarState.recentFiles, filePath)
  sidebarState.pinnedItems = removePinnedFile(sidebarState.pinnedItems, filePath)
  delete sidebarState.fileTitleOverrides[filePath]
  await persistSidebarState()
}

async function removeWorkdirFileForAllWindows(triggerWin: BrowserWindow, filePath: string): Promise<SidebarSnapshot> {
  if (!isPathInsideAnyWorkspace(filePath)) {
    return createSidebarSnapshot(triggerWin)
  }

  if (!existsSync(filePath)) {
    await removeFormalFileReferences(filePath)
    await refreshWorkdirEntries()
    broadcastSidebarState()
    return createSidebarSnapshot(triggerWin)
  }

  const didRemove = await moveFileToTrashAndVerify(filePath, {
    trashItem: (targetPath) => shell.trashItem(targetPath),
    exists: (targetPath) => existsSync(targetPath),
  })

  if (!didRemove) {
    await refreshWorkdirEntries()
    broadcastSidebarState()
    return createSidebarSnapshot(triggerWin)
  }

  await removeFormalFileReferences(filePath)

  for (const win of BrowserWindow.getAllWindows()) {
    const state = getState(win)
    if (state.documentKind !== 'file' || state.filePath !== filePath) continue
    setBlankDocumentState(win)
    if (!win.isDestroyed()) {
      win.webContents.send('new-file')
    }
  }

  await refreshWorkdirEntries()
  broadcastSidebarState()
  return createSidebarSnapshot(triggerWin)
}

// IPC Handlers

ipcMain.on('mcp-document-response', (event, payload: RendererMcpResponsePayload) => {
  if (!payload || typeof payload.id !== 'string') return
  const pending = pendingRendererMcpRequests.get(payload.id)
  if (!pending || pending.webContentsId !== event.sender.id) return

  clearTimeout(pending.timeout)
  pendingRendererMcpRequests.delete(payload.id)

  if (payload.success) {
    pending.resolve(payload.data)
    return
  }

  pending.reject(new Error(payload.error || 'MCP renderer request failed'))
})

ipcMain.on('open-external', (_event, url: string) => {
  if (typeof url === 'string' && (url.startsWith('https://') || url.startsWith('http://'))) {
    shell.openExternal(url)
  }
})

ipcMain.handle('open-file', async (event) => {
  const win = getWinFromEvent(event)
  if (!win) return null
  const result = await dialog.showOpenDialog(win, {
    defaultPath: currentDocumentDirectory(win),
    filters: EDITABLE_FILE_FILTERS,
    properties: ['openFile']
  })
  if (result.canceled || result.filePaths.length === 0) return null

  const filePath = result.filePaths[0]

  // If this window has no file, load here; otherwise open in new window
  const state = getState(win)
  if (areTabsEnabled() && state.rendererReady) {
    // 开启标签页：渲染层 flush 后落新 tab（或激活已打开该文档的 tab）
    win.webContents.send('tab-open-request', { filePath, documentKind: null, draftId: null })
    return null
  }
  if (state.documentKind === 'blank') {
    loadFileInWindow(win, filePath)
    return null
  } else {
    openFile(filePath, win)
    return null
  }
})

ipcMain.handle('open-file-path', async (event, filePath: string) => {
  const win = getWinFromEvent(event)
  if (!win) return null
  const state = getState(win)

  if (areTabsEnabled() && state.rendererReady) {
    win.webContents.send('tab-open-request', { filePath, documentKind: null, draftId: null })
    return null
  }

  // If this window has no file, load here
  if (state.documentKind === 'blank') {
    loadFileInWindow(win, filePath)
    return null
  } else {
    openFile(filePath, win)
    return null
  }
})

// 标签页阶段 A 的渲染层协同入口：渲染层 flush 未保存编辑后回调，
// 主进程在这里完成切 tab / 新建 tab / 新开文档落 tab。
ipcMain.handle('tabs-switch', async (event, tabId: string, content: string) => {
  const win = getWinFromEvent(event)
  if (!win || typeof tabId !== 'string') return false
  return activateTabInWindow(win, tabId, typeof content === 'string' ? content : undefined)
})

ipcMain.handle('tabs-close', async (event, tabId: string, content: string) => {
  const win = getWinFromEvent(event)
  if (!win || typeof tabId !== 'string') return false
  return closeTabInWindow(win, tabId, typeof content === 'string' ? content : undefined)
})

ipcMain.handle('tabs-reorder', async (event, draggedTabId: string, targetTabId: string, placeBefore: boolean) => {
  const win = getWinFromEvent(event)
  if (!win || typeof draggedTabId !== 'string' || typeof targetTabId !== 'string') return false
  const state = getState(win)
  if (!reorderTabInCollection(state.tabs, draggedTabId, targetTabId, placeBefore === true)) return false
  persistLastActiveDocument(state)
  sendTabsState(win)
  return true
})

ipcMain.handle('tabs-new', async (event, content: string) => {
  const win = getWinFromEvent(event)
  if (!win) return false
  return createTabInWindow(win, typeof content === 'string' ? content : undefined)
})

ipcMain.handle('tabs-open-document', async (event, payload: {
  filePath: string
  documentKind?: 'draft' | 'file'
  draftId?: string | null
  content?: string
}) => {
  const win = getWinFromEvent(event)
  if (!win || !payload || typeof payload.filePath !== 'string' || !existsSync(payload.filePath)) return false
  const state = getState(win)
  if (!areTabsEnabled()) return false

  if (typeof payload.content === 'string') {
    snapshotTabUnsavedContent(state.activeTab, payload.content)
  }

  const existing = findTabByFilePath(state.tabs, payload.filePath)
  if (existing) {
    return activateTabInWindow(win, existing.id)
  }

  const documentKind = payload.documentKind === 'draft' ? 'draft' as const : 'file' as const
  const draftId = typeof payload.draftId === 'string' ? payload.draftId : null
  if (state.activeTab.filePath) {
    // 原活动 tab 转为非活动：先卸 watcher/debounce，再落新 tab
    detachTabWatch(state.activeTab)
    addTab(state.tabs)
  }
  const loaded = await loadFileInWindow(win, payload.filePath, {
    documentKind,
    draftId,
    recordRecent: documentKind === 'file',
  })
  sendTabsState(win)
  return loaded
})

ipcMain.handle('get-sidebar-state', async (event) => {
  const win = getWinFromEvent(event)
  if (!win) return null
  return createSidebarSnapshot(win)
})

ipcMain.handle('get-settings', async (event) => {
  const win = getWinFromEvent(event)
  if (!win) return null
  return appSettings
})

ipcMain.handle('get-current-document', async (event) => {
  const win = getWinFromEvent(event)
  if (!win) return null
  const state = getState(win)
  if (!state.filePath || state.documentKind === 'blank' || state.lastSyncedContent === null) return null
  return {
    content: state.lastSyncedContent,
    draftId: state.draftId,
    kind: state.documentKind,
    path: state.filePath,
    title: state.displayTitle,
  }
})

ipcMain.handle('get-crash-recovery-state', async () => {
  return getCrashRecoverySummary()
})

ipcMain.handle('restore-crash-recovery', async (event) => {
  const win = getWinFromEvent(event)
  if (!win) return false
  return restoreCrashRecoveryToDraft(win)
})

ipcMain.handle('dismiss-crash-recovery', async () => {
  await clearCrashRecoveryState(crashRecoveryStatePath).catch(() => {})
  return true
})

ipcMain.handle('get-external-change-recovery-state', async () => {
  return getExternalChangeRecoverySummary()
})

ipcMain.handle('restore-external-change-recovery', async (event) => {
  const win = getWinFromEvent(event)
  if (!win) return false
  return restoreExternalChangeRecoveryToDraft(win)
})

ipcMain.handle('dismiss-external-change-recovery', async () => {
  await clearExternalChangeRecoveryState(externalChangeRecoveryStatePath).catch(() => {})
  return true
})

// 决策面：用户知情接受被拦下的外部版本。
// 外部内容始终在磁盘上，这里只是重新读盘并推进同步基线，避免 watcher 再次拦同一次内容。
ipcMain.handle('accept-external-change', async (event) => {
  const win = getWinFromEvent(event)
  if (!win) return null
  const state = getState(win)
  if (!state.filePath || state.documentKind === 'blank' || state.lastSyncedContent === null) return null

  let content: string
  try {
    content = await readFile(state.filePath, 'utf-8')
  } catch {
    return null
  }

  const previousContentForJournal = state.lastSyncedContent
  state.lastSyncedContent = content
  // 用户接受外部版本后编辑器将加载外部内容，原未保存快照随之失效。
  state.activeTab.unsavedContent = null
  recordIgnoredWatchedContent(state.ignoredWatchedContents, content)
  state.displayTitle = state.documentKind === 'draft' && state.draftId
    ? resolveDraftDisplayTitle(state.draftId, content)
    : resolveFileDisplayTitle(state.filePath, content)
  updateTitle(win)
  if (state.documentKind === 'draft' && state.draftId) {
    const entry = findDraftEntryById(state.draftId)
    if (entry) {
      updateDraftEntry({
        ...entry,
        updatedAt: Date.now(),
        displayTitle: deriveDraftDisplayTitle(content, entry.manualTitle),
      })
    }
  }
  void documentJournal.record({
    type: 'external-change-accepted',
    docPath: state.filePath,
    draftId: state.draftId,
    displayTitle: state.displayTitle,
    source: 'user',
    previous: previousContentForJournal === null ? null : describeJournalContent(previousContentForJournal),
    next: describeJournalContent(content),
  })
  return { content, title: state.displayTitle }
})

ipcMain.handle('list-document-revisions', async (event) => {
  const win = getWinFromEvent(event)
  if (!win) return []
  return listDocumentRevisionsForWindow(win)
})

ipcMain.handle('open-revisions-directory', async (event) => {
  const win = getWinFromEvent(event)
  if (!win) return false
  return openRevisionsDirectoryForWindow(win)
})

ipcMain.handle('restore-document-revision', async (event, revisionId: string) => {
  const win = getWinFromEvent(event)
  if (!win || typeof revisionId !== 'string') return false
  return restoreDocumentRevisionToDraft(win, revisionId)
})

ipcMain.handle('persist-image-asset', async (
  event,
  payload: { bytes: Uint8Array; fileName: string; mimeType: string },
) => {
  const win = getWinFromEvent(event)
  if (!win) return null
  return persistImageAssetForWindow(win, payload)
})

ipcMain.handle('read-local-image-as-data-url', async (_event, imagePath: string) => {
  if (typeof imagePath !== 'string' || imagePath.trim().length === 0) return null
  return readLocalImageAsDataUrl(imagePath)
})

ipcMain.handle('update-settings', async (event, patch: Partial<AppSettings>) => {
  const win = getWinFromEvent(event)
  if (!win) return null
  appSettings = await updateAppSettings(settingsPath, appSettings, patch ?? {})
  buildMenu()
  broadcastSettingsState()
  // tabs 开关切换时全窗口广播一次 tabs-state：开启侧让已开窗口的标签条补上集合，
  // 关闭侧标签条靠 enabled:false 收到卸载通知（updateTitle 已被开关守卫拦住）。
  broadcastTabsState()
  return appSettings
})

ipcMain.handle('open-settings-window', async (_event, pane?: string) => {
  openSettingsWindow(typeof pane === 'string' ? pane : undefined)
  return true
})

ipcMain.handle('complete-ai-prompt', async (event, prompt: string) => {
  const win = getWinFromEvent(event)
  if (!win) return { ok: false, error: '当前窗口不可用。' }
  return completeAiHelperPrompt(appSettings.aiHelper.provider, typeof prompt === 'string' ? prompt : '')
})

ipcMain.handle('test-ai-helper-connection', async (event) => {
  const win = getWinFromEvent(event)
  if (!win) return { ok: false, error: '当前窗口不可用。' }
  return testAiHelperConnection(appSettings.aiHelper.provider)
})

ipcMain.handle('codex-integration-status', async () => {
  return resolveCodexIntegrationStatus()
})

ipcMain.handle('codex-integration-start-bridge', async () => {
  await mcpBridge.start()
  return resolveCodexIntegrationStatus()
})

ipcMain.handle('codex-integration-install', async () => {
  const paths = getCodexIntegrationPaths()
  const codex = await detectCodexCli()
  if (!codex.command) {
    return resolveCodexIntegrationStatus('Codex CLI is not available in PATH')
  }

  try {
    await mcpBridge.start()
    await installCodexMcpServer(codex.command, {
      bridgeFilePath: paths.bridgeFilePath,
      electronRunAsNode: true,
      sidecarScriptPath: paths.sidecarScriptPath,
      spawnCommand: process.execPath,
    })
    return resolveCodexIntegrationStatus()
  } catch (error) {
    return resolveCodexIntegrationStatus(error instanceof Error ? error.message : String(error))
  }
})

ipcMain.handle('codex-integration-remove', async () => {
  const codex = await detectCodexCli()
  if (!codex.command) {
    return resolveCodexIntegrationStatus('Codex CLI is not available in PATH')
  }

  try {
    await removeCodexMcpServer(codex.command)
    return resolveCodexIntegrationStatus()
  } catch (error) {
    return resolveCodexIntegrationStatus(error instanceof Error ? error.message : String(error))
  }
})

ipcMain.handle('update-current-draft-title', async (event, nextTitle: string) => {
  const win = getWinFromEvent(event)
  if (!win) return null
  const state = getState(win)
  const draftEntry = findDraftEntryById(state.draftId)
  const trimmedTitle = typeof nextTitle === 'string' ? nextTitle.trim() : ''
  if (state.documentKind !== 'draft' || !draftEntry || !trimmedTitle) {
    return createSidebarSnapshot(win)
  }

  try {
    await applyManualDraftTitle(draftEntry, trimmedTitle)
  } catch {
    return createSidebarSnapshot(win)
  }

  broadcastSidebarState()
  return createSidebarSnapshot(win)
})

ipcMain.handle('update-current-file-title', async (event, nextTitle: string) => {
  const win = getWinFromEvent(event)
  if (!win) return null
  const state = getState(win)
  const trimmedTitle = typeof nextTitle === 'string' ? nextTitle.trim() : ''
  if (state.documentKind !== 'file' || !state.filePath || !trimmedTitle) {
    return createSidebarSnapshot(win)
  }

  setFileTitleOverride(state.filePath, trimmedTitle)
  state.displayTitle = trimmedTitle
  updateTitle(win)
  broadcastSidebarState()
  return createSidebarSnapshot(win)
})

ipcMain.handle('update-draft-title-by-id', async (event, draftId: string, nextTitle: string) => {
  const win = getWinFromEvent(event)
  if (!win) return null
  const trimmedTitle = typeof nextTitle === 'string' ? nextTitle.trim() : ''
  const draftEntry = typeof draftId === 'string' ? findDraftEntryById(draftId) : null
  if (!draftEntry || !trimmedTitle) {
    return createSidebarSnapshot(win)
  }

  try {
    await applyManualDraftTitle(draftEntry, trimmedTitle)
  } catch {
    return createSidebarSnapshot(win)
  }

  broadcastSidebarState()
  return createSidebarSnapshot(win)
})

ipcMain.handle('update-file-title-by-path', async (event, filePath: string, nextTitle: string) => {
  const win = getWinFromEvent(event)
  if (!win) return null
  const trimmedTitle = typeof nextTitle === 'string' ? nextTitle.trim() : ''
  if (typeof filePath !== 'string' || !filePath || !trimmedTitle) {
    return createSidebarSnapshot(win)
  }

  setFileTitleOverride(filePath, trimmedTitle)

  for (const window of BrowserWindow.getAllWindows()) {
    const state = getState(window)
    if (state.documentKind === 'file' && state.filePath === filePath) {
      state.displayTitle = trimmedTitle
      updateTitle(window)
    }
  }

  broadcastSidebarState()
  return createSidebarSnapshot(win)
})

ipcMain.handle('rename-file-by-path-from-title', async (event, filePath: string, nextTitle: string) => {
  const win = getWinFromEvent(event)
  if (!win) return null
  if (typeof filePath !== 'string' || typeof nextTitle !== 'string') {
    return createSidebarSnapshot(win)
  }

  return renameFormalFileByTitleForAllWindows(win, filePath, nextTitle)
})

ipcMain.handle('rename-current-file-from-title', async (event, nextTitle: string) => {
  const win = getWinFromEvent(event)
  if (!win) return null
  const state = getState(win)
  if (typeof nextTitle !== 'string' || !state.filePath || state.documentKind !== 'file') {
    return { path: null }
  }

  const nextPath = buildTitleSyncPath(state.filePath, nextTitle)
  if (!nextPath) return { path: null }
  return renameCurrentFileToPath(win, nextPath)
})

ipcMain.handle('begin-blank-document', async (event) => {
  const win = getWinFromEvent(event)
  if (!win) return null
  return beginBlankDocumentSession(win)
})

ipcMain.handle('autosave-document', async (event, content: string) => {
  const win = getWinFromEvent(event)
  if (!win) return { kind: 'blank' as const, path: null }
  return autosaveWindowDocument(win, content)
})

ipcMain.handle('toggle-sidebar', async (event) => {
  return toggleSidebarForWindow(getWinFromEvent(event))
})

ipcMain.handle('set-sidebar-width', async (_event, width: number) => {
  sidebarState.sidebarWidth = clampSidebarWidth(width)
  persistSidebarState()
  broadcastSidebarState()
  return sidebarState.sidebarWidth
})

ipcMain.handle('choose-workdir', async (event) => {
  const win = getWinFromEvent(event)
  if (!win) return null
  const state = getState(win)

  const result = await dialog.showOpenDialog(win, {
    defaultPath: currentDocumentDirectory(win),
    properties: ['openDirectory'],
  })

  if (result.canceled || result.filePaths.length === 0) return null

  state.workdirPath = result.filePaths[0]
  sidebarState.workdirPath = state.workdirPath
  sidebarState.workspacePaths = addWorkspacePath(sidebarState.workspacePaths, state.workdirPath)
  sidebarState.expandedWorkspacePaths = [...new Set([...sidebarState.expandedWorkspacePaths, state.workdirPath])]
  await refreshWorkdirEntries()
  await persistSidebarState()
  broadcastSidebarState()
  return createSidebarSnapshot(win)
})

ipcMain.handle('select-workspace', async (event, workspacePath: string) => {
  const win = getWinFromEvent(event)
  if (!win) return null
  const state = getState(win)
  if (typeof workspacePath !== 'string' || !existsSync(workspacePath)) {
    sidebarState.workspacePaths = sidebarState.workspacePaths.filter((candidate) => existsSync(candidate))
    await persistSidebarState()
    broadcastSidebarState()
    return createSidebarSnapshot(win)
  }

  state.workdirPath = workspacePath
  sidebarState.workspacePaths = addWorkspacePath(sidebarState.workspacePaths, workspacePath)
  sidebarState.expandedWorkspacePaths = [...new Set([...sidebarState.expandedWorkspacePaths, workspacePath])]
  sidebarState.workdirPath = workspacePath
  await refreshWorkdirEntries()
  await persistSidebarState()
  broadcastSidebarState()
  return createSidebarSnapshot(win)
})

ipcMain.handle('remove-workspace', async (event, workspacePath: string) => {
  const win = getWinFromEvent(event)
  if (!win) return null
  if (typeof workspacePath !== 'string') return createSidebarSnapshot(win)
  if (workspacePath === sidebarState.draftDirectoryPath
    || sidebarState.draftEntries.some((entry) => dirname(entry.path) === workspacePath)
  ) return createSidebarSnapshot(win)

  const next = removeWorkspacePath(sidebarState.workspacePaths, workspacePath, sidebarState.workdirPath)
  sidebarState.workspacePaths = next.workspacePaths
  sidebarState.expandedWorkspacePaths = sidebarState.expandedWorkspacePaths.filter((path) => path !== workspacePath)
  sidebarState.workdirPath = next.workdirPath
  for (const window of BrowserWindow.getAllWindows()) {
    const state = getState(window)
    if (state.workdirPath === workspacePath) {
      state.workdirPath = next.workdirPath
    }
  }
  await refreshWorkdirEntries()
  await persistSidebarState()
  broadcastSidebarState()
  return createSidebarSnapshot(win)
})

ipcMain.handle('rename-workspace', async (event, workspacePath: string, newName: string) => {
  const win = getWinFromEvent(event)
  if (!win) return { ok: false as const, error: '窗口不可用' }
  const fail = (error: string) => ({ ok: false as const, error })
  const name = typeof newName === 'string' ? newName.trim() : ''
  if (!name || name.includes('/') || name.includes('\\') || name.includes(':')) return fail('名称不合法')
  if (typeof workspacePath !== 'string' || !sidebarState.workspacePaths.includes(workspacePath)) {
    return fail('目标不在工作目录列表中')
  }
  const sourceStat = await stat(workspacePath).catch(() => null)
  if (!sourceStat) return fail('目标不存在')
  if (workspacePath === sidebarState.draftDirectoryPath) return fail('草稿目录不能在这里重命名')
  if (sidebarState.draftEntries.some((entry) => entry.path.startsWith(workspacePath + '/')
    || entry.path.startsWith(workspacePath + '\\'))
  ) {
    return fail('目录内包含草稿，不能重命名')
  }
  if (findOpenTabConflictForPath(workspacePath)) return fail('目录内有文件正在标签页中打开，请先关闭再重命名')
  const destPath = join(dirname(workspacePath), name)
  if (destPath === workspacePath) return { ok: true as const, state: createSidebarSnapshot(win) }
  if (existsSync(destPath)) return fail('同目录下已有同名项')
  if (sidebarState.workspacePaths.some((path) => path !== workspacePath
    && (destPath === path || path.startsWith(destPath + '/') || path.startsWith(destPath + '\\')))
  ) {
    return fail('新路径与其他工作目录冲突')
  }
  try {
    await rename(workspacePath, destPath)
  } catch {
    return fail('重命名失败（可能被占用）')
  }
  renameWorkspacePathInState(sidebarState, workspacePath, destPath)
  sidebarState.recentFiles = sidebarState.recentFiles.map((entry) => (entry.startsWith(workspacePath + '/')
    ? destPath + entry.slice(workspacePath.length)
    : entry))
  for (const [key, value] of Object.entries(sidebarState.fileTitleOverrides)) {
    if (key.startsWith(workspacePath + '/')) {
      delete sidebarState.fileTitleOverrides[key]
      sidebarState.fileTitleOverrides[destPath + key.slice(workspacePath.length)] = value
    }
  }
  for (const window of BrowserWindow.getAllWindows()) {
    const state = getState(window)
    if (state.workdirPath === workspacePath) {
      state.workdirPath = destPath
    }
  }
  await refreshWorkdirEntries()
  await persistSidebarState()
  broadcastSidebarState()
  return { ok: true as const, state: createSidebarSnapshot(win) }
})

ipcMain.handle('reorder-workspaces', async (event, orderedPaths: unknown) => {
  const win = getWinFromEvent(event)
  if (!win) return null
  const nextWorkspacePaths = reorderWorkspacePaths(sidebarState.workspacePaths, orderedPaths)
  if (!nextWorkspacePaths) return createSidebarSnapshot(win)
  if (nextWorkspacePaths.every((path, index) => path === sidebarState.workspacePaths[index])) {
    return createSidebarSnapshot(win)
  }
  sidebarState.workspacePaths = nextWorkspacePaths
  await persistSidebarState()
  broadcastSidebarState()
  return createSidebarSnapshot(win)
})

// ---- 工作目录条目操作：拖拽移动 / 重命名 / 删除（废纸篓）/ 访达显示 ----

function isPathInsideWorkspaceRoots(targetPath: string): boolean {
  return sidebarState.workspacePaths.some((rootPath) => {
    const rel = relative(rootPath, targetPath)
    return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
  })
}

/** 返回与目标路径冲突的已打开 tab 文件路径；无冲突返回 null。 */
function findOpenTabConflictForPath(targetPath: string): string | null {
  const normalizedTarget = targetPath.endsWith('/') || targetPath.endsWith('\\')
    ? targetPath.slice(0, -1)
    : targetPath
  for (const window of BrowserWindow.getAllWindows()) {
    const state = getState(window)
    for (const tab of state.tabs.tabs) {
      if (!tab.filePath) continue
      if (tab.filePath === normalizedTarget) return tab.filePath
      if (tab.filePath.startsWith(normalizedTarget + '/') || tab.filePath.startsWith(normalizedTarget + '\\')) {
        return tab.filePath
      }
    }
  }
  return null
}

ipcMain.handle('move-workdir-entry', async (event, sourcePath: string, targetDir: string) => {
  const win = getWinFromEvent(event)
  if (!win) return { ok: false, error: '窗口不可用' }
  const fail = (error: string) => ({ ok: false as const, error })
  if (typeof sourcePath !== 'string' || typeof targetDir !== 'string') return fail('参数无效')
  const sourceStat = await stat(sourcePath).catch(() => null)
  if (!sourceStat?.isFile()) return fail('源文件不存在')
  const targetStat = await stat(targetDir).catch(() => null)
  if (!targetStat?.isDirectory()) return fail('目标文件夹不存在')
  if (dirname(sourcePath) === targetDir) return { ok: true as const, state: createSidebarSnapshot(win) }
  if (!isPathInsideWorkspaceRoots(targetDir)) return fail('目标位置不在工作目录内')
  if (findOpenTabConflictForPath(sourcePath)) return fail('文件正在标签页中打开，请先关闭再移动')
  const destPath = join(targetDir, basename(sourcePath))
  if (existsSync(destPath)) return fail('目标位置已有同名文件')
  try {
    await rename(sourcePath, destPath)
  } catch {
    return fail('移动失败（可能跨磁盘或被占用）')
  }
  await refreshWorkdirEntries()
  await persistSidebarState()
  broadcastSidebarState()
  return { ok: true as const, state: createSidebarSnapshot(win) }
})

ipcMain.handle('rename-workdir-entry', async (event, oldPath: string, newName: string) => {
  const win = getWinFromEvent(event)
  if (!win) return { ok: false, error: '窗口不可用' }
  const fail = (error: string) => ({ ok: false as const, error })
  const name = typeof newName === 'string' ? newName.trim() : ''
  if (!name || name.includes('/') || name.includes('\\') || name.includes(':')) return fail('名称不合法')
  const sourceStat = await stat(oldPath).catch(() => null)
  if (!sourceStat) return fail('目标不存在')
  if (!isPathInsideWorkspaceRoots(oldPath)) return fail('目标不在工作目录内')
  if (findOpenTabConflictForPath(oldPath)) return fail('目标正在标签页中打开，请先关闭再重命名')
  const destPath = join(dirname(oldPath), name)
  if (destPath === oldPath) return { ok: true as const, state: createSidebarSnapshot(win) }
  if (existsSync(destPath)) return fail('同目录下已有同名项')
  try {
    await rename(oldPath, destPath)
  } catch {
    return fail('重命名失败（可能被占用）')
  }
  if (sourceStat.isFile()) {
    sidebarState.recentFiles = sidebarState.recentFiles.map((entry) => (entry === oldPath ? destPath : entry))
    if (sidebarState.fileTitleOverrides[oldPath] !== undefined) {
      sidebarState.fileTitleOverrides[destPath] = sidebarState.fileTitleOverrides[oldPath]
      delete sidebarState.fileTitleOverrides[oldPath]
    }
  }
  await refreshWorkdirEntries()
  await persistSidebarState()
  broadcastSidebarState()
  return { ok: true as const, state: createSidebarSnapshot(win) }
})

ipcMain.handle('delete-workdir-entry', async (event, targetPath: string) => {
  const win = getWinFromEvent(event)
  if (!win) return { ok: false, error: '窗口不可用' }
  const fail = (error: string) => ({ ok: false as const, error })
  if (typeof targetPath !== 'string') return fail('参数无效')
  const targetStat = await stat(targetPath).catch(() => null)
  if (!targetStat) return fail('目标不存在')
  if (!isPathInsideWorkspaceRoots(targetPath)) return fail('目标不在工作目录内')
  if (targetPath === sidebarState.draftDirectoryPath) return fail('草稿目录不能在这里删除')
  if (sidebarState.workspacePaths.includes(targetPath)) {
    return fail('工作目录根文件夹不能在这里删除，可从列表移除')
  }
  if (sidebarState.draftEntries.some((entry) => entry.path === targetPath
    || entry.path.startsWith(targetPath + '/')
    || entry.path.startsWith(targetPath + '\\'))
  ) {
    return fail('目标包含草稿，草稿不能从这里删除')
  }
  if (findOpenTabConflictForPath(targetPath)) return fail('目标正在标签页中打开，请先关闭再删除')
  const trashed = await moveFileToTrashAndVerify(targetPath, {
    trashItem: shell.trashItem,
    exists: existsSync,
  })
  if (!trashed) return fail('删除失败（已尝试移入废纸篓）')
  if (targetStat.isFile()) {
    sidebarState.recentFiles = removeRecentFile(sidebarState.recentFiles, targetPath)
  }
  await refreshWorkdirEntries()
  await persistSidebarState()
  broadcastSidebarState()
  return { ok: true as const, state: createSidebarSnapshot(win) }
})

ipcMain.handle('reveal-workdir-entry', async (_event, targetPath: string) => {
  if (typeof targetPath !== 'string' || !existsSync(targetPath)) return false
  shell.showItemInFolder(targetPath)
  return true
})

ipcMain.handle('create-workdir-file', async (event) => {
  const win = getWinFromEvent(event)
  if (!win) return null
  return createWorkdirFileInWindow(win)
})

ipcMain.handle('create-workdir-file-in', async (event, dirPath: string) => {
  const win = getWinFromEvent(event)
  if (!win || typeof dirPath !== 'string') return null
  const dirStat = await stat(dirPath).catch(() => null)
  if (!dirStat?.isDirectory() || !isPathInsideWorkspaceRoots(dirPath)) return createSidebarSnapshot(win)
  return createWorkdirFileInDir(win, dirPath)
})

ipcMain.handle('create-workdir-folder', async (event) => {
  const win = getWinFromEvent(event)
  if (!win) return null
  return createWorkdirFolderInWindow(win)
})

ipcMain.handle('toggle-workspace-expanded', async (event, workspacePath: string) => {
  const win = getWinFromEvent(event)
  if (!win || typeof workspacePath !== 'string' || !sidebarState.workspacePaths.includes(workspacePath)) return null

  sidebarState.expandedWorkspacePaths = sidebarState.expandedWorkspacePaths.includes(workspacePath)
    ? sidebarState.expandedWorkspacePaths.filter((path) => path !== workspacePath)
    : [...sidebarState.expandedWorkspacePaths, workspacePath]
  await refreshWorkdirEntries()
  await persistSidebarState()
  broadcastSidebarState()
  return createSidebarSnapshot(win)
})

ipcMain.handle('set-active-sidebar-tab', async (event, tab: string) => {
  const win = getWinFromEvent(event)
  if (!win) return null
  const state = getState(win)
  state.activeSidebarTab = normalizeSidebarTab(tab)
  sendSidebarState(win)
  return createSidebarSnapshot(win)
})

ipcMain.handle('toggle-pinned-draft', async (event, draftId: string) => {
  const win = getWinFromEvent(event)
  if (!win) return null
  if (typeof draftId !== 'string' || !sidebarState.draftEntries.some((entry) => entry.id === draftId)) {
    return createSidebarSnapshot(win)
  }

  sidebarState.pinnedItems = togglePinnedItem(sidebarState.pinnedItems, { kind: 'draft', draftId })
  await persistSidebarState()
  broadcastSidebarState()
  return createSidebarSnapshot(win)
})

ipcMain.handle('toggle-pinned-file', async (event, filePath: string) => {
  const win = getWinFromEvent(event)
  if (!win) return null
  if (typeof filePath !== 'string' || !canTogglePinnedFile({
    filePath,
    fileExists: existsSync(filePath),
    knownWorkdirFiles: getState(win).workspaceTrees.flatMap((workspace) => flattenWorkdirTree(workspace.tree).map((entry) => entry.absolutePath)),
    recentFiles: sidebarState.recentFiles,
    currentFilePath: getState(win).filePath,
    pinnedItems: sidebarState.pinnedItems,
  })) {
    return createSidebarSnapshot(win)
  }

  sidebarState.pinnedItems = togglePinnedItem(sidebarState.pinnedItems, { kind: 'file', filePath })
  await persistSidebarState()
  broadcastSidebarState()
  return createSidebarSnapshot(win)
})

ipcMain.handle('choose-draft-directory', async (event) => {
  const win = getWinFromEvent(event)
  if (!win) return null
  const result = await dialog.showOpenDialog(win, {
    defaultPath: currentDocumentDirectory(win),
    properties: ['openDirectory'],
  })
  if (result.canceled || result.filePaths.length === 0) return null

  sidebarState.draftDirectoryPath = result.filePaths[0]
  registerDraftWorkspacePath(sidebarState.draftDirectoryPath)
  sidebarState.draftOnboardingCompleted = true
  await refreshWorkdirEntries()
  await persistSidebarState()
  broadcastSidebarState()
  return createSidebarSnapshot(win)
})

ipcMain.handle('skip-draft-onboarding', async (event) => {
  const win = getWinFromEvent(event)
  if (!win) return null
  sidebarState.draftDirectoryPath = getEffectiveDraftDirectoryPath()
  await mkdir(sidebarState.draftDirectoryPath, { recursive: true })
  registerDraftWorkspacePath(sidebarState.draftDirectoryPath)
  sidebarState.draftOnboardingCompleted = true
  await refreshWorkdirEntries()
  await persistSidebarState()
  broadcastSidebarState()
  return createSidebarSnapshot(win)
})

ipcMain.handle('clear-drafts', async (event) => {
  const win = getWinFromEvent(event)
  if (!win) return null
  return clearDraftsForAllWindows(win)
})

ipcMain.handle('remove-draft', async (event, draftId: string) => {
  const win = getWinFromEvent(event)
  if (!win) return null
  if (typeof draftId !== 'string') return createSidebarSnapshot(win)
  return removeDraftForAllWindows(win, draftId)
})

ipcMain.handle('open-sidebar-file', async (event, filePath: string) => {
  const win = getWinFromEvent(event)
  if (!win) return false
  if (typeof filePath !== 'string' || !existsSync(filePath)) {
    sidebarState.recentFiles = filterMissingRecentFiles(sidebarState.recentFiles, (candidate) => existsSync(candidate))
    persistSidebarState()
    broadcastSidebarState()
    return false
  }
  if (areTabsEnabled() && getState(win).rendererReady) {
    win.webContents.send('tab-open-request', { filePath, documentKind: 'file', draftId: null })
    return true
  }
  return loadFileInWindow(win, filePath)
})

ipcMain.handle('open-draft', async (event, draftId: string) => {
  const win = getWinFromEvent(event)
  if (!win) return false
  const draftEntry = sidebarState.draftEntries.find((entry) => entry.id === draftId)
  if (!draftEntry || !existsSync(draftEntry.path)) {
    removeDraftEntry({ draftId })
    broadcastSidebarState()
    return false
  }
  if (areTabsEnabled() && getState(win).rendererReady) {
    win.webContents.send('tab-open-request', { filePath: draftEntry.path, documentKind: 'draft', draftId: draftEntry.id })
    return true
  }
  return loadFileInWindow(win, draftEntry.path, {
    documentKind: 'draft',
    draftId: draftEntry.id,
    recordRecent: false,
  })
})

ipcMain.handle('remove-workdir-file', async (event, filePath: string) => {
  const win = getWinFromEvent(event)
  if (!win) return null
  if (typeof filePath !== 'string') return createSidebarSnapshot(win)
  return removeWorkdirFileForAllWindows(win, filePath)
})

ipcMain.handle('check-for-updates', async () => {
  await checkForUpdatesFromMenu()
})

ipcMain.handle('update-download', async () => {
  return startUpdateDownload()
})

ipcMain.handle('update-install', async () => {
  return installDownloadedUpdate()
})

ipcMain.handle('update-skip-version', async (_event, version: string) => {
  if (typeof version !== 'string') return false
  releaseNoticeState = withSkippedUpdateVersion(releaseNoticeState, version)
  setUpdateVersionSkipChecker((candidate) => isUpdateVersionSkipped(releaseNoticeState, candidate))
  await persistReleaseNoticeState()
  return true
})

ipcMain.handle('save-file', async (event, content: string) => {
  const win = getWinFromEvent(event)
  if (!win) return false
  const state = getState(win)

  if (shouldPromptForFormalSave(state.documentKind) || !state.filePath) {
    const result = await dialog.showSaveDialog(win, {
      defaultPath: suggestSavePath(win, suggestFileName(win, content)),
      message: state.documentKind === 'draft'
        ? '保存后会成为正式文件，并从草稿中移出。草稿内容已自动保存。'
        : undefined,
      filters: EDITABLE_FILE_FILTERS
    })
    if (result.canceled || !result.filePath) return false
    return saveFileAsForWindow(win, result.filePath, content)
  }

  return saveToPath(win, state.filePath, content, 'save')
})

ipcMain.handle('save-file-as', async (event, content: string, requestedMode?: AppSettings['saveAsMode']) => {
  const win = getWinFromEvent(event)
  if (!win) return false
  const previousSaveAsMode = appSettings.saveAsMode
  if (requestedMode === 'switch' || requestedMode === 'move') {
    appSettings = {
      ...appSettings,
      saveAsMode: requestedMode,
    }
  }
  const result = await dialog.showSaveDialog(win, {
    defaultPath: suggestSavePath(win, suggestFileName(win, content)),
    filters: EDITABLE_FILE_FILTERS
  })
  if (result.canceled || !result.filePath) return false
  try {
    return await saveFileAsForWindow(win, result.filePath, content)
  } finally {
    appSettings = {
      ...appSettings,
      saveAsMode: previousSaveAsMode,
    }
  }
})

ipcMain.handle('export-pdf', async (event) => {
  const win = getWinFromEvent(event)
  if (!win) return false
  const result = await dialog.showSaveDialog(win, {
    defaultPath: suggestSavePath(win),
    filters: [{ name: 'PDF', extensions: ['pdf'] }]
  })
  if (result.canceled || !result.filePath) return false

  try {
    // Expand editor to full content height for printing, and paint the current
    // theme background so a dark theme does not export onto white
    // (upstream 1dea467d).
    const background = await win.webContents.executeJavaScript(
      'getComputedStyle(document.body).backgroundColor'
    ) as string
    const cssKey = await win.webContents.insertCSS(
      `@page { margin: 0; } html, body { height: auto !important; overflow: visible !important; } html, body, #editor { background: ${background} !important; } #titlebar, #sidebar { display: none !important; } #workspace, #editor-shell, #editor { height: auto !important; overflow: visible !important; } #editor { padding: 20mm !important; } #editor .ProseMirror { min-height: auto !important; }`
    )
    try {
      const pdfData = await win.webContents.printToPDF({
        // Margins live in `margins`; the old top-level `marginType` was ignored,
        // which is where the white border came from.
        margins: { marginType: 'none' },
        printBackground: true,
        pageSize: 'A4'
      })
      await writeFile(result.filePath, pdfData)
      return true
    } finally {
      await win.webContents.removeInsertedCSS(cssKey)
    }
  } catch {
    return false
  }
})

ipcMain.handle('export-html', async (event, htmlContent: string) => {
  const win = getWinFromEvent(event)
  if (!win) return false
  const result = await dialog.showSaveDialog(win, {
    defaultPath: suggestSavePath(win),
    filters: [{ name: 'HTML', extensions: ['html'] }]
  })
  if (result.canceled || !result.filePath) return false

  try {
    await writeFile(result.filePath, htmlContent, 'utf-8')
    return true
  } catch {
    return false
  }
})

ipcMain.handle('export-docx', async (event, content: unknown) => {
  const win = getWinFromEvent(event)
  if (!win || typeof content !== 'string') return false
  win.show()
  win.focus()
  const baseName = suggestFileName(win, content) ?? 'untitled'
  const result = await dialog.showSaveDialog(win, {
    defaultPath: suggestSavePath(win, `${baseName}.docx`),
    filters: [{ name: 'Word Document', extensions: ['docx'] }]
  })
  if (result.canceled || !result.filePath) return false
  try {
    // Lazy-load so the docx bundle stays out of the startup package
    const { markdownToDocx } = await import('./docx-export')
    await writeFile(result.filePath, await markdownToDocx({ content, sourcePath: getState(win).filePath }))
    shell.showItemInFolder(result.filePath)
    return true
  } catch (error) {
    console.error('Word export failed', error)
    await dialog.showMessageBox(win, {
      type: 'error',
      buttons: ['好'],
      message: '无法导出 Word 文档',
      detail: error instanceof Error ? error.message : String(error),
    })
    return false
  }
})

ipcMain.handle('load-custom-theme', async (event) => {
  const win = getWinFromEvent(event)
  if (!win) return null
  const result = await dialog.showOpenDialog(win, {
    defaultPath: currentDocumentDirectory(win),
    filters: [{ name: 'CSS', extensions: ['css'] }],
    properties: ['openFile']
  })
  if (result.canceled || result.filePaths.length === 0) return null

  try {
    const srcPath = result.filePaths[0]
    const fileName = basename(srcPath)
    const destPath = join(themesDir, fileName)
    await copyFile(srcPath, destPath)
    const css = await readFile(destPath, 'utf-8')
    buildMenu() // rebuild menu to include new theme
    return { name: fileName, css }
  } catch {
    return null
  }
})

ipcMain.handle('load-theme-css', async (_event, fileName: string) => {
  try {
    return await readFile(join(themesDir, fileName), 'utf-8')
  } catch {
    return null
  }
})

ipcMain.handle('create-new-window', async (event) => {
  createWindowMatchingSize(getWinFromEvent(event))
  return true
})

ipcMain.handle('window-minimize', async (event) => {
  const win = getWinFromEvent(event)
  if (!win) return false
  win.minimize()
  return true
})

ipcMain.handle('window-toggle-maximize', async (event) => {
  const win = getWinFromEvent(event)
  if (!win) return false
  if (win.isMaximized()) {
    win.unmaximize()
  } else {
    win.maximize()
  }
  return true
})

ipcMain.handle('window-close', async (event) => {
  const win = getWinFromEvent(event)
  if (!win) return false
  win.close()
  return true
})

// Menu — targets the focused window

function getFocusedWindow(): BrowserWindow | null {
  return BrowserWindow.getFocusedWindow()
}

function sendToFocused(channel: string, ...args: unknown[]): void {
  const win = getFocusedWindow()
  if (win) win.webContents.send(channel, ...args)
}

function shortcutFor(action: ShortcutAction): string {
  return appSettings.shortcuts[action] ?? DEFAULT_SHORTCUTS[action]
}

function buildMenu(): void {
  const isMac = process.platform === 'darwin'

  // Scan custom themes synchronously for menu building
  const customThemeItems: Electron.MenuItemConstructorOptions[] = []
  try {
    const files = readdirSync(themesDir).filter((f: string) => f.endsWith('.css')).sort()
    for (const file of files) {
      customThemeItems.push({
        label: file.replace(/\.css$/, ''),
        click: async () => {
          try {
            const css = await readFile(join(themesDir, file), 'utf-8')
            sendToFocused('set-theme', `custom:${file}`)
            sendToFocused('set-custom-css', css)
          } catch { /* ignore */ }
        }
      })
    }
  } catch { /* themes dir may not exist yet */ }

  const themeSubmenu: Electron.MenuItemConstructorOptions[] = [
    { label: 'Light', click: () => sendToFocused('set-theme', 'light') },
    { label: 'Dark', click: () => sendToFocused('set-theme', 'dark') },
    { label: 'Elegant', click: () => sendToFocused('set-theme', 'elegant') },
    { label: 'Newsprint', click: () => sendToFocused('set-theme', 'newsprint') },
  ]
  if (customThemeItems.length > 0) {
    themeSubmenu.push({ type: 'separator' }, ...customThemeItems)
  }
  themeSubmenu.push({ type: 'separator' }, {
    label: 'Import Theme...',
    click: () => sendToFocused('menu-import-theme')
  })

  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac ? [{
      label: 'LyraMD',
      submenu: [
        { role: 'about' as const },
        { type: 'separator' as const },
        { role: 'hide' as const },
        { role: 'hideOthers' as const },
        { role: 'unhide' as const },
        { type: 'separator' as const },
        { role: 'quit' as const }
      ]
    }] : []),
    {
      label: '文件',
      submenu: [
        {
          label: '新建',
          accelerator: 'CmdOrCtrl+N',
          click: () => sendToFocused('menu-new-file-in-window')
        },
        {
          label: '新建窗口',
          accelerator: 'CmdOrCtrl+Shift+N',
          click: () => { createWindowMatchingSize(getFocusedWindow()) }
        },
        {
          label: '新建标签页',
          accelerator: 'CmdOrCtrl+T',
          click: () => {
            const focused = getFocusedWindow()
            if (!focused) return
            if (areTabsEnabled() && getState(focused).rendererReady) {
              // 开启标签页：渲染层 flush 后在当前窗口开新 tab
              focused.webContents.send('tab-new-request')
            } else {
              // 未开启标签页：保持现状行为（新窗口）
              createWindowMatchingSize(focused)
            }
          }
        },
        {
          label: '打开…',
          accelerator: 'CmdOrCtrl+O',
          click: () => sendToFocused('menu-open')
        },
        { type: 'separator' },
        {
          label: '保存',
          accelerator: shortcutFor('save'),
          click: () => sendToFocused('menu-save')
        },
        {
          label: '另存为…',
          accelerator: shortcutFor('saveAs'),
          click: () => sendToFocused('menu-save-as')
        },
        { type: 'separator' },
        {
          label: '导出 PDF…',
          click: () => sendToFocused('menu-export-pdf')
        },
        {
          label: '导出 HTML…',
          click: () => sendToFocused('menu-export-html')
        },
        {
          label: '导出 Word…',
          click: () => sendToFocused('menu-export-docx')
        },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' }
      ]
    },
    {
      label: '编辑',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
        { type: 'separator' },
        {
          label: '查找',
          accelerator: shortcutFor('search'),
          click: () => sendToFocused('menu-search')
        }
      ]
    },
    {
      label: '查看',
      submenu: [
        {
          label: '切换侧边栏',
          accelerator: shortcutFor('toggleSidebar'),
          click: () => { toggleSidebarForWindow(getFocusedWindow()) }
        },
        {
          label: '切换大纲',
          accelerator: shortcutFor('toggleOutline'),
          click: () => sendToFocused('menu-toggle-outline')
        },
        { type: 'separator' },
        {
          label: '放大',
          accelerator: 'CmdOrCtrl+=',
          click: () => sendToFocused('menu-zoom', { delta: 1 })
        },
        {
          label: '缩小',
          accelerator: 'CmdOrCtrl+-',
          click: () => sendToFocused('menu-zoom', { delta: -1 })
        },
        {
          label: '重置缩放',
          accelerator: 'CmdOrCtrl+0',
          click: () => sendToFocused('menu-zoom', { level: 0 })
        },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: '格式',
      submenu: [
        {
          label: '清理中英排版',
          accelerator: shortcutFor('cleanCjkTypography'),
          click: () => sendToFocused('menu-clean-cjk-typography')
        },
        {
          label: '插入公式',
          accelerator: shortcutFor('insertFormula'),
          click: () => sendToFocused('menu-insert-math')
        }
      ]
    },
    {
      label: '主题',
      submenu: themeSubmenu
    },
    {
      label: '工具',
      submenu: [
        {
          label: 'AI 精灵',
          accelerator: shortcutFor('openAiPalette'),
          click: () => sendToFocused('menu-open-ai-palette')
        }
      ]
    },
    {
      label: '设置',
      submenu: [
        {
          label: '打开设置',
          accelerator: shortcutFor('settings'),
          click: () => {
            // 与设置按钮同路径：在当前主窗口内打开全屏设置，不再弹独立设置窗
            const focused = BrowserWindow.getFocusedWindow()
            if (focused && focused.webContents.getURL().includes('settingsWindow=1')) {
              focused.close()
              return
            }
            const target = focused ?? getDialogParentWindow()
            target?.webContents.send('menu-settings')
          }
        }
      ]
    },
    {
      label: '帮助',
      submenu: [
        {
          label: 'Markdown 语法速查',
          accelerator: shortcutFor('openCheatsheet'),
          click: () => openCheatsheet()
        },
        {
          label: '新功能演示',
          submenu: [
            {
              label: '功能总览',
              click: () => openDemo('changelog.md')
            },
            {
              label: '待办列表',
              click: () => openDemo('tasks.md')
            },
            {
              label: '格式速览',
              click: () => openDemo('format.md')
            },
            {
              label: 'Agent 同步',
              click: () => openDemo('agent-sim.md')
            }
          ]
        },
        {
          label: '检查更新…',
          click: () => {
            checkForUpdatesFromMenu().catch(() => {})
          }
        },
        { type: 'separator' },
        {
          label: '关于 LyraMD',
          click: () => shell.openExternal('https://github.com/Afeng01/LyraMD')
        }
      ]
    }
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

// App lifecycle

if (hasSingleInstanceLock) {
  app.whenReady().then(() => {
    Promise.all([ensureAppDataDir(), ensureThemesDir()])
      .then(() => Promise.all([loadSidebarState(), loadSessionState(), loadSettingsState(), loadReleaseNoticeState()]))
      .catch(() => {})
      .finally(() => {
        registerLocalMediaProtocol()
        configureAutoUpdates()
        scheduleInstalledBundleRefreshChecks()
        buildMenu()

        queuePendingFilePaths(extractEditableLaunchPaths(process.argv, { isPackaged: app.isPackaged }))

        if (pendingFilePaths.length > 0) {
          for (const fp of pendingFilePaths) {
            createWindow({ filePath: fp, documentKind: 'file' })
          }
          pendingFilePaths = []
        } else {
          // 阶段 C ④：启动恢复分支判定下沉为纯函数 decideStartupRestore（行为不变，可测）。
          // 优先级：整组 tab 快照（开关开启）> 草稿 > 全新「未命名文档」tab；
          // 上次是单文档 file 时现状即落 blank——旧格式遗留行为，不扩大也不收回。
          const lastActiveDocument = persistedSessionState.lastActiveDocument
          const lastActiveDraftPath = lastActiveDocument?.kind === 'draft'
            && existsSync(lastActiveDocument.filePath)
            ? lastActiveDocument.filePath
            : null
          const restorePlan = decideStartupRestore({
            tabsEnabled: areTabsEnabled(),
            hasTabSession: Boolean(persistedSessionState.tabs && persistedSessionState.activeTabId),
            lastActiveDraftPath,
          })
          if (restorePlan === 'tab-session') {
            // 阶段 A 会话恢复：开关开启且快照有效，整组恢复上次退出的标签集合（含 blank）。
            const win = createWindow()
            void restoreSessionTabsInWindow(win, {
              tabs: persistedSessionState.tabs,
              activeTabId: persistedSessionState.activeTabId,
            })
          } else if (restorePlan === 'draft' && lastActiveDraftPath) {
            createWindow({
              filePath: lastActiveDraftPath,
              documentKind: 'draft',
              draftId: lastActiveDocument?.draftId ?? null,
            })
          } else {
            createWindow()
          }
        }
        void mcpBridge.start().catch(() => {})

        // 启动提速：首窗先创建（草稿/最近文件立即可用），工作目录扫描与
        // 递归 watcher 挂载改为后台执行，完成后广播刷新侧边栏。
        void refreshWorkdirEntries()
          .then(() => broadcastSidebarState())
          .catch(() => {})

        // 首启一次性打开更新日志（在主窗口之后创建，避免抢启动焦点顺序）
        void maybeOpenReleaseNotesOnce().catch((error: Error) => {
          console.error('[update-notice] failed to open release notes', error)
        })

        app.on('activate', () => {
          void checkForInstalledBundleRefresh().catch(() => {})
          if (BrowserWindow.getAllWindows().length === 0) createWindow()
        })
      })
  })
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', async (event) => {
  stopWatchingWorkdir()
  if (installedBundleRefreshCheckTimer) {
    clearInterval(installedBundleRefreshCheckTimer)
    installedBundleRefreshCheckTimer = null
  }
  if (sidebarQuitFlushStarted) return

  event.preventDefault()
  sidebarQuitFlushStarted = true
  try {
    await mcpBridge.stop()
    await persistSidebarState()
  } catch {
    // Quit should not be blocked by an app-data write failure.
  } finally {
    app.quit()
  }
})

app.on('open-file', (event, filePath) => {
  event.preventDefault()
  if (app.isReady()) {
    openFile(filePath)
  } else {
    pendingFilePaths.push(filePath)
  }
})
