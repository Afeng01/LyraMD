import { app, BrowserWindow, ipcMain, dialog, Menu, shell } from 'electron'
import { join, basename, relative } from 'path'
import { readFile, writeFile, readdir, copyFile, mkdir, rename, unlink } from 'fs/promises'
import { watch, FSWatcher, existsSync, readdirSync } from 'fs'
import {
  clampSidebarWidth,
  filterMissingRecentFiles,
  getSidebarOpenForWindow,
  normalizeDrawerSidebarOpen,
  normalizeSidebarState,
  pushRecentFile,
  removeRecentFile,
  type PersistedSidebarState,
} from './sidebar-state'
import { deriveDraftDisplayTitle, isBlankDocumentContent, promoteDraftEntries, upsertDraftEntry, type DraftEntry } from './drafts'
import {
  consumeIgnoredWatchedContent,
  reconcileWatchedContent,
  recordIgnoredWatchedContent,
} from './file-sync'
import { scanWorkdir, type WorkdirEntry } from './workdir'

// Custom themes directory
const appDataDir = join(app.getPath('home'), '.lyramd')
const themesDir = join(appDataDir, 'themes')
const sidebarStatePath = join(appDataDir, 'sidebar-state.json')
const sessionStatePath = join(appDataDir, 'session-state.json')
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
  isDrawerMode: boolean
  workdirEntries: WorkdirEntry[]
}

let sidebarState: PersistedSidebarState = normalizeSidebarState(null)
let workdirEntries: WorkdirEntry[] = []
let persistedSessionState: PersistedSessionState = {
  lastActiveDocument: null,
}

function ensureAppDataDir(): void {
  if (!existsSync(appDataDir)) {
    mkdir(appDataDir, { recursive: true }).catch(() => {})
  }
}

function ensureThemesDir(): void {
  if (!existsSync(themesDir)) {
    mkdir(themesDir, { recursive: true }).catch(() => {})
  }
}

async function scanCustomThemes(): Promise<string[]> {
  try {
    const files = await readdir(themesDir)
    return files.filter(f => f.endsWith('.css')).sort()
  } catch {
    return []
  }
}

async function refreshWorkdirEntries(): Promise<void> {
  if (!sidebarState.workdirPath) {
    workdirEntries = []
    return
  }

  if (!existsSync(sidebarState.workdirPath)) {
    sidebarState.workdirPath = null
    workdirEntries = []
    persistSidebarState()
    return
  }

  try {
    workdirEntries = await scanWorkdir(sidebarState.workdirPath)
  } catch {
    workdirEntries = []
  }
}

function persistSidebarState(): void {
  const payload = JSON.stringify(sidebarState, null, 2)
  writeFile(sidebarStatePath, payload, 'utf-8').catch(() => {})
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
  persistSidebarState()
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

// Per-window state
interface WindowState {
  drawerSidebarOpen: boolean
  desktopSidebarOpen: boolean
  isDrawerMode: boolean
  documentKind: DocumentKind
  filePath: string | null
  draftId: string | null
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

function getWinFromEvent(event: Electron.IpcMainInvokeEvent): BrowserWindow | null {
  return BrowserWindow.fromWebContents(event.sender)
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
    isDrawerMode: drawerMode,
    workdirEntries,
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

function setBlankDocumentState(win: BrowserWindow): void {
  const state = getState(win)
  stopWatching(state)
  state.documentKind = 'blank'
  state.filePath = null
  state.draftId = null
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
  if (shouldRewatch) {
    watchFile(win, state)
  }
  updateTitle(win)
  persistLastActiveDocument(state)
}

function isPathInsideWorkdir(filePath: string): boolean {
  if (!sidebarState.workdirPath) return false
  const relativePath = relative(sidebarState.workdirPath, filePath)
  return relativePath !== '' && !relativePath.startsWith('..') && !relativePath.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`)
}

function createWindow(initialDocument?: { filePath: string; documentKind?: Exclude<DocumentKind, 'blank'>; draftId?: string | null }): BrowserWindow {
  const win = new BrowserWindow({
    width: 1120,
    height: 720,
    minWidth: 560,
    minHeight: 400,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  const state = getState(win)

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  win.webContents.on('did-finish-load', () => {
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
  const fileName = state.documentKind === 'draft'
    ? findDraftEntryById(state.draftId)?.displayTitle ?? '未命名草稿'
    : state.filePath
      ? basename(state.filePath)
      : 'Untitled'
  win.setTitle(`${fileName} — LyraMD`)
}

function suggestFileName(win: BrowserWindow, content?: string): string | undefined {
  const state = getState(win)
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
  state.watcher = watch(filePath, (eventType) => {
    if (eventType !== 'change') return

    if (state.debounceTimer) clearTimeout(state.debounceTimer)
    state.debounceTimer = setTimeout(() => {
      readFile(filePath, 'utf-8')
        .then((data) => {
          if (consumeIgnoredWatchedContent(state.ignoredWatchedContents, data)) return
          const syncDecision = reconcileWatchedContent(state.lastSyncedContent, data)
          state.lastSyncedContent = syncDecision.nextSyncedContent
          if (!syncDecision.shouldPropagate) return

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
                displayTitle: deriveDraftDisplayTitle(data),
              })
              updateTitle(win)
            }
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
    state.isInternalSave = true
    await writeFile(filePath, content, 'utf-8')
    recordIgnoredWatchedContent(state.ignoredWatchedContents, content)
    state.lastSyncedContent = content
    setFileDocumentState(win, filePath, state.documentKind === 'draft' ? 'draft' : 'file', state.draftId)
    if (state.documentKind === 'draft' && state.draftId) {
      const existingEntry = findDraftEntryById(state.draftId)
      if (existingEntry) {
        updateDraftEntry({
          ...existingEntry,
          updatedAt: Date.now(),
          displayTitle: deriveDraftDisplayTitle(content),
        })
      }
    } else {
      recordRecentFile(filePath)
    }
    if (isPathInsideWorkdir(filePath)) {
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

  for (const entry of draftEntries) {
    if (!existsSync(entry.path)) continue
    await shell.trashItem(entry.path)
  }

  sidebarState.draftEntries = []
  persistSidebarState()

  for (const win of BrowserWindow.getAllWindows()) {
    const state = getState(win)
    if (!state.filePath || !draftEntries.some((entry) => entry.path === state.filePath)) continue
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

async function removeDraftForAllWindows(triggerWin: BrowserWindow, draftId: string): Promise<SidebarSnapshot> {
  const draftEntry = sidebarState.draftEntries.find((entry) => entry.id === draftId)
  if (!draftEntry) {
    return createSidebarSnapshot(triggerWin)
  }

  if (existsSync(draftEntry.path)) {
    await shell.trashItem(draftEntry.path)
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

// IPC Handlers

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
  sidebarState.workdirExpanded = true
  await refreshWorkdirEntries()
  persistSidebarState()
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

ipcMain.handle('save-file', async (event, content: string) => {
  const win = getWinFromEvent(event)
  if (!win) return false
  const state = getState(win)
  if (state.documentKind === 'draft' && state.filePath) {
    return saveToPath(win, state.filePath, content)
  }

  if (!state.filePath) {
    const result = await dialog.showSaveDialog(win, {
      defaultPath: suggestFileName(win, content),
      filters: [
        { name: 'Markdown', extensions: ['md'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    })
    if (result.canceled || !result.filePath) return false
    state.filePath = result.filePath
  }
  return saveToPath(win, state.filePath, content)
})

ipcMain.handle('save-file-as', async (event, content: string) => {
  const win = getWinFromEvent(event)
  if (!win) return false
  const state = getState(win)
  const result = await dialog.showSaveDialog(win, {
    defaultPath: suggestFileName(win, content),
    filters: [
      { name: 'Markdown', extensions: ['md'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  })
  if (result.canceled || !result.filePath) return false
  if (state.documentKind === 'draft' && state.filePath) {
    const draftSourcePath = state.filePath
    try {
      state.isInternalSave = true
      let renamed = true
      await rename(draftSourcePath, result.filePath).catch(async () => {
        renamed = false
        await writeFile(result.filePath, content, 'utf-8')
      })
      await writeFile(result.filePath, content, 'utf-8')
      if (!renamed && draftSourcePath !== result.filePath) {
        await unlink(draftSourcePath).catch(async () => {
          await shell.trashItem(draftSourcePath)
          if (existsSync(draftSourcePath)) {
            throw new Error('draft-cleanup-failed')
          }
        })
      }
      removeDraftEntry({ draftId: state.draftId, draftPath: draftSourcePath })
      recordIgnoredWatchedContent(state.ignoredWatchedContents, content)
      setFileDocumentState(win, result.filePath, 'file', null)
      state.lastSyncedContent = content
      recordRecentFile(result.filePath)
      if (isPathInsideWorkdir(draftSourcePath) || isPathInsideWorkdir(result.filePath)) {
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

  return saveToPath(win, result.filePath, content)
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

// Menu — targets the focused window

function getFocusedWindow(): BrowserWindow | null {
  return BrowserWindow.getFocusedWindow()
}

function sendToFocused(channel: string, ...args: unknown[]): void {
  const win = getFocusedWindow()
  if (win) win.webContents.send(channel, ...args)
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
          label: 'Open...',
          accelerator: 'CmdOrCtrl+O',
          click: () => sendToFocused('menu-open')
        },
        { type: 'separator' },
        {
          label: 'Save',
          accelerator: 'CmdOrCtrl+S',
          click: () => sendToFocused('menu-save')
        },
        {
          label: 'Save As...',
          accelerator: 'CmdOrCtrl+Shift+S',
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
        { role: 'selectAll' }
      ]
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Toggle Sidebar',
          accelerator: 'CmdOrCtrl+\\',
          click: () => { toggleSidebarForWindow(getFocusedWindow()) }
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

app.whenReady().then(() => {
  ensureAppDataDir()
  ensureThemesDir()
  Promise.all([loadSidebarState(), loadSessionState()])
    .catch(() => {})
    .finally(() => {
      buildMenu()

      // Check command line args for file paths
      const args = process.argv.slice(app.isPackaged ? 1 : 2)
      const fileArgs = args.filter((arg) => !arg.startsWith('-'))
      if (fileArgs.length > 0) {
        pendingFilePaths = fileArgs
      }

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

      app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow()
      })
    })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('open-file', (event, filePath) => {
  event.preventDefault()
  if (app.isReady()) {
    openFile(filePath)
  } else {
    pendingFilePaths.push(filePath)
  }
})
