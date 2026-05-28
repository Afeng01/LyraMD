import { app, BrowserWindow, ipcMain, dialog, Menu, shell } from 'electron'
import { join, basename, dirname, extname, relative } from 'path'
import { readFile, writeFile, readdir, copyFile, mkdir, rename, unlink } from 'fs/promises'
import { FSWatcher, existsSync, readdirSync, watch } from 'fs'
import {
  clampSidebarWidth,
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
import { buildTitleSyncPath, decideTitleSync } from './title-sync'
import { resolveNewWorkdirFolderPath, resolveNewWorkdirMarkdownPath, scanWorkdir, scanWorkdirTree, shouldRefreshWorkdirForWatchEvent, type WorkdirEntry, type WorkdirTreeNode } from './workdir'
import { moveFileToTrashAndVerify } from './file-removal'
import { summarizeAgentChange } from './agent-change-summary'
import { createWindowOptions } from './window-platform'
import { decideSecondInstanceAction, extractMarkdownLaunchPaths } from './windows-launch'
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
import { completeAiHelperPrompt } from './ai-provider'

// Custom themes directory
const appDataDir = join(app.getPath('home'), '.lyramd')
const themesDir = join(appDataDir, 'themes')
const sidebarStatePath = join(appDataDir, 'sidebar-state.json')
const sessionStatePath = join(appDataDir, 'session-state.json')
const settingsPath = join(appDataDir, 'settings.json')
const mcpBridgeFilePath = getMcpBridgeFilePath(appDataDir)
const DRAWER_BREAKPOINT = 960

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
let workdirEntries: WorkdirEntry[] = []
let workdirTree: WorkdirTreeNode[] = []
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
  const activeWorkdirPath = sidebarState.workdirPath && existsSync(sidebarState.workdirPath)
    ? sidebarState.workdirPath
    : existingWorkspacePaths[0] ?? null

  sidebarState.workspacePaths = existingWorkspacePaths
  sidebarState.workdirPath = activeWorkdirPath

  if (!activeWorkdirPath || existingWorkspacePaths.length === 0) {
    workdirEntries = []
    workdirTree = []
    watchWorkdirPaths([])
    return
  }

  try {
    workdirEntries = await scanWorkdir(activeWorkdirPath)
    workdirTree = await scanWorkdirTree(activeWorkdirPath)
    watchWorkdirPaths([activeWorkdirPath])
  } catch {
    workdirEntries = []
    workdirTree = []
    watchWorkdirPaths([])
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
}

const windowStates = new Map<number, WindowState>()
let pendingFilePaths: string[] = []
const hasSingleInstanceLock = app.isPackaged ? app.requestSingleInstanceLock() : true

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
    state = {
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
  const filePaths = extractMarkdownLaunchPaths(argv, { isPackaged: app.isPackaged })
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
    sidebarOpen,
    currentDocumentKind: state.documentKind,
    currentFilePath: state.filePath,
    currentDraftId: state.draftId,
    currentDisplayTitle: state.displayTitle,
    isDrawerMode: drawerMode,
    workdirEntries,
    workdirTree,
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

async function renameCurrentFileToPath(win: BrowserWindow, nextPath: string): Promise<{ path: string | null }> {
  const state = getState(win)
  if (!state.filePath || state.documentKind !== 'file') return { path: null }

  const previousPath = state.filePath
  if (previousPath === nextPath) return { path: nextPath }
  if (existsSync(nextPath)) return { path: null }

  const currentDisplayTitle = state.displayTitle
  await rename(previousPath, nextPath)
  moveFileTitleOverride(previousPath, nextPath)
  sidebarState.pinnedItems = replacePinnedFilePath(sidebarState.pinnedItems, previousPath, nextPath)
  await persistSidebarState()
  setFileDocumentState(win, nextPath, 'file', null)
  state.displayTitle = currentDisplayTitle
  updateTitle(win)
  replaceRecentFilePath(previousPath, nextPath)
  await persistSidebarState()
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
  try {
    await rename(previousPath, nextPath)
  } catch {
    return createSidebarSnapshot(triggerWin)
  }

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
    updateTitle(window)
  }

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
  const nextPath = resolveManualDraftPath(
    dirname(previousPath),
    trimmedTitle,
    (candidatePath) => candidatePath !== previousPath && existsSync(candidatePath),
  )

  if (nextPath !== previousPath) {
    await rename(previousPath, nextPath)
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
    sendSidebarState(win)
    if (initialDocument) {
      loadFileInWindow(win, initialDocument.filePath, {
        documentKind: initialDocument.documentKind,
        draftId: initialDocument.draftId,
        recordRecent: initialDocument.documentKind !== 'draft',
      })
    }
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
          state.lastSyncedContent = syncDecision.nextSyncedContent
          if (!syncDecision.shouldPropagate) return
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

async function saveToPath(win: BrowserWindow, filePath: string, content: string): Promise<boolean> {
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
      await writeFile(nextPath, content, 'utf-8')

      if (shouldRemoveSourceAfterSaveAs({
        documentKind: previousDocumentKind,
        currentPath: sourcePath,
        nextPath,
        saveAsMode: appSettings.saveAsMode,
      })) {
        await removeSourceFileAfterSaveAs(sourcePath)
      }

      removeDraftEntry({ draftId: sourceDraftId, draftPath: sourcePath })
      sidebarState.pinnedItems = migratePinnedDraftToFile(sidebarState.pinnedItems, sourceDraftId, nextPath)
      await persistSidebarState()
      recordIgnoredWatchedContent(state.ignoredWatchedContents, content)
      setFileDocumentState(win, nextPath, 'file', null)
      state.lastSyncedContent = content
      if (sourceDraft?.manualTitle) {
        setFileTitleOverride(nextPath, sourceDraft.manualTitle)
      }
      state.displayTitle = resolveFileDisplayTitle(nextPath, content)
      updateTitle(win)
      recordRecentFile(nextPath)
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

  const didSave = await saveToPath(win, nextPath, content)
  if (!didSave) return false

  if (shouldRemoveSourceAfterSaveAs({
    documentKind: previousDocumentKind,
    currentPath: sourcePath,
    nextPath,
    saveAsMode: appSettings.saveAsMode,
  }) && sourcePath) {
    try {
      await removeSourceFileAfterSaveAs(sourcePath)
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

  await saveToPath(win, state.filePath, content)
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

  if (sidebarState.workdirPath) {
    await refreshWorkdirEntries()
  }

  broadcastSidebarState()
  return createSidebarSnapshot(triggerWin)
}

async function createWorkdirFileInWindow(win: BrowserWindow): Promise<SidebarSnapshot> {
  const creationRoot = resolveWorkdirCreationRoot(win)
  if (!creationRoot) {
    return createSidebarSnapshot(win)
  }

  const nextPath = resolveNewWorkdirMarkdownPath(creationRoot, (candidatePath) => existsSync(candidatePath))
  await writeFile(nextPath, '', 'utf-8')
  sidebarState.workdirPath = creationRoot
  sidebarState.activeSidebarTab = 'workdir'
  await refreshWorkdirEntries()
  await persistSidebarState()
  await loadFileInWindow(win, nextPath, { documentKind: 'file' })
  broadcastSidebarState()
  return createSidebarSnapshot(win)
}

async function createWorkdirFolderInWindow(win: BrowserWindow): Promise<SidebarSnapshot> {
  const creationRoot = resolveWorkdirCreationRoot(win)
  if (!creationRoot) {
    return createSidebarSnapshot(win)
  }

  const nextPath = resolveNewWorkdirFolderPath(creationRoot, (candidatePath) => existsSync(candidatePath))
  await mkdir(nextPath)
  sidebarState.workdirPath = creationRoot
  sidebarState.activeSidebarTab = 'workdir'
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

  if (sidebarState.workdirPath) {
    await refreshWorkdirEntries()
  }

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
    filters: [
      { name: 'Markdown', extensions: ['md', 'markdown', 'mdown', 'mkd'] },
      { name: 'Text', extensions: ['txt'] },
      { name: 'All Files', extensions: ['*'] }
    ],
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

ipcMain.handle('update-settings', async (event, patch: Partial<AppSettings>) => {
  const win = getWinFromEvent(event)
  if (!win) return null
  appSettings = await updateAppSettings(settingsPath, appSettings, patch ?? {})
  buildMenu()
  return appSettings
})

ipcMain.handle('complete-ai-prompt', async (event, prompt: string) => {
  const win = getWinFromEvent(event)
  if (!win) return { ok: false, error: '当前窗口不可用。' }
  return completeAiHelperPrompt(appSettings.aiHelper.provider, typeof prompt === 'string' ? prompt : '')
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

  const result = await dialog.showOpenDialog(win, {
    properties: ['openDirectory'],
  })

  if (result.canceled || result.filePaths.length === 0) return null

  sidebarState.workdirPath = result.filePaths[0]
  sidebarState.workspacePaths = addWorkspacePath(sidebarState.workspacePaths, sidebarState.workdirPath)
  sidebarState.workdirExpanded = true
  await refreshWorkdirEntries()
  await persistSidebarState()
  broadcastSidebarState()
  return createSidebarSnapshot(win)
})

ipcMain.handle('select-workspace', async (event, workspacePath: string) => {
  const win = getWinFromEvent(event)
  if (!win) return null
  if (typeof workspacePath !== 'string' || !existsSync(workspacePath)) {
    sidebarState.workspacePaths = sidebarState.workspacePaths.filter((candidate) => existsSync(candidate))
    await persistSidebarState()
    broadcastSidebarState()
    return createSidebarSnapshot(win)
  }

  sidebarState.workdirPath = workspacePath
  sidebarState.workspacePaths = addWorkspacePath(sidebarState.workspacePaths, workspacePath)
  sidebarState.workdirExpanded = true
  await refreshWorkdirEntries()
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
  sidebarState.activeSidebarTab = normalizeSidebarTab(tab)
  persistSidebarState()
  broadcastSidebarState()
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
    knownWorkdirFiles: workdirEntries.map((entry) => entry.absolutePath),
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
      filters: [
        { name: 'Markdown', extensions: ['md'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    })
    if (result.canceled || !result.filePath) return false
    return saveFileAsForWindow(win, result.filePath, content)
  }

  return saveToPath(win, state.filePath, content)
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
    filters: [
      { name: 'Markdown', extensions: ['md'] },
      { name: 'All Files', extensions: ['*'] }
    ]
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
      label: 'File',
      submenu: [
        {
          label: 'New',
          accelerator: 'CmdOrCtrl+N',
          click: () => sendToFocused('menu-new-file-in-window')
        },
        {
          label: 'New Window',
          accelerator: 'CmdOrCtrl+Shift+N',
          click: () => { createWindowMatchingSize(getFocusedWindow()) }
        },
        {
          label: 'Open...',
          accelerator: 'CmdOrCtrl+O',
          click: () => sendToFocused('menu-open')
        },
        { type: 'separator' },
        {
          label: 'Save',
          accelerator: shortcutFor('save'),
          click: () => sendToFocused('menu-save')
        },
        {
          label: 'Save As...',
          accelerator: shortcutFor('saveAs'),
          click: () => sendToFocused('menu-save-as')
        },
        { type: 'separator' },
        {
          label: 'Export PDF...',
          click: () => sendToFocused('menu-export-pdf')
        },
        {
          label: 'Export HTML...',
          click: () => sendToFocused('menu-export-html')
        },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' }
      ]
    },
    {
      label: 'Edit',
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
          label: 'Find',
          accelerator: shortcutFor('search'),
          click: () => sendToFocused('menu-search')
        },
        {
          label: 'Clean CJK Typography',
          accelerator: shortcutFor('cleanCjkTypography'),
          click: () => sendToFocused('menu-clean-cjk-typography')
        }
      ]
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Toggle Sidebar',
          accelerator: shortcutFor('toggleSidebar'),
          click: () => { toggleSidebarForWindow(getFocusedWindow()) }
        },
        {
          label: 'Toggle Outline',
          accelerator: shortcutFor('toggleOutline'),
          click: () => sendToFocused('menu-toggle-outline')
        },
        { type: 'separator' },
        {
          label: 'Zoom In',
          accelerator: 'CmdOrCtrl+=',
          click: () => sendToFocused('menu-zoom', { delta: 1 })
        },
        {
          label: 'Zoom Out',
          accelerator: 'CmdOrCtrl+-',
          click: () => sendToFocused('menu-zoom', { delta: -1 })
        },
        {
          label: 'Reset Zoom',
          accelerator: 'CmdOrCtrl+0',
          click: () => sendToFocused('menu-zoom', { level: 0 })
        },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Theme',
      submenu: themeSubmenu
    },
    {
      label: 'Settings',
      submenu: [
        {
          label: 'Open Settings',
          accelerator: shortcutFor('settings'),
          click: () => sendToFocused('menu-settings')
        }
      ]
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'About LyraMD',
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
        buildMenu()

        queuePendingFilePaths(extractMarkdownLaunchPaths(process.argv, { isPackaged: app.isPackaged }))

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
