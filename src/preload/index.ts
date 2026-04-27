import { contextBridge, ipcRenderer, webUtils } from 'electron'

export interface WorkdirEntry {
  absolutePath: string
  relativePath: string
}

export interface SidebarState {
  sidebarOpen: boolean
  sidebarWidth: number
  workdirExpanded: boolean
  recentFilesExpanded: boolean
  workdirPath: string | null
  recentFiles: string[]
  currentFilePath: string | null
  workdirEntries: WorkdirEntry[]
}

export interface ElectronAPI {
  openFile: () => Promise<null>
  openFilePath: (path: string) => Promise<null>
  saveFile: (content: string) => Promise<boolean>
  saveFileAs: (content: string) => Promise<boolean>
  exportPDF: () => Promise<boolean>
  exportHTML: (html: string) => Promise<boolean>
  loadCustomTheme: () => Promise<{ name: string; css: string } | null>
  loadThemeCSS: (fileName: string) => Promise<string | null>
  getSidebarState: () => Promise<SidebarState | null>
  toggleSidebar: () => Promise<boolean>
  toggleWorkdirExpanded: () => Promise<boolean>
  toggleRecentFilesExpanded: () => Promise<boolean>
  setSidebarWidth: (width: number) => Promise<number>
  chooseWorkdir: () => Promise<SidebarState | null>
  openSidebarFile: (path: string) => Promise<boolean>
  removeRecentFile: (path: string) => Promise<boolean>
  getPathForFile: (file: File) => string
  openExternal: (url: string) => void
  onFileChanged: (callback: (content: string) => void) => void
  onNewFile: (callback: () => void) => void
  onFileOpened: (callback: (data: { path: string; content: string }) => void) => void
  onMenuOpen: (callback: () => void) => void
  onMenuSave: (callback: () => void) => void
  onMenuSaveAs: (callback: () => void) => void
  onMenuExportPDF: (callback: () => void) => void
  onMenuExportHTML: (callback: () => void) => void
  onSetTheme: (callback: (theme: string) => void) => void
  onSetCustomCSS: (callback: (css: string) => void) => void
  onMenuImportTheme: (callback: () => void) => void
  onAgentActivity: (callback: (state: string) => void) => void
  onSidebarState: (callback: (state: SidebarState) => void) => void
}

contextBridge.exposeInMainWorld('electronAPI', {
  openFile: () => ipcRenderer.invoke('open-file'),
  openFilePath: (path: string) => ipcRenderer.invoke('open-file-path', path),
  saveFile: (content: string) => ipcRenderer.invoke('save-file', content),
  saveFileAs: (content: string) => ipcRenderer.invoke('save-file-as', content),
  exportPDF: () => ipcRenderer.invoke('export-pdf'),
  exportHTML: (html: string) => ipcRenderer.invoke('export-html', html),
  loadCustomTheme: () => ipcRenderer.invoke('load-custom-theme'),
  loadThemeCSS: (fileName: string) => ipcRenderer.invoke('load-theme-css', fileName),
  getSidebarState: () => ipcRenderer.invoke('get-sidebar-state'),
  toggleSidebar: () => ipcRenderer.invoke('toggle-sidebar'),
  toggleWorkdirExpanded: () => ipcRenderer.invoke('toggle-workdir-expanded'),
  toggleRecentFilesExpanded: () => ipcRenderer.invoke('toggle-recent-files-expanded'),
  setSidebarWidth: (width: number) => ipcRenderer.invoke('set-sidebar-width', width),
  chooseWorkdir: () => ipcRenderer.invoke('choose-workdir'),
  openSidebarFile: (path: string) => ipcRenderer.invoke('open-sidebar-file', path),
  removeRecentFile: (path: string) => ipcRenderer.invoke('remove-recent-file', path),
  getPathForFile: (file: File) => webUtils.getPathForFile(file),
  openExternal: (url: string) => ipcRenderer.send('open-external', url),
  onFileChanged: (callback: (content: string) => void) => {
    ipcRenderer.on('file-changed', (_event, content) => callback(content))
  },
  onNewFile: (callback: () => void) => {
    ipcRenderer.on('new-file', () => callback())
  },
  onFileOpened: (callback: (data: { path: string; content: string }) => void) => {
    ipcRenderer.on('file-opened', (_event, data) => callback(data))
  },
  onMenuOpen: (callback: () => void) => {
    ipcRenderer.on('menu-open', () => callback())
  },
  onMenuSave: (callback: () => void) => {
    ipcRenderer.on('menu-save', () => callback())
  },
  onMenuSaveAs: (callback: () => void) => {
    ipcRenderer.on('menu-save-as', () => callback())
  },
  onMenuExportPDF: (callback: () => void) => {
    ipcRenderer.on('menu-export-pdf', () => callback())
  },
  onMenuExportHTML: (callback: () => void) => {
    ipcRenderer.on('menu-export-html', () => callback())
  },
  onSetTheme: (callback: (theme: string) => void) => {
    ipcRenderer.on('set-theme', (_event, theme) => callback(theme))
  },
  onSetCustomCSS: (callback: (css: string) => void) => {
    ipcRenderer.on('set-custom-css', (_event, css) => callback(css))
  },
  onMenuImportTheme: (callback: () => void) => {
    ipcRenderer.on('menu-import-theme', () => callback())
  },
  onAgentActivity: (callback: (state: string) => void) => {
    ipcRenderer.on('agent-activity', (_event, state) => callback(state))
  },
  onSidebarState: (callback: (state: SidebarState) => void) => {
    ipcRenderer.on('sidebar-state', (_event, state) => callback(state))
  }
} satisfies ElectronAPI)
