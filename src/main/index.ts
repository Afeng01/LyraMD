import { app, BrowserWindow, ipcMain, dialog, Menu, shell } from 'electron'
import { join, basename, relative } from 'path'
import { readFile, writeFile, readdir, copyFile, mkdir } from 'fs/promises'
import { watch, FSWatcher, existsSync, readdirSync } from 'fs'
import { filterMissingRecentFiles, normalizeSidebarState, pushRecentFile, type PersistedSidebarState } from './sidebar-state'
import { scanWorkdir, type WorkdirEntry } from './workdir'

// Custom themes directory
const appDataDir = join(app.getPath('home'), '.colamd')
const themesDir = join(appDataDir, 'themes')
const sidebarStatePath = join(appDataDir, 'sidebar-state.json')

interface SidebarSnapshot extends PersistedSidebarState {
  currentFilePath: string | null
  workdirEntries: WorkdirEntry[]
}

let sidebarState: PersistedSidebarState = normalizeSidebarState(null)
let workdirEntries: WorkdirEntry[] = []

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

async function loadSidebarState(): Promise<void> {
  try {
    const raw = await readFile(sidebarStatePath, 'utf-8')
    sidebarState = normalizeSidebarState(JSON.parse(raw))
  } catch {
    sidebarState = normalizeSidebarState(null)
  }

  sidebarState.recentFiles = filterMissingRecentFiles(sidebarState.recentFiles, (filePath) => existsSync(filePath))
  await refreshWorkdirEntries()
}

// Per-window state
interface WindowState {
  filePath: string | null
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
    state = { filePath: null, watcher: null, isInternalSave: false, debounceTimer: null, agentState: 'idle', lastExternalChange: 0, agentCooldownTimer: null }
    windowStates.set(win.id, state)
  }
  return state
}

function getWinFromEvent(event: Electron.IpcMainInvokeEvent): BrowserWindow | null {
  return BrowserWindow.fromWebContents(event.sender)
}

function createSidebarSnapshot(win: BrowserWindow): SidebarSnapshot {
  return {
    ...sidebarState,
    currentFilePath: getState(win).filePath,
    workdirEntries,
  }
}

function sendSidebarState(win: BrowserWindow): void {
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

function isPathInsideWorkdir(filePath: string): boolean {
  if (!sidebarState.workdirPath) return false
  const relativePath = relative(sidebarState.workdirPath, filePath)
  return relativePath !== '' && !relativePath.startsWith('..') && !relativePath.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`)
}

function createWindow(filePath?: string): BrowserWindow {
  const win = new BrowserWindow({
    width: 1120,
    height: 720,
    minWidth: 760,
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
    if (filePath) {
      loadFileInWindow(win, filePath)
    }
  })

  win.on('closed', () => {
    stopWatching(state)
    windowStates.delete(win.id)
  })

  updateTitle(win)
  return win
}

function updateTitle(win: BrowserWindow): void {
  const state = getState(win)
  const fileName = state.filePath ? basename(state.filePath) : 'Untitled'
  win.setTitle(`${fileName} — ColaMD`)
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
    if (eventType !== 'change' || state.isInternalSave) return

    // Agent activity detection
    const now = Date.now()
    const gap = now - state.lastExternalChange
    state.lastExternalChange = now
    if (gap > 0 && gap < 2000) {
      transitionAgentState(win, state, 'active')
    } else if (state.agentState === 'active') {
      transitionAgentState(win, state, 'active') // reset cooldown timer
    }

    if (state.debounceTimer) clearTimeout(state.debounceTimer)
    state.debounceTimer = setTimeout(() => {
      readFile(filePath, 'utf-8')
        .then((data) => {
          if (!win.isDestroyed()) win.webContents.send('file-changed', data)
        })
        .catch(() => {})
    }, 100)
  })
}

function loadFileInWindow(win: BrowserWindow, filePath: string): void {
  readFile(filePath, 'utf-8')
    .then((data) => {
      const state = getState(win)
      state.filePath = filePath
      watchFile(win, state)
      updateTitle(win)
      recordRecentFile(filePath)
      win.webContents.send('file-opened', { path: filePath, content: data })
      broadcastSidebarState()
    })
    .catch(() => {})
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
  const win = createWindow(filePath)
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
    state.filePath = filePath
    watchFile(win, state)
    updateTitle(win)
    recordRecentFile(filePath)
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
  if (!state.filePath) {
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
  if (!state.filePath) {
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

ipcMain.handle('toggle-sidebar', async () => {
  sidebarState.sidebarOpen = !sidebarState.sidebarOpen
  persistSidebarState()
  broadcastSidebarState()
  return sidebarState.sidebarOpen
})

ipcMain.handle('toggle-workdir-expanded', async () => {
  sidebarState.workdirExpanded = !sidebarState.workdirExpanded
  persistSidebarState()
  broadcastSidebarState()
  return sidebarState.workdirExpanded
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

ipcMain.handle('open-sidebar-file', async (event, filePath: string) => {
  const win = getWinFromEvent(event)
  if (!win) return false
  loadFileInWindow(win, filePath)
  return true
})

ipcMain.handle('save-file', async (event, content: string) => {
  const win = getWinFromEvent(event)
  if (!win) return false
  const state = getState(win)
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
  const result = await dialog.showSaveDialog(win, {
    defaultPath: suggestFileName(win, content),
    filters: [
      { name: 'Markdown', extensions: ['md'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  })
  if (result.canceled || !result.filePath) return false
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
      label: 'ColaMD',
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
          click: () => createWindow()
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
          click: () => {
            sidebarState.sidebarOpen = !sidebarState.sidebarOpen
            persistSidebarState()
            broadcastSidebarState()
          }
        },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
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
          label: 'About ColaMD',
          click: () => shell.openExternal('https://github.com/marswaveai/colamd')
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
  loadSidebarState()
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
          createWindow(fp)
        }
        pendingFilePaths = []
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
