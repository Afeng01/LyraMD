import { contextBridge, ipcRenderer, webUtils } from 'electron'

export interface WorkdirEntry {
  absolutePath: string
  relativePath: string
}

export interface DraftEntry {
  id: string
  path: string
  createdAt: number
  updatedAt: number
  displayTitle: string
  manualTitle?: string | null
}

export type DocumentKind = 'blank' | 'draft' | 'file'
export type TitleSyncMode = 'ask' | 'always' | 'never'
export type SaveAsMode = 'switch' | 'move'

export interface AppSettings {
  titleSyncMode: TitleSyncMode
  saveAsMode: SaveAsMode
  themeName: string
}

export interface TitleSyncPromptPayload {
  filePath: string
  currentTitle: string
  suggestedFilePath: string
}

export type AgentChangePreviewType = 'added' | 'removed' | 'changed'

export interface AgentChangePreviewLine {
  type: AgentChangePreviewType
  lineNumber: number
  text: string
  previousText?: string
}

export interface AgentChangeSummary {
  addedLines: number
  removedLines: number
  changedLines: number
  preview: AgentChangePreviewLine[]
  truncated: boolean
}

export interface AgentChangePayload {
  previousContent: string
  summary: AgentChangeSummary
}

export interface SidebarState {
  sidebarOpen: boolean
  sidebarWidth: number
  draftsExpanded: boolean
  workdirExpanded: boolean
  recentFilesExpanded: boolean
  workdirPath: string | null
  draftDirectoryPath: string | null
  draftOnboardingCompleted: boolean
  draftEntries: DraftEntry[]
  recentFiles: string[]
  currentDocumentKind: DocumentKind
  currentFilePath: string | null
  currentDraftId: string | null
  currentDisplayTitle: string
  isDrawerMode: boolean
  workdirEntries: WorkdirEntry[]
  fileTitleOverrides: Record<string, string>
}

export interface ElectronAPI {
  openFile: () => Promise<null>
  openFilePath: (path: string) => Promise<null>
  beginBlankDocument: () => Promise<SidebarState | null>
  autosaveDocument: (content: string) => Promise<{ kind: DocumentKind; path: string | null }>
  saveFile: (content: string) => Promise<boolean>
  saveFileAs: (content: string, mode?: SaveAsMode) => Promise<boolean>
  exportPDF: () => Promise<boolean>
  exportHTML: (html: string) => Promise<boolean>
  loadCustomTheme: () => Promise<{ name: string; css: string } | null>
  loadThemeCSS: (fileName: string) => Promise<string | null>
  getSettings: () => Promise<AppSettings | null>
  updateSettings: (patch: Partial<AppSettings>) => Promise<AppSettings | null>
  updateCurrentDraftTitle: (nextTitle: string) => Promise<SidebarState | null>
  updateCurrentFileTitle: (nextTitle: string) => Promise<SidebarState | null>
  updateDraftTitleById: (draftId: string, nextTitle: string) => Promise<SidebarState | null>
  updateFileTitleByPath: (filePath: string, nextTitle: string) => Promise<SidebarState | null>
  renameCurrentFileFromTitle: (nextTitle: string) => Promise<{ path: string | null } | null>
  getSidebarState: () => Promise<SidebarState | null>
  toggleSidebar: () => Promise<boolean>
  toggleDraftsExpanded: () => Promise<boolean>
  toggleWorkdirExpanded: () => Promise<boolean>
  toggleRecentFilesExpanded: () => Promise<boolean>
  clearDrafts: () => Promise<SidebarState | null>
  removeDraft: (id: string) => Promise<SidebarState | null>
  setSidebarWidth: (width: number) => Promise<number>
  chooseWorkdir: () => Promise<SidebarState | null>
  chooseDraftDirectory: () => Promise<SidebarState | null>
  skipDraftOnboarding: () => Promise<SidebarState | null>
  openSidebarFile: (path: string) => Promise<boolean>
  openDraft: (id: string) => Promise<boolean>
  removeRecentFile: (path: string) => Promise<boolean>
  getPathForFile: (file: File) => string
  openExternal: (url: string) => void
  onFileChanged: (callback: (content: string) => void) => void
  onNewFile: (callback: () => void) => void
  onNewFileInWindow: (callback: () => void) => void
  onFileOpened: (callback: (data: { path: string; content: string }) => void) => void
  onMenuOpen: (callback: () => void) => void
  onMenuSave: (callback: () => void) => void
  onMenuSaveAs: (callback: () => void) => void
  onMenuCleanCjkTypography: (callback: () => void) => void
  onMenuSettings: (callback: () => void) => void
  onMenuExportPDF: (callback: () => void) => void
  onMenuExportHTML: (callback: () => void) => void
  onSetTheme: (callback: (theme: string) => void) => void
  onSetCustomCSS: (callback: (css: string) => void) => void
  onMenuImportTheme: (callback: () => void) => void
  onAgentActivity: (callback: (state: string) => void) => void
  onAgentChangeSummary: (callback: (payload: AgentChangePayload) => void) => void
  onSidebarState: (callback: (state: SidebarState) => void) => void
  onZoomChange: (callback: (data: { delta?: number; level?: number }) => void) => void
}

contextBridge.exposeInMainWorld('electronAPI', {
  openFile: () => ipcRenderer.invoke('open-file'),
  openFilePath: (path: string) => ipcRenderer.invoke('open-file-path', path),
  beginBlankDocument: () => ipcRenderer.invoke('begin-blank-document'),
  autosaveDocument: (content: string) => ipcRenderer.invoke('autosave-document', content),
  saveFile: (content: string) => ipcRenderer.invoke('save-file', content),
  saveFileAs: (content: string, mode?: SaveAsMode) => ipcRenderer.invoke('save-file-as', content, mode),
  exportPDF: () => ipcRenderer.invoke('export-pdf'),
  exportHTML: (html: string) => ipcRenderer.invoke('export-html', html),
  loadCustomTheme: () => ipcRenderer.invoke('load-custom-theme'),
  loadThemeCSS: (fileName: string) => ipcRenderer.invoke('load-theme-css', fileName),
  getSettings: () => ipcRenderer.invoke('get-settings'),
  updateSettings: (patch: Partial<AppSettings>) => ipcRenderer.invoke('update-settings', patch),
  updateCurrentDraftTitle: (nextTitle: string) => ipcRenderer.invoke('update-current-draft-title', nextTitle),
  updateCurrentFileTitle: (nextTitle: string) => ipcRenderer.invoke('update-current-file-title', nextTitle),
  updateDraftTitleById: (draftId: string, nextTitle: string) => ipcRenderer.invoke('update-draft-title-by-id', draftId, nextTitle),
  updateFileTitleByPath: (filePath: string, nextTitle: string) => ipcRenderer.invoke('update-file-title-by-path', filePath, nextTitle),
  renameCurrentFileFromTitle: (nextTitle: string) => ipcRenderer.invoke('rename-current-file-from-title', nextTitle),
  getSidebarState: () => ipcRenderer.invoke('get-sidebar-state'),
  toggleSidebar: () => ipcRenderer.invoke('toggle-sidebar'),
  toggleDraftsExpanded: () => ipcRenderer.invoke('toggle-drafts-expanded'),
  toggleWorkdirExpanded: () => ipcRenderer.invoke('toggle-workdir-expanded'),
  toggleRecentFilesExpanded: () => ipcRenderer.invoke('toggle-recent-files-expanded'),
  clearDrafts: () => ipcRenderer.invoke('clear-drafts'),
  removeDraft: (id: string) => ipcRenderer.invoke('remove-draft', id),
  setSidebarWidth: (width: number) => ipcRenderer.invoke('set-sidebar-width', width),
  chooseWorkdir: () => ipcRenderer.invoke('choose-workdir'),
  chooseDraftDirectory: () => ipcRenderer.invoke('choose-draft-directory'),
  skipDraftOnboarding: () => ipcRenderer.invoke('skip-draft-onboarding'),
  openSidebarFile: (path: string) => ipcRenderer.invoke('open-sidebar-file', path),
  openDraft: (id: string) => ipcRenderer.invoke('open-draft', id),
  removeRecentFile: (path: string) => ipcRenderer.invoke('remove-recent-file', path),
  getPathForFile: (file: File) => webUtils.getPathForFile(file),
  openExternal: (url: string) => ipcRenderer.send('open-external', url),
  onFileChanged: (callback: (content: string) => void) => {
    ipcRenderer.on('file-changed', (_event, content) => callback(content))
  },
  onNewFile: (callback: () => void) => {
    ipcRenderer.on('new-file', () => callback())
  },
  onNewFileInWindow: (callback: () => void) => {
    ipcRenderer.on('menu-new-file-in-window', () => callback())
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
  onMenuCleanCjkTypography: (callback: () => void) => {
    ipcRenderer.on('menu-clean-cjk-typography', () => callback())
  },
  onMenuSettings: (callback: () => void) => {
    ipcRenderer.on('menu-settings', () => callback())
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
  onAgentChangeSummary: (callback: (payload: AgentChangePayload) => void) => {
    ipcRenderer.on('agent-change-summary', (_event, payload) => callback(payload))
  },
  onSidebarState: (callback: (state: SidebarState) => void) => {
    ipcRenderer.on('sidebar-state', (_event, state) => callback(state))
  },
  onZoomChange: (callback: (data: { delta?: number; level?: number }) => void) => {
    ipcRenderer.on('menu-zoom', (_event, data) => callback(data))
  }
} satisfies ElectronAPI)
