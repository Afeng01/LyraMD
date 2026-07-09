import { app, BrowserWindow, dialog, ipcMain, Menu, net, protocol, shell } from 'electron'
import { join, basename, dirname, extname, relative } from 'path'
import { readFile, writeFile, readdir, copyFile, mkdir, rename, unlink } from 'fs/promises'
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
  decideWatchEvent,
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
import { resolveNewWorkdirFolderPath, resolveNewWorkdirMarkdownPath, scanWorkdir, scanWorkdirTree, shouldRefreshWorkdirForWatchEvent, type WorkdirEntry, type WorkdirTreeNode } from './workdir'
import { moveFileToTrashAndVerify } from './file-removal'
import { summarizeAgentChange } from './agent-change-summary'
import {
  clearCrashRecoveryState,
  createDocumentRevisionKey,
  listRevisionSnapshots,
  moveDocumentRevisionSnapshots,
  readCrashRecoveryState,
  readRevisionSnapshotById,
  recordRevisionSnapshot,
  writeCrashRecoveryState,
  type CrashRecoveryState,
  type RevisionDocumentKind,
  type RevisionReason,
  type RevisionSnapshotInput,
  type StoredRevisionSnapshot,
} from './revision-store'
import { createSettingsWindowOptions, createWindowOptions } from './window-platform'
import { EDITABLE_FILE_FILTERS } from './file-extensions'
import { decideSecondInstanceAction, extractEditableLaunchPaths } from './windows-launch'
import { resolveZoomShortcut } from './zoom-shortcuts'
import {
  addWorkspacePath,
  canTogglePinnedFile,
  migratePinnedDraftToFile,
  normalizeSidebarTab,
  removePinnedFile,
  replacePinnedFilePath,
  reorderWorkspacePaths,
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
import { checkForUpdatesFromMenu, configureAutoUpdates } from './updater'
import { LOCAL_MEDIA_PROTOCOL, localMediaUrlToAbsolutePath } from '../shared/local-media'

// Custom themes directory
const appDataDir = join(app.getPath('home'), '.lyramd')
const themesDir = join(appDataDir, 'themes')
const sidebarStatePath = join(appDataDir, 'sidebar-state.json')
const sessionStatePath = join(appDataDir, 'session-state.json')
const settingsPath = join(appDataDir, 'settings.json')
const revisionsDir = join(appDataDir, 'revisions')
const crashRecoveryStatePath = join(appDataDir, 'crash-recovery.json')
const mcpBridgeFilePath = getMcpBridgeFilePath(appDataDir)
const DRAWER_BREAKPOINT = 960

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
}

interface SidebarSnapshot extends PersistedSidebarState {
  currentDocumentKind: DocumentKind
  currentFilePath: string | null
  currentDraftId: string | null
  currentDisplayTitle: string
  isDrawerMode: boolean
  workdirEntries: WorkdirEntry[]
  workdirTree: WorkdirTreeNode[]
}

let sidebarState: PersistedSidebarState = normalizeSidebarState(null)
let workdirWatchers: FSWatcher[] = []
let watchedWorkdirPaths: string[] = []
let workdirRefreshTimer: NodeJS.Timeout | null = null
let persistedSessionState: PersistedSessionState = {
  lastActiveDocument: null,
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
  const defaultWorkdirPath = sidebarState.workdirPath && existsSync(sidebarState.workdirPath)
    ? sidebarState.workdirPath
    : existingWorkspacePaths[0] ?? null

  sidebarState.workspacePaths = existingWorkspacePaths
  sidebarState.workdirPath = defaultWorkdirPath
  watchWorkdirPaths(existingWorkspacePaths)

  const windows = BrowserWindow.getAllWindows()
  await Promise.all(windows.map((win) => refreshWorkdirEntriesForWindow(win)))
}

async function refreshWorkdirEntriesForWindow(win: BrowserWindow): Promise<void> {
  const state = getState(win)
  const existingWorkspacePaths = sidebarState.workspacePaths.filter((workspacePath) => existsSync(workspacePath))
  const activeWorkdirPath = state.workdirPath && existingWorkspacePaths.includes(state.workdirPath)
    ? state.workdirPath
    : sidebarState.workdirPath && existingWorkspacePaths.includes(sidebarState.workdirPath)
      ? sidebarState.workdirPath
      : existingWorkspacePaths[0] ?? null

  state.workdirPath = activeWorkdirPath

  if (!activeWorkdirPath || existingWorkspacePaths.length === 0) {
    state.workdirEntries = []
    state.workdirTree = []
    return
  }

  try {
    state.workdirEntries = await scanWorkdir(activeWorkdirPath)
    state.workdirTree = await scanWorkdirTree(activeWorkdirPath)
  } catch {
    state.workdirEntries = []
    state.workdirTree = []
  }
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
  await persistSidebarState()
  await refreshWorkdirEntries()
}

async function loadSessionState(): Promise<void> {
  try {
    const raw = await readFile(sessionStatePath, 'utf-8')
    const parsed = JSON.parse(raw) as Partial<PersistedSessionState>
    const lastActiveDocument = parsed.lastActiveDocument
    if (
      lastActiveDocument
      && (lastActiveDocument.kind === 'draft' || lastActiveDocument.kind === 'file')
      && typeof lastActiveDocument.filePath === 'string'
    ) {
      persistedSessionState = {
        lastActiveDocument: {
          kind: lastActiveDocument.kind,
          filePath: lastActiveDocument.filePath,
          draftId: typeof lastActiveDocument.draftId === 'string' ? lastActiveDocument.draftId : null,
        },
      }
      return
    }
  } catch {
    // fall through to defaults
  }

  persistedSessionState = {
    lastActiveDocument: null,
  }
}

async function loadSettingsState(): Promise<void> {
  appSettings = await loadAppSettings(settingsPath)
}

// Per-window state
interface WindowState {
  activeSidebarTab: PersistedSidebarState['activeSidebarTab']
  drawerSidebarOpen: boolean
  desktopSidebarOpen: boolean
  isDrawerMode: boolean
  documentKind: DocumentKind
  filePath: string | null
  draftId: string | null
  displayTitle: string
  lastSyncedContent: string | null
  ignoredWatchedContents: Map<string, number>
  watcher: FSWatcher | null
  isInternalSave: boolean
  debounceTimer: ReturnType<typeof setTimeout> | null
  agentState: 'idle' | 'active' | 'cooldown'
  lastExternalChange: number
  agentCooldownTimer: ReturnType<typeof setTimeout> | null
  workdirPath: string | null
  workdirEntries: WorkdirEntry[]
  workdirTree: WorkdirTreeNode[]
}

const windowStates = new Map<number, WindowState>()
let settingsWindow: BrowserWindow | null = null
let pendingFilePaths: string[] = []
const hasSingleInstanceLock = app.isPackaged ? app.requestSingleInstanceLock() : true

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

function getState(win: BrowserWindow): WindowState {
  let state = windowStates.get(win.id)
  if (!state) {
    const sidebarViewState = createWindowSidebarViewState(sidebarState)
    state = {
      activeSidebarTab: sidebarViewState.activeSidebarTab,
      drawerSidebarOpen: false,
      desktopSidebarOpen: sidebarState.sidebarOpen,
      isDrawerMode: false,
      documentKind: 'blank',
      filePath: null,
      draftId: null,
      displayTitle: '未命名文档',
      lastSyncedContent: null,
      ignoredWatchedContents: new Map<string, number>(),
      watcher: null,
      isInternalSave: false,
      debounceTimer: null,
      agentState: 'idle',
      lastExternalChange: 0,
      agentCooldownTimer: null,
      workdirPath: sidebarViewState.workdirPath,
      workdirEntries: [],
      workdirTree: [],
    }
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
    workdirEntries: state.workdirEntries,
    workdirTree: state.workdirTree,
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
  return restoreRevisionSnapshotToDraft(triggerWin, snapshot, 'restore')
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
  const currentRoot = getWorkspaceRootForPath(state.filePath)
  if (currentRoot && existsSync(currentRoot)) return currentRoot
  if (state.workdirPath && existsSync(state.workdirPath)) return state.workdirPath
  if (sidebarState.workdirPath && existsSync(sidebarState.workdirPath)) return sidebarState.workdirPath
  return sidebarState.workspacePaths.find((workspacePath) => existsSync(workspacePath)) ?? null
}

function createWindow(initialDocument?: { filePath: string; documentKind?: Exclude<DocumentKind, 'blank'>; draftId?: string | null }): BrowserWindow {
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
    }
  })

  win.webContents.on('render-process-gone', (_event, details) => {
    if (details.reason === 'clean-exit') return
    void persistCrashRecoveryForWindowState(state, formatCrashReasonLabel(details.reason))
  })

  win.on('closed', () => {
    stopWatching(state)
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

  persistSessionState()
}

function defaultDraftDirectoryPath(): string {
  return join(app.getPath('documents'), 'LyraMD Drafts')
}

function getEffectiveDraftDirectoryPath(): string {
  return sidebarState.draftDirectoryPath ?? defaultDraftDirectoryPath()
}

function updateTitle(win: BrowserWindow): void {
  const state = getState(win)
  win.setTitle(`${state.displayTitle} — LyraMD`)
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

function stopWatching(state: WindowState): void {
  if (state.watcher) {
    state.watcher.close()
    state.watcher = null
  }
  if (state.debounceTimer) {
    clearTimeout(state.debounceTimer)
    state.debounceTimer = null
  }
  if (state.agentCooldownTimer) {
    clearTimeout(state.agentCooldownTimer)
    state.agentCooldownTimer = null
  }
  state.agentState = 'idle'
  state.lastExternalChange = 0
}

function transitionAgentState(win: BrowserWindow, state: WindowState, newState: 'idle' | 'active' | 'cooldown'): void {
  if (state.agentCooldownTimer) {
    clearTimeout(state.agentCooldownTimer)
    state.agentCooldownTimer = null
  }

  if (newState === 'active') {
    if (state.agentState !== 'active') {
      state.agentState = 'active'
      if (!win.isDestroyed()) win.webContents.send('agent-activity', 'active')
    }
    // Reset cooldown timer — 3s after last write
    state.agentCooldownTimer = setTimeout(() => {
      transitionAgentState(win, state, 'cooldown')
    }, 3000)
  } else if (newState === 'cooldown') {
    state.agentState = 'cooldown'
    if (!win.isDestroyed()) win.webContents.send('agent-activity', 'cooldown')
    state.agentCooldownTimer = setTimeout(() => {
      transitionAgentState(win, state, 'idle')
    }, 2000)
  } else {
    state.agentState = 'idle'
    if (!win.isDestroyed()) win.webContents.send('agent-activity', 'idle')
  }
}

function watchFile(win: BrowserWindow, state: WindowState): void {
  if (!state.filePath) return
  stopWatching(state)
  const filePath = state.filePath
  state.watcher = watchTargetFile(filePath, (eventType) => {
    const watchDecision = decideWatchEvent(eventType)
    if (!watchDecision.shouldReadFile) return

    if (state.debounceTimer) clearTimeout(state.debounceTimer)
    state.debounceTimer = setTimeout(() => {
      readFile(filePath, 'utf-8')
        .then((data) => {
          if (consumeIgnoredWatchedContent(state.ignoredWatchedContents, data)) return
          const previousContent = state.lastSyncedContent ?? ''
          const syncDecision = reconcileWatchedContent(state.lastSyncedContent, data)
          if (!syncDecision.shouldPropagate) return
          if (previousContent !== data && previousContent.length > 0) {
            void recordRevisionForWindowState(state, previousContent, 'external-change')
          }
          state.lastSyncedContent = syncDecision.nextSyncedContent
          const changeSummary = summarizeAgentChange(previousContent, data)

          // Agent activity detection
          const now = Date.now()
          const gap = now - state.lastExternalChange
          state.lastExternalChange = now
          if (gap > 0 && gap < 2000) {
            transitionAgentState(win, state, 'active')
          } else if (state.agentState === 'active') {
            transitionAgentState(win, state, 'active')
          }
          if (state.documentKind === 'draft' && state.draftId) {
            const nextEntry = findDraftEntryById(state.draftId)
            if (nextEntry) {
              updateDraftEntry({
                ...nextEntry,
                updatedAt: Date.now(),
                displayTitle: deriveDraftDisplayTitle(data, nextEntry.manualTitle),
              })
              state.displayTitle = resolveDraftDisplayTitle(state.draftId, data)
              updateTitle(win)
            }
          } else if (state.documentKind === 'file' && state.filePath) {
            state.displayTitle = resolveFileDisplayTitle(state.filePath, data)
            updateTitle(win)
          }
          if (!win.isDestroyed()) {
            win.webContents.send('agent-change-summary', {
              previousContent,
              summary: changeSummary,
            })
          }
          if (!win.isDestroyed()) win.webContents.send('file-changed', data)
          if (!win.isDestroyed()) sendSidebarState(win)
        })
        .catch(() => {})
    }, 100)
  })
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
    win.webContents.send('file-opened', { path: filePath, content: data })
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

// Open file: reuse existing window or create new one
function openFile(filePath: string): void {
  // If already open, focus that window
  const existing = findWindowForFile(filePath)
  if (existing) {
    recordRecentFile(filePath)
    broadcastSidebarState()
    existing.focus()
    return
  }

  // Find an untitled empty window to reuse
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
  try {
    const previousFilePath = state.filePath
    const previousDisplayTitle = state.displayTitle
    state.isInternalSave = true
    await writeFile(filePath, content, 'utf-8')
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
    broadcastSidebarState()
    return true
  } catch {
    return false
  } finally {
    setTimeout(() => { state.isInternalSave = false }, 100)
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
      state.isInternalSave = true
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
    } finally {
      setTimeout(() => { state.isInternalSave = false }, 100)
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

  const nextPath = resolveNewWorkdirMarkdownPath(creationRoot, (candidatePath) => existsSync(candidatePath))
  await writeFile(nextPath, '', 'utf-8')
  state.workdirPath = creationRoot
  state.activeSidebarTab = 'workdir'
  sidebarState.workdirPath = creationRoot
  await refreshWorkdirEntriesForWindow(win)
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
  await refreshWorkdirEntriesForWindow(win)
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
    filters: EDITABLE_FILE_FILTERS,
    properties: ['openFile']
  })
  if (result.canceled || result.filePaths.length === 0) return null

  const filePath = result.filePaths[0]

  // If this window has no file, load here; otherwise open in new window
  const state = getState(win)
  if (state.documentKind === 'blank') {
    loadFileInWindow(win, filePath)
    return null
  } else {
    openFile(filePath)
    return null
  }
})

ipcMain.handle('open-file-path', async (event, filePath: string) => {
  const win = getWinFromEvent(event)
  if (!win) return null
  const state = getState(win)

  // If this window has no file, load here
  if (state.documentKind === 'blank') {
    loadFileInWindow(win, filePath)
    return null
  } else {
    openFile(filePath)
    return null
  }
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

ipcMain.handle('toggle-drafts-expanded', async () => {
  sidebarState.draftsExpanded = !sidebarState.draftsExpanded
  persistSidebarState()
  broadcastSidebarState()
  return sidebarState.draftsExpanded
})

ipcMain.handle('toggle-workdir-expanded', async () => {
  sidebarState.workdirExpanded = !sidebarState.workdirExpanded
  persistSidebarState()
  broadcastSidebarState()
  return sidebarState.workdirExpanded
})

ipcMain.handle('toggle-pinned-expanded', async () => {
  sidebarState.pinnedExpanded = !sidebarState.pinnedExpanded
  persistSidebarState()
  broadcastSidebarState()
  return sidebarState.pinnedExpanded
})

ipcMain.handle('toggle-recent-files-expanded', async () => {
  sidebarState.recentFilesExpanded = !sidebarState.recentFilesExpanded
  persistSidebarState()
  broadcastSidebarState()
  return sidebarState.recentFilesExpanded
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
    properties: ['openDirectory'],
  })

  if (result.canceled || result.filePaths.length === 0) return null

  state.workdirPath = result.filePaths[0]
  sidebarState.workdirPath = state.workdirPath
  sidebarState.workspacePaths = addWorkspacePath(sidebarState.workspacePaths, state.workdirPath)
  await refreshWorkdirEntriesForWindow(win)
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
  sidebarState.workdirPath = workspacePath
  await refreshWorkdirEntriesForWindow(win)
  await persistSidebarState()
  broadcastSidebarState()
  return createSidebarSnapshot(win)
})

ipcMain.handle('remove-workspace', async (event, workspacePath: string) => {
  const win = getWinFromEvent(event)
  if (!win) return null
  if (typeof workspacePath !== 'string') return createSidebarSnapshot(win)

  const next = removeWorkspacePath(sidebarState.workspacePaths, workspacePath, sidebarState.workdirPath)
  sidebarState.workspacePaths = next.workspacePaths
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

ipcMain.handle('reorder-workspaces', async (event, sourcePath: string, targetPath: string) => {
  const win = getWinFromEvent(event)
  if (!win) return null
  if (typeof sourcePath !== 'string' || typeof targetPath !== 'string') {
    return createSidebarSnapshot(win)
  }

  sidebarState.workspacePaths = reorderWorkspacePaths(sidebarState.workspacePaths, sourcePath, targetPath)
  await persistSidebarState()
  broadcastSidebarState()
  return createSidebarSnapshot(win)
})

ipcMain.handle('create-workdir-file', async (event) => {
  const win = getWinFromEvent(event)
  if (!win) return null
  return createWorkdirFileInWindow(win)
})

ipcMain.handle('create-workdir-folder', async (event) => {
  const win = getWinFromEvent(event)
  if (!win) return null
  return createWorkdirFolderInWindow(win)
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
    knownWorkdirFiles: getState(win).workdirEntries.map((entry) => entry.absolutePath),
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
    properties: ['openDirectory'],
  })
  if (result.canceled || result.filePaths.length === 0) return null

  sidebarState.draftDirectoryPath = result.filePaths[0]
  sidebarState.draftOnboardingCompleted = true
  persistSidebarState()
  broadcastSidebarState()
  return createSidebarSnapshot(win)
})

ipcMain.handle('skip-draft-onboarding', async (event) => {
  const win = getWinFromEvent(event)
  if (!win) return null
  sidebarState.draftDirectoryPath = getEffectiveDraftDirectoryPath()
  sidebarState.draftOnboardingCompleted = true
  persistSidebarState()
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
  return loadFileInWindow(win, draftEntry.path, {
    documentKind: 'draft',
    draftId: draftEntry.id,
    recordRecent: false,
  })
})

ipcMain.handle('remove-recent-file', async (_event, filePath: string) => {
  if (typeof filePath !== 'string') return false
  sidebarState.recentFiles = removeRecentFile(sidebarState.recentFiles, filePath)
  persistSidebarState()
  broadcastSidebarState()
  return true
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

ipcMain.handle('save-file', async (event, content: string) => {
  const win = getWinFromEvent(event)
  if (!win) return false
  const state = getState(win)

  if (shouldPromptForFormalSave(state.documentKind) || !state.filePath) {
    const result = await dialog.showSaveDialog(win, {
      defaultPath: suggestFileName(win, content),
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
    defaultPath: suggestFileName(win, content),
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
    defaultPath: suggestFileName(win),
    filters: [{ name: 'PDF', extensions: ['pdf'] }]
  })
  if (result.canceled || !result.filePath) return false

  try {
    // Expand editor to full content height for printing
    const cssKey = await win.webContents.insertCSS(
      'html, body { height: auto !important; overflow: visible !important; } #titlebar, #sidebar { display: none !important; } #workspace, #editor-shell, #editor { height: auto !important; overflow: visible !important; } #editor .ProseMirror { min-height: auto !important; }'
    )
    const pdfData = await win.webContents.printToPDF({
      marginType: 0,
      printBackground: true,
      pageSize: 'A4'
    })
    await win.webContents.removeInsertedCSS(cssKey)
    await writeFile(result.filePath, pdfData)
    return true
  } catch {
    return false
  }
})

ipcMain.handle('export-html', async (event, htmlContent: string) => {
  const win = getWinFromEvent(event)
  if (!win) return false
  const result = await dialog.showSaveDialog(win, {
    defaultPath: suggestFileName(win),
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

ipcMain.handle('load-custom-theme', async (event) => {
  const win = getWinFromEvent(event)
  if (!win) return null
  const result = await dialog.showOpenDialog(win, {
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
          click: () => { openSettingsWindow() }
        }
      ]
    },
    {
      label: '帮助',
      submenu: [
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
      .then(() => Promise.all([loadSidebarState(), loadSessionState(), loadSettingsState()]))
      .catch(() => {})
      .finally(() => {
        registerLocalMediaProtocol()
        configureAutoUpdates()
        buildMenu()

        queuePendingFilePaths(extractEditableLaunchPaths(process.argv, { isPackaged: app.isPackaged }))

        if (pendingFilePaths.length > 0) {
          for (const fp of pendingFilePaths) {
            createWindow({ filePath: fp, documentKind: 'file' })
          }
          pendingFilePaths = []
        } else if (
          persistedSessionState.lastActiveDocument?.kind === 'draft'
          && existsSync(persistedSessionState.lastActiveDocument.filePath)
        ) {
          createWindow({
            filePath: persistedSessionState.lastActiveDocument.filePath,
            documentKind: 'draft',
            draftId: persistedSessionState.lastActiveDocument.draftId ?? null,
          })
        } else {
          createWindow()
        }

        void mcpBridge.start().catch(() => {})

        app.on('activate', () => {
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
