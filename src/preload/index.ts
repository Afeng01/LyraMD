import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { UpdateBannerPayload } from '../main/update-notice'
import type { TabSettings } from '../main/settings'

export interface WorkdirEntry {
  absolutePath: string
  relativePath: string
}

export interface WorkdirTreeNode {
  absolutePath: string
  kind: 'directory' | 'file'
  name: string
  relativePath: string
  children?: WorkdirTreeNode[]
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
export type AgentPanelPosition = 'auto' | 'bottom' | 'right'
export type BackgroundMode = 'default' | 'color' | 'image'
export type BackgroundScope = 'editor' | 'window'
export type EditorFontPreset = 'theme' | 'elegant' | 'sans' | 'serif' | 'mono' | 'custom'
export type SidebarTab = 'drafts' | 'recent' | 'workdir'
export type PinnedItem =
  | { kind: 'draft'; draftId: string }
  | { kind: 'file'; filePath: string }
export type ShortcutAction = 'save' | 'saveAs' | 'settings' | 'search' | 'toggleSidebar' | 'toggleOutline' | 'cleanCjkTypography' | 'openAiPalette'
export type ShortcutMap = Record<ShortcutAction, string>

export interface BackgroundSettings {
  mode: BackgroundMode
  scope: BackgroundScope
  color: string
  imagePath: string | null
  opacity: number
  blur: number
  dim: number
}

export interface FontSettings {
  preset: EditorFontPreset
  customFamily: string
}

export interface DocumentSafetySettings {
  maxRevisionsPerDocument: number
}

export interface AiPromptTemplate {
  id: string
  title: string
  prompt: string
}

export interface AiHelperProviderSettings {
  type: 'openai-compatible'
  baseUrl: string
  apiKey: string
  model: string
  temperature: number
}

export interface AiHelperSettings {
  provider: AiHelperProviderSettings
  customProvider: AiHelperProviderSettings
  templates: AiPromptTemplate[]
}

export interface AiHelperCompletionResult {
  ok: boolean
  text?: string
  error?: string
}

export interface CurrentDocumentSnapshot {
  content: string
  draftId: string | null
  kind: Exclude<DocumentKind, 'blank'>
  path: string
  title: string
}

export interface PersistedImageAsset {
  absoluteImagePath: string
  markdownImagePath: string
  sidebarState: SidebarState | null
}

export interface CrashRecoverySummary {
  displayTitle: string
  documentKind: Exclude<DocumentKind, 'blank'>
  filePath: string | null
  hasContent: boolean
  reason: string
  updatedAt: number
}

export interface ExternalChangeRecoverySummary {
  displayTitle: string
  documentKind: Exclude<DocumentKind, 'blank'>
  filePath: string | null
  hasContent: boolean
  reason: string
  updatedAt: number
}

export interface DocumentRevisionSummary {
  changeSummary: AgentChangeSummary | null
  displayTitle: string
  documentKind: Exclude<DocumentKind, 'blank'>
  id: string
  reason: string
  updatedAt: number
}

export interface AppSettings {
  settingsSchemaVersion: number
  titleSyncMode: TitleSyncMode
  saveAsMode: SaveAsMode
  themeName: string
  shortcuts: ShortcutMap
  agentPanelPosition: AgentPanelPosition
  showDocumentStats: boolean
  embedLocalImagesOnCopy: boolean
  background: BackgroundSettings
  font: FontSettings
  documentSafety: DocumentSafetySettings
  aiHelper: AiHelperSettings
  tabs: TabSettings
}

export interface CodexIntegrationStatus {
  bridgeFilePath: string
  bridgePort: number | null
  bridgeRunning: boolean
  codexCommand: string | null
  codexConfigPath: string
  codexInstalled: boolean
  codexMcpConfigured: boolean
  error: string | null
  serverName: string
  sidecarScriptPath: string
  version: string | null
}

export interface McpDocumentRequest {
  args?: Record<string, unknown>
  id: string
  type: string
}

export interface McpDocumentResponse {
  data?: unknown
  error?: string
  id: string
  success: boolean
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

export type ExternalChangeRiskReason =
  | 'emptied-document'
  | 'large-content-drop'
  | 'large-line-removal'

export interface ExternalChangeRisk {
  isDestructive: boolean
  reason: ExternalChangeRiskReason | null
  previousCharCount: number
  nextCharCount: number
  removedLineCount: number
  charDropRatio: number
}

export interface AgentChangePayload {
  applyBlocked?: boolean
  previousContent: string
  summary: AgentChangeSummary
  // 仅 applyBlocked 时携带：更完整的 diff 预览，供「查看 diff」使用
  fullSummary?: AgentChangeSummary | null
  risk: ExternalChangeRisk
}

export interface SidebarState {
  sidebarOpen: boolean
  sidebarWidth: number
  draftsExpanded: boolean
  workdirExpanded: boolean
  pinnedExpanded: boolean
  recentFilesExpanded: boolean
  workdirPath: string | null
  workspacePaths: string[]
  pinnedItems: PinnedItem[]
  activeSidebarTab: SidebarTab
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
  workdirTree: WorkdirTreeNode[]
  fileTitleOverrides: Record<string, string>
}

export interface ElectronAPI {
  platform: NodeJS.Platform
  openFile: () => Promise<null>
  openFilePath: (path: string) => Promise<null>
  beginBlankDocument: () => Promise<SidebarState | null>
  autosaveDocument: (content: string) => Promise<{ kind: DocumentKind; path: string | null }>
  saveFile: (content: string) => Promise<boolean>
  saveFileAs: (content: string, mode?: SaveAsMode) => Promise<boolean>
  exportPDF: () => Promise<boolean>
  exportHTML: (html: string) => Promise<boolean>
  exportDocx: (content: string) => Promise<boolean>
  loadCustomTheme: () => Promise<{ name: string; css: string } | null>
  loadThemeCSS: (fileName: string) => Promise<string | null>
  getSettings: () => Promise<AppSettings | null>
  updateSettings: (patch: Partial<AppSettings>) => Promise<AppSettings | null>
  openSettingsWindow: (pane?: string) => Promise<boolean>
  completeAiPrompt: (prompt: string) => Promise<AiHelperCompletionResult>
  testAiHelperConnection: () => Promise<AiHelperCompletionResult>
  getCurrentDocument: () => Promise<CurrentDocumentSnapshot | null>
  getCrashRecoveryState: () => Promise<CrashRecoverySummary | null>
  restoreCrashRecovery: () => Promise<boolean>
  dismissCrashRecovery: () => Promise<boolean>
  getExternalChangeRecoveryState: () => Promise<ExternalChangeRecoverySummary | null>
  restoreExternalChangeRecovery: () => Promise<boolean>
  dismissExternalChangeRecovery: () => Promise<boolean>
  acceptExternalChange: () => Promise<{ content: string; title: string } | null>
  listDocumentRevisions: () => Promise<DocumentRevisionSummary[]>
  openRevisionsDirectory: () => Promise<boolean>
  restoreDocumentRevision: (revisionId: string) => Promise<boolean>
  persistImageAsset: (payload: { bytes: Uint8Array; fileName: string; mimeType: string }) => Promise<PersistedImageAsset | null>
  readLocalImageAsDataUrl: (path: string) => Promise<string | null>
  getCodexIntegrationStatus: () => Promise<CodexIntegrationStatus | null>
  installCodexIntegration: () => Promise<CodexIntegrationStatus | null>
  removeCodexIntegration: () => Promise<CodexIntegrationStatus | null>
  startMcpBridge: () => Promise<CodexIntegrationStatus | null>
  updateCurrentDraftTitle: (nextTitle: string) => Promise<SidebarState | null>
  updateCurrentFileTitle: (nextTitle: string) => Promise<SidebarState | null>
  updateDraftTitleById: (draftId: string, nextTitle: string) => Promise<SidebarState | null>
  updateFileTitleByPath: (filePath: string, nextTitle: string) => Promise<SidebarState | null>
  renameFileByPathFromTitle: (filePath: string, nextTitle: string) => Promise<SidebarState | null>
  renameCurrentFileFromTitle: (nextTitle: string) => Promise<{ path: string | null } | null>
  getSidebarState: () => Promise<SidebarState | null>
  toggleSidebar: () => Promise<boolean>
  toggleDraftsExpanded: () => Promise<boolean>
  toggleWorkdirExpanded: () => Promise<boolean>
  togglePinnedExpanded: () => Promise<boolean>
  toggleRecentFilesExpanded: () => Promise<boolean>
  setActiveSidebarTab: (tab: SidebarTab) => Promise<SidebarState | null>
  togglePinnedDraft: (draftId: string) => Promise<SidebarState | null>
  togglePinnedFile: (path: string) => Promise<SidebarState | null>
  clearDrafts: () => Promise<SidebarState | null>
  removeDraft: (id: string) => Promise<SidebarState | null>
  setSidebarWidth: (width: number) => Promise<number>
  chooseWorkdir: () => Promise<SidebarState | null>
  selectWorkspace: (path: string) => Promise<SidebarState | null>
  removeWorkspace: (path: string) => Promise<SidebarState | null>
  reorderWorkspaces: (sourcePath: string, targetPath: string) => Promise<SidebarState | null>
  createWorkdirFile: () => Promise<SidebarState | null>
  createWorkdirFolder: () => Promise<SidebarState | null>
  chooseDraftDirectory: () => Promise<SidebarState | null>
  skipDraftOnboarding: () => Promise<SidebarState | null>
  openSidebarFile: (path: string) => Promise<boolean>
  openDraft: (id: string) => Promise<boolean>
  removeRecentFile: (path: string) => Promise<boolean>
  removeWorkdirFile: (path: string) => Promise<SidebarState | null>
  checkForUpdates: () => Promise<void>
  onUpdateAvailable: (callback: (payload: UpdateBannerPayload) => void) => void
  onUpdateDownloaded: (callback: (payload: UpdateBannerPayload) => void) => void
  downloadUpdate: () => Promise<boolean>
  installUpdate: () => Promise<boolean>
  skipUpdateVersion: (version: string) => Promise<boolean>
  createNewWindow: () => Promise<boolean>
  minimizeWindow: () => Promise<boolean>
  toggleMaximizeWindow: () => Promise<boolean>
  closeWindow: () => Promise<boolean>
  getPathForFile: (file: File) => string
  openExternal: (url: string) => void
  onFileChanged: (callback: (content: string) => void) => void
  onNewFile: (callback: () => void) => void
  onNewFileInWindow: (callback: () => void) => void
  onFileOpened: (callback: (data: { path: string; content: string }) => void) => void
  signalRendererReady: () => void
  onMenuOpen: (callback: () => void) => void
  onMenuSave: (callback: () => void) => void
  onMenuSaveAs: (callback: () => void) => void
  onMenuSearch: (callback: () => void) => void
  onMenuCleanCjkTypography: (callback: () => void) => void
  onMenuInsertMath: (callback: () => void) => void
  onMenuOpenAiPalette: (callback: () => void) => void
  onMenuSettings: (callback: () => void) => void
  onSettingsChanged: (callback: (settings: AppSettings) => void) => void
  onSettingsOpenPane: (callback: (pane: string) => void) => void
  onMenuToggleOutline: (callback: () => void) => void
  onMenuExportPDF: (callback: () => void) => void
  onMenuExportHTML: (callback: () => void) => void
  onMenuExportDocx: (callback: () => void) => void
  onSetTheme: (callback: (theme: string) => void) => void
  onSetCustomCSS: (callback: (css: string) => void) => void
  onMenuImportTheme: (callback: () => void) => void
  onAgentChangeSummary: (callback: (payload: AgentChangePayload) => void) => void
  onSidebarState: (callback: (state: SidebarState) => void) => void
  onTabsState: (callback: (payload: { enabled: boolean; tabs: Array<{ id: string; title: string; hasUnsaved: boolean; isActive: boolean; filePath?: string | null }> }) => void) => void
  onTabNewRequest: (callback: () => void) => void
  onTabActivateRequest: (callback: (tabId: string) => void) => void
  onTabOpenRequest: (callback: (payload: { filePath: string; documentKind?: 'draft' | 'file' | null; draftId?: string | null }) => void) => void
  switchTab: (tabId: string, content: string) => Promise<boolean>
  closeTab: (tabId: string, content: string) => Promise<boolean>
  createTab: (content: string) => Promise<boolean>
  openTabDocument: (payload: { filePath: string; documentKind?: 'draft' | 'file'; draftId?: string | null; content: string }) => Promise<boolean>
  onZoomChange: (callback: (data: { delta?: number; level?: number }) => void) => void
  onMcpDocumentRequest: (callback: (request: McpDocumentRequest) => void) => void
  sendMcpDocumentResponse: (response: McpDocumentResponse) => void
}

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  openFile: () => ipcRenderer.invoke('open-file'),
  openFilePath: (path: string) => ipcRenderer.invoke('open-file-path', path),
  beginBlankDocument: () => ipcRenderer.invoke('begin-blank-document'),
  autosaveDocument: (content: string) => ipcRenderer.invoke('autosave-document', content),
  saveFile: (content: string) => ipcRenderer.invoke('save-file', content),
  saveFileAs: (content: string, mode?: SaveAsMode) => ipcRenderer.invoke('save-file-as', content, mode),
  exportPDF: () => ipcRenderer.invoke('export-pdf'),
  exportHTML: (html: string) => ipcRenderer.invoke('export-html', html),
  exportDocx: (content: string) => ipcRenderer.invoke('export-docx', content),
  loadCustomTheme: () => ipcRenderer.invoke('load-custom-theme'),
  loadThemeCSS: (fileName: string) => ipcRenderer.invoke('load-theme-css', fileName),
  getSettings: () => ipcRenderer.invoke('get-settings'),
  updateSettings: (patch: Partial<AppSettings>) => ipcRenderer.invoke('update-settings', patch),
  openSettingsWindow: (pane?: string) => ipcRenderer.invoke('open-settings-window', pane),
  completeAiPrompt: (prompt: string) => ipcRenderer.invoke('complete-ai-prompt', prompt),
  testAiHelperConnection: () => ipcRenderer.invoke('test-ai-helper-connection'),
  getCurrentDocument: () => ipcRenderer.invoke('get-current-document'),
  getCrashRecoveryState: () => ipcRenderer.invoke('get-crash-recovery-state'),
  restoreCrashRecovery: () => ipcRenderer.invoke('restore-crash-recovery'),
  dismissCrashRecovery: () => ipcRenderer.invoke('dismiss-crash-recovery'),
  getExternalChangeRecoveryState: () => ipcRenderer.invoke('get-external-change-recovery-state'),
  restoreExternalChangeRecovery: () => ipcRenderer.invoke('restore-external-change-recovery'),
  dismissExternalChangeRecovery: () => ipcRenderer.invoke('dismiss-external-change-recovery'),
  acceptExternalChange: () => ipcRenderer.invoke('accept-external-change'),
  listDocumentRevisions: () => ipcRenderer.invoke('list-document-revisions'),
  openRevisionsDirectory: () => ipcRenderer.invoke('open-revisions-directory'),
  restoreDocumentRevision: (revisionId: string) => ipcRenderer.invoke('restore-document-revision', revisionId),
  persistImageAsset: (payload: { bytes: Uint8Array; fileName: string; mimeType: string }) => ipcRenderer.invoke('persist-image-asset', payload),
  readLocalImageAsDataUrl: (path: string) => ipcRenderer.invoke('read-local-image-as-data-url', path),
  getCodexIntegrationStatus: () => ipcRenderer.invoke('codex-integration-status'),
  installCodexIntegration: () => ipcRenderer.invoke('codex-integration-install'),
  removeCodexIntegration: () => ipcRenderer.invoke('codex-integration-remove'),
  startMcpBridge: () => ipcRenderer.invoke('codex-integration-start-bridge'),
  updateCurrentDraftTitle: (nextTitle: string) => ipcRenderer.invoke('update-current-draft-title', nextTitle),
  updateCurrentFileTitle: (nextTitle: string) => ipcRenderer.invoke('update-current-file-title', nextTitle),
  updateDraftTitleById: (draftId: string, nextTitle: string) => ipcRenderer.invoke('update-draft-title-by-id', draftId, nextTitle),
  updateFileTitleByPath: (filePath: string, nextTitle: string) => ipcRenderer.invoke('update-file-title-by-path', filePath, nextTitle),
  renameFileByPathFromTitle: (filePath: string, nextTitle: string) => ipcRenderer.invoke('rename-file-by-path-from-title', filePath, nextTitle),
  renameCurrentFileFromTitle: (nextTitle: string) => ipcRenderer.invoke('rename-current-file-from-title', nextTitle),
  getSidebarState: () => ipcRenderer.invoke('get-sidebar-state'),
  toggleSidebar: () => ipcRenderer.invoke('toggle-sidebar'),
  toggleDraftsExpanded: () => ipcRenderer.invoke('toggle-drafts-expanded'),
  toggleWorkdirExpanded: () => ipcRenderer.invoke('toggle-workdir-expanded'),
  togglePinnedExpanded: () => ipcRenderer.invoke('toggle-pinned-expanded'),
  toggleRecentFilesExpanded: () => ipcRenderer.invoke('toggle-recent-files-expanded'),
  setActiveSidebarTab: (tab: SidebarTab) => ipcRenderer.invoke('set-active-sidebar-tab', tab),
  togglePinnedDraft: (draftId: string) => ipcRenderer.invoke('toggle-pinned-draft', draftId),
  togglePinnedFile: (path: string) => ipcRenderer.invoke('toggle-pinned-file', path),
  clearDrafts: () => ipcRenderer.invoke('clear-drafts'),
  removeDraft: (id: string) => ipcRenderer.invoke('remove-draft', id),
  setSidebarWidth: (width: number) => ipcRenderer.invoke('set-sidebar-width', width),
  chooseWorkdir: () => ipcRenderer.invoke('choose-workdir'),
  selectWorkspace: (path: string) => ipcRenderer.invoke('select-workspace', path),
  removeWorkspace: (path: string) => ipcRenderer.invoke('remove-workspace', path),
  reorderWorkspaces: (sourcePath: string, targetPath: string) => ipcRenderer.invoke('reorder-workspaces', sourcePath, targetPath),
  createWorkdirFile: () => ipcRenderer.invoke('create-workdir-file'),
  createWorkdirFolder: () => ipcRenderer.invoke('create-workdir-folder'),
  chooseDraftDirectory: () => ipcRenderer.invoke('choose-draft-directory'),
  skipDraftOnboarding: () => ipcRenderer.invoke('skip-draft-onboarding'),
  openSidebarFile: (path: string) => ipcRenderer.invoke('open-sidebar-file', path),
  openDraft: (id: string) => ipcRenderer.invoke('open-draft', id),
  removeRecentFile: (path: string) => ipcRenderer.invoke('remove-recent-file', path),
  removeWorkdirFile: (path: string) => ipcRenderer.invoke('remove-workdir-file', path),
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  onUpdateAvailable: (callback: (payload: UpdateBannerPayload) => void) => {
    ipcRenderer.on('update-banner', (_event, payload: UpdateBannerPayload) => {
      if (payload && payload.kind === 'available') callback(payload)
    })
  },
  onUpdateDownloaded: (callback: (payload: UpdateBannerPayload) => void) => {
    ipcRenderer.on('update-banner', (_event, payload: UpdateBannerPayload) => {
      if (payload && payload.kind === 'downloaded') callback(payload)
    })
  },
  downloadUpdate: () => ipcRenderer.invoke('update-download'),
  installUpdate: () => ipcRenderer.invoke('update-install'),
  skipUpdateVersion: (version: string) => ipcRenderer.invoke('update-skip-version', version),
  createNewWindow: () => ipcRenderer.invoke('create-new-window'),
  minimizeWindow: () => ipcRenderer.invoke('window-minimize'),
  toggleMaximizeWindow: () => ipcRenderer.invoke('window-toggle-maximize'),
  closeWindow: () => ipcRenderer.invoke('window-close'),
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
  signalRendererReady: () => ipcRenderer.send('renderer-ready'),
  onMenuOpen: (callback: () => void) => {
    ipcRenderer.on('menu-open', () => callback())
  },
  onMenuSave: (callback: () => void) => {
    ipcRenderer.on('menu-save', () => callback())
  },
  onMenuSaveAs: (callback: () => void) => {
    ipcRenderer.on('menu-save-as', () => callback())
  },
  onMenuSearch: (callback: () => void) => {
    ipcRenderer.on('menu-search', () => callback())
  },
  onMenuCleanCjkTypography: (callback: () => void) => {
    ipcRenderer.on('menu-clean-cjk-typography', () => callback())
  },
  onMenuInsertMath: (callback: () => void) => {
    ipcRenderer.on('menu-insert-math', () => callback())
  },
  onMenuOpenAiPalette: (callback: () => void) => {
    ipcRenderer.on('menu-open-ai-palette', () => callback())
  },
  onMenuSettings: (callback: () => void) => {
    ipcRenderer.on('menu-settings', () => callback())
  },
  onSettingsChanged: (callback: (settings: AppSettings) => void) => {
    ipcRenderer.on('settings-updated', (_event, settings) => callback(settings))
  },
  onSettingsOpenPane: (callback: (pane: string) => void) => {
    ipcRenderer.on('settings-open-pane', (_event, pane) => callback(pane))
  },
  onMenuToggleOutline: (callback: () => void) => {
    ipcRenderer.on('menu-toggle-outline', () => callback())
  },
  onMenuExportPDF: (callback: () => void) => {
    ipcRenderer.on('menu-export-pdf', () => callback())
  },
  onMenuExportHTML: (callback: () => void) => {
    ipcRenderer.on('menu-export-html', () => callback())
  },
  onMenuExportDocx: (callback: () => void) => {
    ipcRenderer.on('menu-export-docx', () => callback())
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
  onAgentChangeSummary: (callback: (payload: AgentChangePayload) => void) => {
    ipcRenderer.on('agent-change-summary', (_event, payload) => callback(payload))
  },
  onSidebarState: (callback: (state: SidebarState) => void) => {
    ipcRenderer.on('sidebar-state', (_event, state) => callback(state))
  },
  onTabsState: (callback: (payload: { enabled: boolean; tabs: Array<{ id: string; title: string; hasUnsaved: boolean; isActive: boolean; filePath?: string | null }> }) => void) => {
    ipcRenderer.on('tabs-state', (_event, payload) => callback(payload))
  },
  onTabNewRequest: (callback: () => void) => {
    ipcRenderer.on('tab-new-request', () => callback())
  },
  onTabActivateRequest: (callback: (tabId: string) => void) => {
    ipcRenderer.on('tab-activate-request', (_event, tabId) => callback(tabId))
  },
  onTabOpenRequest: (callback: (payload: { filePath: string; documentKind?: 'draft' | 'file' | null; draftId?: string | null }) => void) => {
    ipcRenderer.on('tab-open-request', (_event, payload) => callback(payload))
  },
  switchTab: (tabId: string, content: string) => ipcRenderer.invoke('tabs-switch', tabId, content),
  closeTab: (tabId: string, content: string) => ipcRenderer.invoke('tabs-close', tabId, content),
  createTab: (content: string) => ipcRenderer.invoke('tabs-new', content),
  openTabDocument: (payload: { filePath: string; documentKind?: 'draft' | 'file'; draftId?: string | null; content: string }) =>
    ipcRenderer.invoke('tabs-open-document', payload),
  onZoomChange: (callback: (data: { delta?: number; level?: number }) => void) => {
    ipcRenderer.on('menu-zoom', (_event, data) => callback(data))
  },
  onMcpDocumentRequest: (callback: (request: McpDocumentRequest) => void) => {
    ipcRenderer.on('mcp-document-request', (_event, request) => callback(request))
  },
  sendMcpDocumentResponse: (response: McpDocumentResponse) => {
    ipcRenderer.send('mcp-document-response', response)
  },
} satisfies ElectronAPI)
