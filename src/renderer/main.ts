import {
  activateSearchMatch,
  clearClipboardLocalImageReplacements,
  createAiSuggestionFromSnapshot,
  createEditor,
  focusEditorAtLastSelection,
  focusEditorPreservingSelection,
  getOutlineItems,
  getHTML,
  getMarkdown,
  getSelectedPlainText,
  getSelectedTextSnapshot,
  insertImage,
  insertTextBelowSelection,
  isEditorTextFocused,
  replaceSelectedText,
  getSearchState,
  nextSearchMatch,
  onUserEdit,
  previousSearchMatch,
  refreshMarkdownImageSources,
  scrollToOutlineItem,
  setClipboardLocalImageReplacement,
  setEmbedLocalImagesOnCopy,
  setMarkdown,
  setPasteImageHandler,
  setSearchQuery,
} from './editor/editor'
import { resolveSearchPanelPreview, type SearchState } from './editor/search'
import { formatCjkTypography } from './editor/cjk-format'
import {
  rememberQueryForDocument,
  resolveRememberedQuery,
  resolveSearchCount,
  type SearchMemoryState,
} from './editor/search-memory'
import {
  consumeQueuedContent,
  recordQueuedContent,
  releaseQueuedContent,
  resolveIncomingContentDecision,
} from './editor/content-sync'
import { formatDocumentStats, resolveDocumentStats } from './editor/document-stats'
import { createAgentChangeAutoDismiss } from './agent-change-autodismiss'
import {
  createAgentChangeSession,
  mergeAgentChangeSession,
  type AgentChangeSession,
} from './agent-change-session'
import {
  decideAutosaveBehavior,
  getDocumentViewportKey,
  resolveCenteredViewportScrollTop,
  resolveSearchNavigationFocusMode,
  shouldShowEmptyEditorPlaceholder,
} from './editor/session-ux'
import {
  resolveAgentPanelClassName,
  resolveAgentPanelPlacement,
  resolveContextPanelState,
  type AgentPanelPlacement,
  type ContextPanelMode,
} from './phase-c-layout'
import { createSettingsDialogController, type SettingsPaneId } from './settings-dialog'
import {
  resolvePinnedItems,
  resolvePinControl,
  resolveRemoveActionKey,
  resolveRemoveActionPlan,
  resolveRemoveControl,
  resolveSidebarInlineTitleCommitAction,
  resolveVisibleTabItems,
  resolveVisibleWorkdirTreeRows,
  resolveWorkspaceLabel,
  shouldScrollWorkspaces,
  type SidebarItem,
  type WorkdirTreeRow,
} from './sidebar-view'
import { applyTheme, loadSavedTheme } from './themes/theme-manager'
import type { AgentChangePayload, AgentChangePreviewLine, AgentChangeSummary, AppSettings, BackgroundSettings, FontSettings, McpDocumentRequest, ShortcutAction, SidebarState, SidebarTab } from '../preload/index'
import { localMediaUrlToAbsolutePath } from '../shared/local-media'
import './themes/base.css'

type TitleEditingAPI = typeof window.electronAPI & {
  updateCurrentDraftTitle?: (nextTitle: string) => Promise<SidebarState | null>
  updateCurrentFileTitle?: (nextTitle: string) => Promise<SidebarState | null>
  updateDraftTitleById?: (draftId: string, nextTitle: string) => Promise<SidebarState | null>
  updateFileTitleByPath?: (filePath: string, nextTitle: string) => Promise<SidebarState | null>
  renameFileByPathFromTitle?: (filePath: string, nextTitle: string) => Promise<SidebarState | null>
  onMenuSettings?: (callback: () => void) => void
}

const SUPPORTED_IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif'])

function basename(filePath: string | null): string {
  if (!filePath) return 'Untitled'
  const normalized = filePath.replaceAll('\\', '/')
  return normalized.slice(normalized.lastIndexOf('/') + 1)
}

function extname(filePath: string | null): string {
  if (!filePath) return ''
  const base = basename(filePath)
  const lastDot = base.lastIndexOf('.')
  return lastDot <= 0 ? '' : base.slice(lastDot)
}

function dirname(filePath: string | null): string {
  if (!filePath) return ''
  const normalized = filePath.replaceAll('\\', '/')
  const lastSlash = normalized.lastIndexOf('/')
  return lastSlash === -1 ? '' : normalized.slice(0, lastSlash)
}

function isSupportedImageFile(file: File): boolean {
  const mimeType = file.type.trim().toLowerCase()
  if (mimeType === 'image/png' || mimeType === 'image/jpeg' || mimeType === 'image/jpg' || mimeType === 'image/webp' || mimeType === 'image/gif') {
    return true
  }
  return SUPPORTED_IMAGE_EXTENSIONS.has(extname(file.name).toLowerCase())
}

function sanitizeTitleToFileStem(title: string): string {
  return title.trim().replace(/[/\\:*?"<>|]/g, '').slice(0, 60)
}

function buildSuggestedTitleSyncPath(filePath: string | null, nextTitle: string): string | null {
  if (!filePath) return null
  const stem = sanitizeTitleToFileStem(nextTitle)
  if (!stem) return null
  const extension = extname(filePath) || '.md'
  return `${dirname(filePath)}/${stem}${extension}`
}

function isSamePath(a: string | null, b: string | null): boolean {
  if (!a || !b) return false
  return a === b
}

function clampSidebarWidth(width: number): number {
  return Math.min(460, Math.max(220, Math.round(width)))
}

function clampContextPanelWidth(width: number): number {
  return Math.min(520, Math.max(260, Math.round(width)))
}

function clampAgentDrawerHeight(height: number): number {
  return Math.min(420, Math.max(170, Math.round(height)))
}

function clearElement(element: Element): void {
  while (element.firstChild) element.removeChild(element.firstChild)
}

function createTextBlock(className: string, text: string): HTMLDivElement {
  const block = document.createElement('div')
  block.className = className
  block.textContent = text
  return block
}

function createSidebarInlineEditor(
  label: string,
  value: string,
  onInput: (nextValue: string) => void,
  onCommit: () => void,
  onCancel: () => void,
): HTMLDivElement {
  const shell = document.createElement('div')
  shell.className = 'sidebar-list-item editing'

  const input = document.createElement('input')
  input.type = 'text'
  input.className = 'sidebar-inline-title-input'
  input.value = value
  input.setAttribute('aria-label', label)
  input.addEventListener('click', (event) => {
    event.stopPropagation()
  })
  input.addEventListener('input', () => {
    onInput(input.value)
  })
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      onCommit()
    } else if (event.key === 'Escape') {
      event.preventDefault()
      onCancel()
    }
  })
  input.addEventListener('blur', () => {
    onCommit()
  })
  shell.appendChild(input)

  queueMicrotask(() => {
    input.focus()
    input.select()
  })

  return shell
}

function currentDocumentTitle(state: SidebarState): string {
  return state.currentDisplayTitle
}

function currentDocumentMeta(state: SidebarState): string {
  if (state.currentDocumentKind === 'draft') return '草稿会自动保存并可恢复'
  if (state.currentDocumentKind === 'blank') return '开始输入后会自动进入草稿'
  return state.currentFilePath ? '当前正在编辑' : '当前未打开文件'
}

function createDefaultSettings(): AppSettings {
  return {
    titleSyncMode: 'ask',
    saveAsMode: 'switch',
    themeName: 'elegant',
    shortcuts: {
      save: 'CmdOrCtrl+S',
      saveAs: 'CmdOrCtrl+Shift+S',
      settings: 'CmdOrCtrl+,',
      search: 'CmdOrCtrl+F',
      toggleSidebar: 'CmdOrCtrl+\\',
      toggleOutline: 'CmdOrCtrl+Shift+O',
      cleanCjkTypography: 'CmdOrCtrl+Shift+F',
      openAiPalette: 'CmdOrCtrl+J',
    },
    agentPanelPosition: 'auto',
    showDocumentStats: true,
    embedLocalImagesOnCopy: false,
    background: {
      mode: 'default',
      scope: 'editor',
      color: '#ffffff',
      imagePath: null,
      opacity: 1,
      blur: 0,
      dim: 0.18,
    },
    font: {
      preset: 'theme',
      customFamily: '',
    },
    aiHelper: {
      provider: {
        type: 'openai-compatible',
        baseUrl: 'https://api.openai.com/v1',
        apiKey: '',
        model: 'gpt-4.1-mini',
        temperature: 0.7,
      },
      customProvider: {
        type: 'openai-compatible',
        baseUrl: 'https://api.openai.com/v1',
        apiKey: '',
        model: 'gpt-4.1-mini',
        temperature: 0.7,
      },
      templates: [
        {
          id: 'polish',
          title: '润色',
          prompt: '你是专业文字编辑。请提升下面文字的清晰度、行文流畅度和简洁度，同时保留作者的声音与意图。只返回润色后的文字，不要解释：\n\n{{selection}}',
        },
        {
          id: 'condense',
          title: '精简',
          prompt: '请缩短下面文字，保留所有关键信息，去掉重复、松散句子和不必要的词。只返回精简后的文字，不要解释：\n\n{{selection}}',
        },
        {
          id: 'fix-grammar',
          title: '语法',
          prompt: '请修正下面文字中的语法、拼写、错别字和标点问题，不改变含义、风格或语气。只返回修正后的文字，不要解释：\n\n{{selection}}',
        },
        {
          id: 'rephrase',
          title: '转述',
          prompt: '请用不同的措辞和句式转述下面文字，严格保留原意和语气。只返回转述后的文字，不要解释：\n\n{{selection}}',
        },
        {
          id: 'simplify',
          title: 'Simplify',
          prompt: '请用更简单的词和更短的句子改写下面文字，让更多读者容易理解，同时保留原意。只返回简化后的文字，不要解释：\n\n{{selection}}',
        },
        {
          id: 'expand',
          title: 'Expand',
          prompt: '请把下面这段简短文字扩展成更充分、完整的表达，补充必要的细节、例子或解释，同时保留作者的语气和风格。只返回扩写后的文字，不要解释：\n\n{{selection}}',
        },
        {
          id: 'vivid',
          title: 'Vivid',
          prompt: '请为下面文字加入更鲜明的感官细节、具体画面和更有力的措辞，让表达更生动，同时保留原意和基本结构。只返回增强后的文字，不要解释：\n\n{{selection}}',
        },
        {
          id: 'rewrite-english',
          title: 'Rewrite In English',
          prompt: '请把下面文字改写成清晰、自然的英文。如果原文已经是英文，请提升它的流畅度和可读性；如果原文是其他语言，请保留原意、语气和结构并改写为英文。只返回英文结果，不要解释：\n\n{{selection}}',
        },
        {
          id: 'translate',
          title: 'Translate',
          prompt: '请把下面文字翻译成英文，保留原意、语气和格式。只返回译文，不要解释：\n\n{{selection}}',
        },
        {
          id: 'summarize',
          title: '总结',
          prompt: '请把下面文字总结成简洁的一段话，保留主要观点、关键论证和结论。只返回总结，不要解释：\n\n{{selection}}',
        },
      ],
    },
  }
}

function resolveBackgroundImageValue(imagePath: string | null): string {
  if (!imagePath) return 'none'
  const normalizedPath = imagePath.replace(/\\/g, '/')
  const url = normalizedPath.startsWith('/')
    ? `file://${normalizedPath}`
    : normalizedPath
  return `url("${encodeURI(url).replace(/"/g, '%22')}")`
}

function applyBackgroundSettings(background: BackgroundSettings): void {
  const root = document.documentElement
  root.dataset.backgroundMode = background.mode
  root.dataset.backgroundScope = background.scope
  root.style.setProperty('--lyra-bg-color', background.color)
  root.style.setProperty('--lyra-bg-image', resolveBackgroundImageValue(background.imagePath))
  root.style.setProperty('--lyra-bg-opacity', String(background.opacity))
  root.style.setProperty('--lyra-bg-blur', `${background.blur}px`)
  root.style.setProperty('--lyra-bg-dim', String(background.dim))
}

const FONT_PRESET_FAMILIES: Record<Exclude<FontSettings['preset'], 'custom'>, string> = {
  theme: 'var(--theme-editor-font-family)',
  elegant: "'LXGW WenKai', 'Noto Serif SC', 'Source Han Serif SC', 'Source Han Serif CN', 'Songti SC', 'SimSun', Georgia, 'Times New Roman', serif",
  sans: "'PingFang SC', 'SF Pro Text', 'Helvetica Neue', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif",
  serif: "'Noto Serif SC', 'Source Han Serif SC', 'Songti SC', Georgia, 'Times New Roman', serif",
  mono: "'SF Mono', Menlo, Monaco, Consolas, 'Liberation Mono', monospace",
}

function applyFontSettings(font: FontSettings): void {
  const root = document.documentElement
  const family = font.preset === 'custom' && font.customFamily
    ? font.customFamily
    : FONT_PRESET_FAMILIES[font.preset] ?? FONT_PRESET_FAMILIES.theme
  root.dataset.editorFontPreset = font.preset
  root.style.setProperty('--lyra-editor-font-family', family)
}

function normalizeShortcutKey(key: string): string {
  if (key === ' ') return 'Space'
  if (key.length === 1) return key.toUpperCase()
  return key
}

function eventMatchesShortcut(event: KeyboardEvent, accelerator: string): boolean {
  const parts = accelerator.split('+').map((part) => part.trim()).filter(Boolean)
  const key = parts.at(-1)
  if (!key) return false

  const needsPrimary = parts.includes('CmdOrCtrl') || parts.includes('CommandOrControl')
  const needsShift = parts.includes('Shift')
  const needsAlt = parts.includes('Alt') || parts.includes('Option')
  const needsCtrl = parts.includes('Ctrl') || parts.includes('Control')
  const needsMeta = parts.includes('Cmd') || parts.includes('Command') || parts.includes('Meta') || parts.includes('Super')
  const primaryPressed = event.metaKey || event.ctrlKey

  return normalizeShortcutKey(event.key) === key
    && (needsPrimary ? primaryPressed : (!event.metaKey && !event.ctrlKey) || needsCtrl || needsMeta)
    && event.shiftKey === needsShift
    && event.altKey === needsAlt
    && (!needsCtrl || event.ctrlKey)
    && (!needsMeta || event.metaKey)
}

function isFormInputTarget(target: EventTarget | null): boolean {
  const element = target instanceof HTMLElement ? target : null
  if (!element) return false
  return Boolean(element.closest('input, textarea, select'))
}

function shortcutFor(settings: AppSettings, action: ShortcutAction): string {
  return settings.shortcuts[action] ?? createDefaultSettings().shortcuts[action]
}

function createSidebarIconSvg(paths: string[], className: string): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('viewBox', '0 0 18 18')
  svg.setAttribute('width', '15')
  svg.setAttribute('height', '15')
  svg.setAttribute('aria-hidden', 'true')
  svg.setAttribute('fill', 'none')
  svg.setAttribute('stroke', 'currentColor')
  svg.setAttribute('stroke-width', '1.45')
  svg.setAttribute('stroke-linecap', 'round')
  svg.setAttribute('stroke-linejoin', 'round')
  svg.setAttribute('class', className)
  for (const data of paths) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    path.setAttribute('d', data)
    svg.appendChild(path)
  }
  return svg
}

function createFileItem(
  filePath: string,
  title: string,
  meta: string | null,
  currentFilePath: string | null,
  extraClass = '',
  source: 'recent' | 'workdir' | 'pinned' = 'recent',
): HTMLButtonElement {
  const item = document.createElement('button')
  item.type = 'button'
  item.className = `sidebar-list-item${extraClass ? ` ${extraClass}` : ''}`
  item.dataset.filePath = filePath
  item.dataset.sidebarSource = source
  item.title = filePath
  item.classList.toggle('active', isSamePath(filePath, currentFilePath))

  const icon = createSidebarIconSvg([
    'M5.2 3.5h5.1l2.5 2.5v8.5H5.2Z',
    'M10.3 3.5V6h2.5',
    'M7.2 8.8h3.6',
    'M7.2 11.1h3.1',
  ], 'sidebar-item-icon sidebar-file-icon')
  const content = document.createElement('div')
  content.className = 'sidebar-item-content'
  content.appendChild(createTextBlock('sidebar-title', title))
  if (meta) content.appendChild(createTextBlock('sidebar-meta', meta))
  item.append(icon, content)
  return item
}

function createDraftItem(
  draftId: string,
  title: string,
  currentDraftId: string | null,
): HTMLButtonElement {
  const item = document.createElement('button')
  item.type = 'button'
  item.className = 'sidebar-list-item draft-item'
  item.dataset.draftId = draftId
  item.title = title
  item.classList.toggle('active', draftId === currentDraftId)
  const icon = createSidebarIconSvg([
    'M5.2 3.5h5.1l2.5 2.5v8.5H5.2Z',
    'M10.3 3.5V6h2.5',
    'M7.2 8.8h3.6',
    'M7.2 11.1h3.1',
  ], 'sidebar-item-icon sidebar-draft-icon')
  const content = document.createElement('div')
  content.className = 'sidebar-item-content'
  content.appendChild(createTextBlock('sidebar-title', title))
  item.append(icon, content)
  return item
}

function syncSidebarState(): void {
  window.electronAPI.getSidebarState().then((state) => {
    if (state) {
      activeSidebarStateSetter?.(state)
    }
  }).catch(() => {})
}

let activeSidebarStateSetter: ((state: SidebarState) => void) | null = null

function renderEmpty(element: Element, text: string): void {
  clearElement(element)
  element.appendChild(createTextBlock('sidebar-empty', text))
}

async function init(): Promise<void> {
  const api = window.electronAPI as TitleEditingAPI
  async function applyConfiguredTheme(themeName: string): Promise<void> {
    if (themeName.startsWith('custom:')) {
      const fileName = themeName.slice(7)
      const css = await api.loadThemeCSS(fileName)
      applyTheme(themeName, css || undefined)
      return
    }
    applyTheme(themeName)
  }

  const searchParams = new URLSearchParams(window.location.search)
  const settingsWindowMode = searchParams.get('settingsWindow') === '1'
  const initialSettingsPane = searchParams.get('pane') as SettingsPaneId | null
  document.body.classList.toggle('settings-window-mode', settingsWindowMode)
  document.body.classList.toggle('platform-win32', api.platform === 'win32')
  let appSettings = createDefaultSettings()
  let sidebarState: SidebarState | null = null
  let lastDocumentViewportKey: string | null = null
  let pendingBlankMaterialization = false
  let titleEditActive = false
  let titleEditValue = ''
  let mcpRevision = `rev-${Date.now()}-${Math.random().toString(16).slice(2)}`
  let titleSyncPromptState:
    | {
        currentTitle: string
        nextTitle: string
        currentFilePath: string
        suggestedFilePath: string
      }
    | null = null
  let sidebarInlineTitleEdit:
    | { kind: 'draft'; draftId: string; value: string }
    | { kind: 'file'; filePath: string; source: 'recent' | 'workdir' | 'pinned'; value: string }
    | null = null
  let pendingTitleEditRequest:
    | {
        kind: 'draft'
        draftId: string
      }
    | {
        kind: 'file'
        filePath: string
      }
    | null = null
  let pendingRemoveActionKey: string | null = null
  let pendingRemoveActionTimer: ReturnType<typeof setTimeout> | null = null
  const expandedWorkdirFolders = new Set<string>()
  const collapsedWorkdirFolders = new Set<string>()
  const savedViewportOffsets = new Map<string, number>()
  const embeddedClipboardImageUrls = new Map<string, string>()
  let viewportRestoreRequestId = 0
  let drawerOpenedByHover = false
  let drawerHoverOpenTimer: ReturnType<typeof setTimeout> | null = null
  let drawerHoverCloseTimer: ReturnType<typeof setTimeout> | null = null
  const bumpMcpRevision = (): string => {
    mcpRevision = `rev-${Date.now()}-${Math.random().toString(16).slice(2)}`
    return mcpRevision
  }
  const scheduleViewportRestore = (scrollTop: number): void => {
    const requestId = ++viewportRestoreRequestId
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (requestId !== viewportRestoreRequestId || !editorShell) return
        editorShell.scrollTop = scrollTop
      })
    })
  }
  const setSidebarState = (state: SidebarState): void => {
    const nextViewportKey = getDocumentViewportKey(
      state.currentDocumentKind,
      state.currentFilePath,
      state.currentDraftId,
    )
    sidebarState = state
    if (lastDocumentViewportKey !== nextViewportKey) {
      bumpMcpRevision()
    }
    titleEditValue = state.currentDisplayTitle
    if (sidebarInlineTitleEdit) {
      if (sidebarInlineTitleEdit.kind === 'draft') {
        const updatedDraft = state.draftEntries.find((entry) => entry.id === sidebarInlineTitleEdit.draftId)
        if (updatedDraft) {
          sidebarInlineTitleEdit = {
            ...sidebarInlineTitleEdit,
            value: updatedDraft.displayTitle,
          }
        }
      } else {
        const nextValue = state.fileTitleOverrides[sidebarInlineTitleEdit.filePath]
          ?? basename(sidebarInlineTitleEdit.filePath)
        sidebarInlineTitleEdit = {
          ...sidebarInlineTitleEdit,
          value: nextValue,
        }
      }
    }
    if (pendingTitleEditRequest) {
      const shouldActivateEdit = pendingTitleEditRequest.kind === 'draft'
        ? state.currentDocumentKind === 'draft' && state.currentDraftId === pendingTitleEditRequest.draftId
        : state.currentDocumentKind === 'file' && state.currentFilePath === pendingTitleEditRequest.filePath

      if (shouldActivateEdit) {
        titleEditActive = true
        titleEditValue = state.currentDisplayTitle
        pendingTitleEditRequest = null
      }
    }
    if (state.currentDocumentKind !== 'blank') {
      pendingBlankMaterialization = false
    }
    if (state.currentDocumentKind === 'blank') {
      titleEditActive = false
      closeTitleSyncPrompt()
    }
    if (!state.isDrawerMode || !state.sidebarOpen) drawerOpenedByHover = false
    renderSidebar()
    schedulePlaceholderLayoutSync()

    if (!editorShell) {
      lastDocumentViewportKey = nextViewportKey
      return
    }

    if (lastDocumentViewportKey === nextViewportKey) return

    const restoreOffset = nextViewportKey ? savedViewportOffsets.get(nextViewportKey) ?? 0 : 0
    scheduleViewportRestore(restoreOffset)
    lastDocumentViewportKey = nextViewportKey
  }
  activeSidebarStateSetter = setSidebarState
  appSettings = (await api.getSettings().catch(() => null)) ?? createDefaultSettings()
  applyBackgroundSettings(appSettings.background)
  applyFontSettings(appSettings.font)
  setEmbedLocalImagesOnCopy(appSettings.embedLocalImagesOnCopy === true)
  if (appSettings.themeName) {
    await applyConfiguredTheme(appSettings.themeName)
  } else {
    await applyConfiguredTheme(loadSavedTheme())
  }

  const editorShell = document.getElementById('editor-shell') as HTMLElement | null
  const editorStage = document.getElementById('editor-stage') as HTMLElement | null
  const editor = document.getElementById('editor') as HTMLElement | null
  const editorPlaceholder = document.getElementById('editor-placeholder') as HTMLDivElement | null
  const documentStats = document.getElementById('document-stats') as HTMLDivElement | null
  const agentActivityDot = document.getElementById('agent-activity-dot') as HTMLDivElement | null
  const titleSyncOverlay = document.getElementById('title-sync-overlay') as HTMLDivElement | null
  const titleSyncCurrentName = document.getElementById('title-sync-current-name') as HTMLSpanElement | null
  const titleSyncNextName = document.getElementById('title-sync-next-name') as HTMLSpanElement | null
  const titleSyncOnce = document.getElementById('title-sync-once') as HTMLButtonElement | null
  const titleSyncAlways = document.getElementById('title-sync-always') as HTMLButtonElement | null
  const titleSyncNever = document.getElementById('title-sync-never') as HTMLButtonElement | null
  const appShell = document.getElementById('app-shell')
  const sidebarToggle = document.getElementById('sidebar-toggle') as HTMLButtonElement | null
  const settingsToggle = document.getElementById('settings-toggle') as HTMLButtonElement | null
  const agentToggle = document.getElementById('agent-toggle') as HTMLButtonElement | null
  const outlineToggle = document.getElementById('outline-toggle') as HTMLButtonElement | null
  const windowsMenu = document.getElementById('windows-menu') as HTMLElement | null
  const windowMinimize = document.getElementById('window-minimize') as HTMLButtonElement | null
  const windowMaximize = document.getElementById('window-maximize') as HTMLButtonElement | null
  const windowClose = document.getElementById('window-close') as HTMLButtonElement | null
  const drawerBackdrop = document.getElementById('sidebar-drawer-backdrop') as HTMLDivElement | null
  const drawerEdgeTrigger = document.getElementById('drawer-edge-trigger') as HTMLDivElement | null
  const drawerShell = document.getElementById('sidebar-drawer-shell') as HTMLDivElement | null
  const onboardingOverlay = document.getElementById('onboarding-overlay') as HTMLDivElement | null
  const onboardingChoose = document.getElementById('onboarding-choose') as HTMLButtonElement | null
  const onboardingSkip = document.getElementById('onboarding-skip') as HTMLButtonElement | null
  const onboardingDirectoryPreview = document.getElementById('onboarding-directory-preview') as HTMLDivElement | null
  const draftNew = document.getElementById('draft-new') as HTMLButtonElement | null
  const libraryCreateMenu = document.getElementById('library-create-menu') as HTMLDivElement | null
  const libraryCreateFile = document.getElementById('library-create-file') as HTMLButtonElement | null
  const libraryCreateFolder = document.getElementById('library-create-folder') as HTMLButtonElement | null
  const draftsToggle = document.getElementById('drafts-toggle') as HTMLButtonElement | null
  const recentFilesToggle = document.getElementById('recent-files-toggle') as HTMLButtonElement | null
  const workdirToggle = document.getElementById('workdir-toggle') as HTMLButtonElement | null
  const workdirChange = document.getElementById('workdir-change') as HTMLButtonElement | null
  const workspaceAdd = document.getElementById('workspace-add') as HTMLButtonElement | null
  const workspacesList = document.getElementById('workspaces-list') as HTMLDivElement | null
  const pinnedSection = document.getElementById('pinned-section') as HTMLElement | null
  const pinnedToggle = document.getElementById('pinned-toggle') as HTMLButtonElement | null
  const pinnedList = document.getElementById('pinned-list') as HTMLDivElement | null
  const draftsTab = document.getElementById('drafts-tab') as HTMLButtonElement | null
  const recentTab = document.getElementById('recent-tab') as HTMLButtonElement | null
  const workdirTab = document.getElementById('workdir-tab') as HTMLButtonElement | null
  const librarySection = document.getElementById('library-section') as HTMLElement | null
  const libraryScrollRegion = document.getElementById('library-scroll-region') as HTMLDivElement | null
  const libraryList = document.getElementById('library-list') as HTMLDivElement | null
  const currentFile = document.getElementById('current-file')
  const draftsList = document.getElementById('drafts-list')
  const draftsSection = document.getElementById('drafts-section')
  const recentFiles = document.getElementById('recent-files')
  const recentFilesSection = document.getElementById('recent-files-section')
  const workdirName = document.getElementById('workdir-name')
  const workdirBody = document.getElementById('workdir-body')
  const workdirSection = document.getElementById('workdir-section')
  const sidebarResizer = document.getElementById('sidebar-resizer')
  const searchPanel = document.getElementById('search-panel') as HTMLDivElement | null
  const searchInput = document.getElementById('search-input') as HTMLInputElement | null
  const searchCount = document.getElementById('search-count') as HTMLDivElement | null
  const searchClose = document.getElementById('search-close') as HTMLButtonElement | null
  const searchPrev = document.getElementById('search-prev') as HTMLButtonElement | null
  const searchNext = document.getElementById('search-next') as HTMLButtonElement | null
  const searchContextPrev = document.getElementById('search-context-prev') as HTMLDivElement | null
  const searchContextCurrent = document.getElementById('search-context-current') as HTMLDivElement | null
  const searchContextNext = document.getElementById('search-context-next') as HTMLDivElement | null
  const contextPanel = document.getElementById('context-panel') as HTMLElement | null
  const contextPanelResizer = document.getElementById('context-panel-resizer') as HTMLDivElement | null
  const agentPanel = document.getElementById('agent-panel') as HTMLElement | null
  const aiHelperTemplate = document.getElementById('ai-helper-template') as HTMLSelectElement | null
  const aiHelperDrawerTemplate = document.getElementById('ai-helper-drawer-template') as HTMLSelectElement | null
  const aiHelperSelectionPreview = document.getElementById('ai-helper-selection-preview') as HTMLDivElement | null
  const aiHelperDrawerSelectionPreview = document.getElementById('ai-helper-drawer-selection-preview') as HTMLDivElement | null
  const aiHelperPromptPreview = document.getElementById('ai-helper-prompt-preview') as HTMLTextAreaElement | null
  const aiHelperDrawerPromptPreview = document.getElementById('ai-helper-drawer-prompt-preview') as HTMLTextAreaElement | null
  const aiHelperResult = document.getElementById('ai-helper-result') as HTMLTextAreaElement | null
  const aiHelperDrawerResult = document.getElementById('ai-helper-drawer-result') as HTMLTextAreaElement | null
  const aiHelperStatus = document.getElementById('ai-helper-status') as HTMLDivElement | null
  const aiHelperDrawerStatus = document.getElementById('ai-helper-drawer-status') as HTMLDivElement | null
  const aiHelperRun = document.getElementById('ai-helper-run') as HTMLButtonElement | null
  const aiHelperDrawerRun = document.getElementById('ai-helper-drawer-run') as HTMLButtonElement | null
  const aiHelperCopyPrompt = document.getElementById('ai-helper-copy-prompt') as HTMLButtonElement | null
  const aiHelperDrawerCopyPrompt = document.getElementById('ai-helper-drawer-copy-prompt') as HTMLButtonElement | null
  const aiHelperReplaceSelection = document.getElementById('ai-helper-replace-selection') as HTMLButtonElement | null
  const aiHelperDrawerReplaceSelection = document.getElementById('ai-helper-drawer-replace-selection') as HTMLButtonElement | null
  const aiHelperInsertBelow = document.getElementById('ai-helper-insert-below') as HTMLButtonElement | null
  const aiHelperDrawerInsertBelow = document.getElementById('ai-helper-drawer-insert-below') as HTMLButtonElement | null
  const agentDrawer = document.getElementById('agent-drawer') as HTMLElement | null
  const agentDrawerResizer = document.getElementById('agent-drawer-resizer') as HTMLDivElement | null
  const outlinePanel = document.getElementById('outline-panel') as HTMLElement | null
  const outlineList = document.getElementById('outline-list') as HTMLDivElement | null
  const agentChangePanel = document.getElementById('agent-change-panel') as HTMLDivElement | null
  const agentChangeToggle = document.getElementById('agent-change-toggle') as HTMLButtonElement | null
  const agentChangeStats = document.getElementById('agent-change-stats') as HTMLSpanElement | null
  const agentChangeDetails = document.getElementById('agent-change-details') as HTMLDivElement | null
  const agentChangeList = document.getElementById('agent-change-list') as HTMLDivElement | null
  const agentChangeRestore = document.getElementById('agent-change-restore') as HTMLButtonElement | null
  const agentChangeDismiss = document.getElementById('agent-change-dismiss') as HTMLButtonElement | null
  const aiPaletteOverlay = document.getElementById('ai-command-overlay') as HTMLDivElement | null
  const aiPaletteSearch = document.getElementById('ai-palette-search') as HTMLTextAreaElement | null
  const aiPaletteChips = document.getElementById('ai-palette-chips') as HTMLDivElement | null
  const aiPaletteList = document.getElementById('ai-palette-list') as HTMLDivElement | null
  const aiPaletteStatus = document.getElementById('ai-palette-status') as HTMLDivElement | null
  const aiPaletteScope = document.getElementById('ai-palette-scope') as HTMLSpanElement | null
  const aiPaletteProviderLink = document.getElementById('ai-palette-provider-link') as HTMLButtonElement | null
  const aiPaletteClose = document.getElementById('ai-palette-close') as HTMLButtonElement | null

  if (contextPanel) {
    contextPanel.hidden = false
    contextPanel.setAttribute('aria-hidden', 'true')
  }

  if (agentDrawer) {
    agentDrawer.hidden = false
    agentDrawer.setAttribute('aria-hidden', 'true')
  }

  if (outlinePanel) {
    outlinePanel.setAttribute('aria-hidden', 'true')
  }

  const updateEditorPlaceholder = (content: string): void => {
    if (!editorPlaceholder) return
    editorPlaceholder.hidden = !shouldShowEmptyEditorPlaceholder(content)
  }

  let latestDocumentStatsText = formatDocumentStats(resolveDocumentStats(''))
  let documentStatsAiStatus = ''
  let agentActivityLightState = 'idle'

  const updateAgentActivityLight = (state: string): void => {
    agentActivityLightState = state === 'active' || state === 'cooldown'
      ? state
      : 'idle'
    if (!agentActivityDot) return
    agentActivityDot.dataset.agentActivity = agentActivityLightState
    agentActivityDot.className = `agent-activity-${agentActivityLightState}`
  }

  const renderDocumentStats = (): void => {
    if (!documentStats) return
    const shouldShow = appSettings.showDocumentStats !== false
    documentStats.hidden = !shouldShow
    if (!shouldShow) return
    const count = document.createElement('span')
    count.className = 'document-stats-count'
    count.textContent = latestDocumentStatsText
    if (!documentStatsAiStatus) {
      documentStats.replaceChildren(count)
      return
    }
    const aiStatus = document.createElement('span')
    aiStatus.className = 'document-stats-ai-status'
    aiStatus.textContent = documentStatsAiStatus
    documentStats.replaceChildren(aiStatus, count)
  }

  const updateDocumentStats = (content: string): void => {
    latestDocumentStatsText = formatDocumentStats(resolveDocumentStats(content))
    renderDocumentStats()
  }

  const updateDocumentStatsAiStatus = (status: string): void => {
    documentStatsAiStatus = status
    renderDocumentStats()
  }

  const getCurrentDocumentPathForAssets = (): string | null => {
    if (!sidebarState) return null
    if (sidebarState.currentDocumentKind === 'file') return sidebarState.currentFilePath
    if (sidebarState.currentDocumentKind !== 'draft' || !sidebarState.currentDraftId) return null

    return sidebarState.draftEntries.find((entry) => entry.id === sidebarState.currentDraftId)?.path ?? null
  }

  const persistImageFile = async (file: File): Promise<string | null> => {
    if (!isSupportedImageFile(file)) return null

    const payload = await file.arrayBuffer().then((buffer) => {
      return {
        bytes: new Uint8Array(buffer),
        fileName: file.name,
        mimeType: file.type,
      }
    }).catch(() => null)
    if (!payload) return null

    const result = await api.persistImageAsset(payload).catch(() => null)
    if (!result) return null
    if (result.sidebarState) {
      setSidebarState(result.sidebarState)
    }
    return result.markdownImagePath
  }

  const refreshClipboardImageEmbeds = async (): Promise<void> => {
    if (!appSettings.embedLocalImagesOnCopy) {
      embeddedClipboardImageUrls.clear()
      clearClipboardLocalImageReplacements()
      return
    }

    const root = document.querySelector('#editor .ProseMirror')
    if (!root) return

    const images = Array.from(root.querySelectorAll('img'))
    for (const image of images) {
      const resolvedSrc = image.getAttribute('src') ?? ''
      const absolutePath = localMediaUrlToAbsolutePath(resolvedSrc)
      if (!absolutePath) continue

      if (embeddedClipboardImageUrls.has(resolvedSrc)) {
        setClipboardLocalImageReplacement(resolvedSrc, embeddedClipboardImageUrls.get(resolvedSrc) ?? null)
        continue
      }

      const dataUrl = await api.readLocalImageAsDataUrl(absolutePath).catch(() => null)
      if (!dataUrl) continue
      embeddedClipboardImageUrls.set(resolvedSrc, dataUrl)
      setClipboardLocalImageReplacement(resolvedSrc, dataUrl)
    }
  }

  let renderedMediaRefreshQueued = false
  let renderedMediaObserver: MutationObserver | null = null

  const mutationAddsImageNode = (mutation: MutationRecord): boolean => {
    return Array.from(mutation.addedNodes).some((node) => {
      if (node instanceof HTMLImageElement) return true
      return node instanceof HTMLElement
        && (node.matches('img, .lyra-image-node') || node.querySelector('img') !== null)
    })
  }

  const refreshRenderedMedia = (): void => {
    if (renderedMediaRefreshQueued) return
    renderedMediaRefreshQueued = true
    requestAnimationFrame(() => {
      renderedMediaRefreshQueued = false
      refreshMarkdownImageSources(getCurrentDocumentPathForAssets())
      void refreshClipboardImageEmbeds()
    })
  }

  const observeRenderedMedia = (): void => {
    if (typeof MutationObserver === 'undefined') return

    const root = document.querySelector('#editor .ProseMirror')
    if (!root) return

    renderedMediaObserver?.disconnect()
    renderedMediaObserver = new MutationObserver((mutations) => {
      if (mutations.some((mutation) => mutationAddsImageNode(mutation))) {
        refreshRenderedMedia()
      }
    })
    renderedMediaObserver.observe(root, { childList: true, subtree: true })
  }

  const syncEditorPlaceholderLayout = (): void => {
    if (!editorPlaceholder || !editorStage) return

    const proseMirror = document.querySelector('#editor .ProseMirror') as HTMLElement | null
    if (!proseMirror) return

    const anchor = (proseMirror.firstElementChild as HTMLElement | null) ?? proseMirror
    const stageRect = editorStage.getBoundingClientRect()
    const anchorRect = anchor.getBoundingClientRect()
    const proseRect = proseMirror.getBoundingClientRect()
    const anchorStyle = window.getComputedStyle(anchor)

    editorPlaceholder.style.top = `${Math.max(0, anchorRect.top - stageRect.top)}px`
    editorPlaceholder.style.left = `${Math.max(0, anchorRect.left - stageRect.left)}px`
    editorPlaceholder.style.width = `${proseRect.width}px`
    editorPlaceholder.style.fontFamily = anchorStyle.fontFamily
    editorPlaceholder.style.fontSize = anchorStyle.fontSize
    editorPlaceholder.style.fontWeight = anchorStyle.fontWeight
    editorPlaceholder.style.lineHeight = anchorStyle.lineHeight
    editorPlaceholder.style.letterSpacing = anchorStyle.letterSpacing
    editorPlaceholder.style.textIndent = anchorStyle.textIndent
  }

  const schedulePlaceholderLayoutSync = (): void => {
    requestAnimationFrame(() => {
      syncEditorPlaceholderLayout()
    })
  }

  const applyOpenedDocument = (data: { content: string; path: string }): void => {
    resetLocalEchoState()
    clearAgentChangePanel()
    titleEditActive = false
    closeTitleSyncPrompt()
    applyProgrammaticDocumentContent(data.content)
  }

  if (typeof ResizeObserver !== 'undefined') {
    const placeholderLayoutObserver = new ResizeObserver(() => {
      schedulePlaceholderLayoutSync()
    })
    if (editorShell) placeholderLayoutObserver.observe(editorShell)
    if (appShell) placeholderLayoutObserver.observe(appShell)
  }

  await createEditor('editor', (markdown) => {
    updateEditorPlaceholder(markdown)
    updateDocumentStats(markdown)
    refreshRenderedMedia()
    schedulePlaceholderLayoutSync()
  })
  observeRenderedMedia()
  setPasteImageHandler(async (file) => {
    const imagePath = await persistImageFile(file)
    if (!imagePath) return null
    return imagePath
  })
  setEmbedLocalImagesOnCopy(appSettings.embedLocalImagesOnCopy === true)
  updateEditorPlaceholder(getMarkdown())
  updateDocumentStats(getMarkdown())
  refreshRenderedMedia()
  schedulePlaceholderLayoutSync()
  const settingsDialog = createSettingsDialogController({
    api,
    getAppSettings: () => appSettings,
    getSidebarState: () => sidebarState,
    onAppSettingsChange: (settings) => {
      appSettings = settings
      applyBackgroundSettings(appSettings.background)
      applyFontSettings(appSettings.font)
      setEmbedLocalImagesOnCopy(appSettings.embedLocalImagesOnCopy === true)
      renderDocumentStats()
      refreshAgentPanelPlacement()
      void refreshClipboardImageEmbeds()
    },
    onSidebarStateChange: (state) => {
      setSidebarState(state)
    },
  })
  const openSettingsSurface = (pane?: SettingsPaneId): void => {
    if (settingsWindowMode) {
      if (pane) settingsDialog.openPane(pane)
      else settingsDialog.open()
      return
    }
    api.openSettingsWindow(pane).catch(() => {
      if (pane) settingsDialog.openPane(pane)
      else settingsDialog.open()
    })
  }
  api.onSettingsChanged((settings) => {
    appSettings = settings
    void applyConfiguredTheme(appSettings.themeName)
    applyBackgroundSettings(appSettings.background)
    applyFontSettings(appSettings.font)
    setEmbedLocalImagesOnCopy(appSettings.embedLocalImagesOnCopy === true)
    renderDocumentStats()
    refreshAgentPanelPlacement()
    void refreshClipboardImageEmbeds()
    settingsDialog.refresh()
  })
  api.onSettingsOpenPane((pane) => {
    settingsDialog.openPane(pane as SettingsPaneId)
  })
  if (settingsWindowMode) {
    if (initialSettingsPane) settingsDialog.openPane(initialSettingsPane)
    else settingsDialog.open()
  }

  let immediateSaveInFlight = false
  let pendingImmediateSaveContent: string | null = null
  let immediateSavePromise: Promise<void> | null = null
  let deferredIncomingContent: { content: string; scrollTop: number; agentChangePayload: AgentChangePayload | null } | null = null
  const recentLocalEchoes = new Map<string, number>()
  let queuedAgentChangePayload: AgentChangePayload | null = null

  const hasPendingImmediateSave = (): boolean => immediateSaveInFlight || pendingImmediateSaveContent !== null

  const recordRecentLocalEcho = (content: string): void => {
    recordQueuedContent(recentLocalEchoes, content)
    setTimeout(() => {
      releaseQueuedContent(recentLocalEchoes, content)
    }, 2500)
  }

  const resetLocalEchoState = (): void => {
    recentLocalEchoes.clear()
    deferredIncomingContent = null
    queuedAgentChangePayload = null
  }

  const closeTitleSyncPrompt = (): void => {
    titleSyncPromptState = null
    if (!titleSyncOverlay) return
    titleSyncOverlay.hidden = true
    titleSyncOverlay.setAttribute('aria-hidden', 'true')
  }

  const openTitleSyncPrompt = (
    currentTitle: string,
    nextTitle: string,
    currentFilePath: string,
    suggestedFilePath: string,
  ): void => {
    titleSyncPromptState = {
      currentTitle,
      nextTitle,
      currentFilePath,
      suggestedFilePath,
    }
    if (titleSyncCurrentName) {
      titleSyncCurrentName.textContent = basename(currentFilePath)
      titleSyncCurrentName.title = currentFilePath
    }
    if (titleSyncNextName) {
      titleSyncNextName.textContent = basename(suggestedFilePath)
      titleSyncNextName.title = suggestedFilePath
    }
    if (!titleSyncOverlay) return
    titleSyncOverlay.hidden = false
    titleSyncOverlay.setAttribute('aria-hidden', 'false')
  }

  const processIncomingDocumentContent = (
    content: string,
    scrollTop: number,
    options: { allowDefer: boolean; agentChangePayload?: AgentChangePayload | null },
  ): void => {
    const decision = resolveIncomingContentDecision({
      currentContent: getMarkdown(),
      incomingContent: content,
      hasPendingLocalSave: options.allowDefer && hasPendingImmediateSave(),
      isKnownLocalEcho: consumeQueuedContent(recentLocalEchoes, content),
    })

    if (decision === 'ignore') return

    if (decision === 'defer') {
      deferredIncomingContent = {
        content,
        scrollTop,
        agentChangePayload: options.agentChangePayload ?? null,
      }
      return
    }

    deferredIncomingContent = null
    applyProgrammaticDocumentContent(content, scrollTop, { preserveHistory: true })
    if (options.agentChangePayload) {
      agentChangeSession = agentChangeSession
        ? mergeAgentChangeSession(agentChangeSession, options.agentChangePayload)
        : createAgentChangeSession(options.agentChangePayload)
      agentChangeExpanded = !hasShownAgentChangeHint
      hasShownAgentChangeHint = true
      renderAgentChangePanel()
      agentChangeAutoDismiss.schedule()
    } else {
      clearAgentChangePanel()
    }
  }

  const flushDeferredIncomingContent = (): void => {
    if (!deferredIncomingContent || hasPendingImmediateSave()) return

    const { content, scrollTop, agentChangePayload } = deferredIncomingContent
    deferredIncomingContent = null
    processIncomingDocumentContent(content, scrollTop, { allowDefer: false, agentChangePayload })
  }

  const runImmediateAutoSave = async (): Promise<void> => {
    if (immediateSaveInFlight) return immediateSavePromise ?? Promise.resolve()

    immediateSaveInFlight = true
    immediateSavePromise = (async () => {
      while (pendingImmediateSaveContent !== null) {
        const nextContent = pendingImmediateSaveContent
        pendingImmediateSaveContent = null
        recordRecentLocalEcho(nextContent)
        const result = await api.autosaveDocument(nextContent).catch(() => null)
        if (!result && pendingBlankMaterialization) {
          pendingBlankMaterialization = false
        }
        if (!result) {
          releaseQueuedContent(recentLocalEchoes, nextContent)
        }
        syncSidebarState()
      }

      immediateSaveInFlight = false
      immediateSavePromise = null
      flushDeferredIncomingContent()
    })()

    return immediateSavePromise
  }

  const saveImmediately = (content: string): Promise<void> => {
    pendingImmediateSaveContent = content
    return runImmediateAutoSave()
  }

  const flushAutoSave = async (): Promise<void> => {
    await (immediateSavePromise ?? Promise.resolve())
  }

  const commitDocumentTitleChange = async (nextTitle: string): Promise<void> => {
    if (!sidebarState) return

    const trimmedTitle = nextTitle.trim()
    if (!trimmedTitle) {
      titleEditActive = false
      titleEditValue = sidebarState.currentDisplayTitle
      renderSidebar()
      return
    }

    const currentTitle = sidebarState.currentDisplayTitle || basename(sidebarState.currentFilePath)

    if (trimmedTitle === currentTitle) {
      titleEditActive = false
      renderSidebar()
      return
    }

    titleEditActive = false
    titleEditValue = trimmedTitle
    closeTitleSyncPrompt()

    if (sidebarState.currentDocumentKind === 'draft') {
      const snapshot = await api.updateCurrentDraftTitle?.(trimmedTitle).catch(() => null)
      if (snapshot) setSidebarState(snapshot)
      return
    }

    if (sidebarState.currentDocumentKind === 'file' && sidebarState.currentFilePath) {
      const snapshot = await api.updateCurrentFileTitle?.(trimmedTitle).catch(() => null)
      if (snapshot) setSidebarState(snapshot)

      if (appSettings.titleSyncMode === 'always') {
        await api.renameCurrentFileFromTitle(trimmedTitle).catch(() => null)
        syncSidebarState()
        return
      }

      if (appSettings.titleSyncMode === 'ask') {
        const suggestedFilePath = buildSuggestedTitleSyncPath(sidebarState.currentFilePath, trimmedTitle)
        if (suggestedFilePath && suggestedFilePath !== sidebarState.currentFilePath) {
          openTitleSyncPrompt(currentTitle, trimmedTitle, sidebarState.currentFilePath, suggestedFilePath)
        }
      }
      return
    }
  }

  const cancelSidebarInlineTitleEdit = (): void => {
    sidebarInlineTitleEdit = null
    renderSidebar()
  }

  const commitSidebarInlineTitleEdit = async (): Promise<void> => {
    if (!sidebarInlineTitleEdit) return
    const editTarget = sidebarInlineTitleEdit
    const trimmedTitle = editTarget.value.trim()

    if (!trimmedTitle) {
      sidebarInlineTitleEdit = null
      renderSidebar()
      return
    }

    sidebarInlineTitleEdit = null

    const action = resolveSidebarInlineTitleCommitAction(editTarget)

    if (action.kind === 'update-draft-title') {
      const snapshot = api.updateDraftTitleById
        ? await api.updateDraftTitleById(action.draftId, trimmedTitle).catch(() => null)
        : (
            sidebarState?.currentDocumentKind === 'draft'
            && sidebarState.currentDraftId === action.draftId
            && api.updateCurrentDraftTitle
              ? await api.updateCurrentDraftTitle(trimmedTitle).catch(() => null)
              : null
          )
      if (snapshot) setSidebarState(snapshot)
      else renderSidebar()
      return
    }

    await flushAutoSave()
    const snapshot = api.renameFileByPathFromTitle
      ? await api.renameFileByPathFromTitle(action.filePath, trimmedTitle).catch(() => null)
      : (
          sidebarState?.currentDocumentKind === 'file'
          && sidebarState.currentFilePath === action.filePath
          && api.updateCurrentFileTitle
            ? await api.updateCurrentFileTitle(trimmedTitle).catch(() => null)
            : null
        )
    if (snapshot) setSidebarState(snapshot)
    else renderSidebar()
  }

  const startCurrentTitleEdit = (): void => {
    if (!sidebarState || sidebarState.currentDocumentKind === 'blank' || titleEditActive) return
    titleEditActive = true
    titleEditValue = currentDocumentTitle(sidebarState)
    renderSidebar()
  }

  const requestTitleEditForTarget = (request:
    | { kind: 'draft'; draftId: string }
    | { kind: 'file'; filePath: string }
  ): void => {
    if (!sidebarState || titleEditActive) return

    const alreadyCurrent = request.kind === 'draft'
      ? sidebarState.currentDocumentKind === 'draft' && sidebarState.currentDraftId === request.draftId
      : sidebarState.currentDocumentKind === 'file' && sidebarState.currentFilePath === request.filePath

    if (alreadyCurrent) {
      startCurrentTitleEdit()
      return
    }

    pendingTitleEditRequest = request
    persistCurrentViewportOffset()
    void flushAutoSave().then(() => {
      const action = request.kind === 'draft'
        ? api.openDraft(request.draftId)
        : api.openSidebarFile(request.filePath)
      action.catch(() => {
        pendingTitleEditRequest = null
      })
    })
  }

  const applyAskModeTitleSync = async (mode: 'once' | 'always' | 'never'): Promise<void> => {
    if (!titleSyncPromptState) return
    const nextTitle = titleSyncPromptState.nextTitle

    if (mode === 'never') {
      appSettings = (await api.updateSettings({ titleSyncMode: 'never' }).catch(() => null)) ?? {
        ...appSettings,
        titleSyncMode: 'never',
      }
      closeTitleSyncPrompt()
      return
    }

    if (mode === 'always') {
      appSettings = (await api.updateSettings({ titleSyncMode: 'always' }).catch(() => null)) ?? {
        ...appSettings,
        titleSyncMode: 'always',
      }
      await api.renameCurrentFileFromTitle(nextTitle).catch(() => null)
      syncSidebarState()
      closeTitleSyncPrompt()
      return
    }

    await api.renameCurrentFileFromTitle(nextTitle).catch(() => null)
    syncSidebarState()
    closeTitleSyncPrompt()
  }

  const persistCurrentViewportOffset = (): void => {
    if (!editorShell || !sidebarState) return
    const currentKey = getDocumentViewportKey(
      sidebarState.currentDocumentKind,
      sidebarState.currentFilePath,
      sidebarState.currentDraftId,
    )
    if (!currentKey) return
    savedViewportOffsets.set(currentKey, editorShell.scrollTop)
  }

  const applyProgrammaticDocumentContent = (
    content: string,
    nextScrollTop?: number,
    options: { preserveHistory?: boolean } = {},
  ): void => {
    const previousContent = getMarkdown()
    const shouldRestoreFocus = isEditorTextFocused()
    pendingBlankMaterialization = false
    setMarkdown(content, { preserveHistory: options.preserveHistory })
    if (previousContent !== content) bumpMcpRevision()
    refreshRenderedMedia()
    updateEditorPlaceholder(content)
    updateDocumentStats(content)
    schedulePlaceholderLayoutSync()
    refreshSearchPanel()
    if (outlinePanelOpen) renderOutlinePanel()

    if (!editorShell) return
    if (typeof nextScrollTop === 'number') {
      scheduleViewportRestore(nextScrollTop)
    }

    if (shouldRestoreFocus) {
      requestAnimationFrame(() => {
        focusEditorAtLastSelection()
      })
    }
  }

  const getMcpDocumentState = (): Record<string, unknown> => ({
    content: getMarkdown(),
    dirty: false,
    draftId: sidebarState?.currentDraftId ?? null,
    filePath: getCurrentDocumentPathForAssets(),
    kind: sidebarState?.currentDocumentKind ?? 'blank',
    revision: mcpRevision,
    title: sidebarState?.currentDisplayTitle ?? '',
  })

  const respondToMcpRequest = (id: string, success: boolean, data?: unknown, error?: string): void => {
    api.sendMcpDocumentResponse?.({
      id,
      success,
      data,
      error,
    })
  }

  api.onMcpDocumentRequest?.((request: McpDocumentRequest) => {
    void (async () => {
      try {
        if (request.type === 'lyramd.session.get_state') {
          respondToMcpRequest(request.id, true, {
            app: 'LyraMD',
            document: getMcpDocumentState(),
          })
          return
        }

        if (request.type === 'lyramd.document.read') {
          await flushAutoSave()
          respondToMcpRequest(request.id, true, getMcpDocumentState())
          return
        }

        if (request.type === 'lyramd.document.write') {
          const content = request.args?.content
          if (typeof content !== 'string') {
            respondToMcpRequest(request.id, false, undefined, 'content must be a string')
            return
          }

          const expectedRevision = request.args?.expected_revision
          if (typeof expectedRevision === 'string' && expectedRevision !== mcpRevision) {
            respondToMcpRequest(request.id, false, {
              current_revision: mcpRevision,
            }, 'STALE: document changed since the last read')
            return
          }

          applyProgrammaticDocumentContent(content, editorShell?.scrollTop ?? 0, { preserveHistory: true })
          await saveImmediately(content)
          respondToMcpRequest(request.id, true, {
            revision: mcpRevision,
          })
          return
        }

        respondToMcpRequest(request.id, false, undefined, `Unknown MCP request: ${request.type}`)
      } catch (error) {
        respondToMcpRequest(request.id, false, undefined, error instanceof Error ? error.message : String(error))
      }
    })()
  })

  const beginBlankDocumentFromSidebar = (): void => {
    void flushAutoSave().then(async () => {
      persistCurrentViewportOffset()
      const snapshot = await api.beginBlankDocument().catch(() => null)
      if (snapshot) setSidebarState(snapshot)
      resetLocalEchoState()
      clearAgentChangePanel()
      applyProgrammaticDocumentContent('', 0)
      focusEditorAtLastSelection()
    })
  }

  const beginLibraryDocumentFromSidebar = (): void => {
    if (sidebarState?.activeSidebarTab !== 'workdir') {
      beginBlankDocumentFromSidebar()
      return
    }

    if (!sidebarState.workdirPath) {
      api.chooseWorkdir().then((state) => {
        if (state) setSidebarState(state)
      }).catch(() => {})
      return
    }

    void flushAutoSave().then(async () => {
      persistCurrentViewportOffset()
      const snapshot = await api.createWorkdirFile().catch(() => null)
      if (snapshot) setSidebarState(snapshot)
      resetLocalEchoState()
      clearAgentChangePanel()
      applyProgrammaticDocumentContent('', 0)
      focusEditorAtLastSelection()
    })
  }

  const closeLibraryCreateMenu = (): void => {
    if (libraryCreateMenu) libraryCreateMenu.hidden = true
    draftNew?.classList.remove('active')
  }

  const openLibraryCreateMenu = (): void => {
    if (!libraryCreateMenu) return
    libraryCreateMenu.hidden = false
    draftNew?.classList.add('active')
  }

  const createWorkdirFileFromSidebar = (): void => {
    closeLibraryCreateMenu()
    if (!sidebarState?.workdirPath) {
      api.chooseWorkdir().then((state) => {
        if (state) setSidebarState(state)
      }).catch(() => {})
      return
    }

    void flushAutoSave().then(async () => {
      persistCurrentViewportOffset()
      const snapshot = await api.createWorkdirFile().catch(() => null)
      if (snapshot) setSidebarState(snapshot)
      resetLocalEchoState()
      clearAgentChangePanel()
      applyProgrammaticDocumentContent('', 0)
      focusEditorAtLastSelection()
    })
  }

  const createWorkdirFolderFromSidebar = (): void => {
    closeLibraryCreateMenu()
    api.createWorkdirFolder().then((state) => {
      if (state) setSidebarState(state)
    }).catch(() => syncSidebarState())
  }

  const getEffectiveDocumentKind = (): SidebarState['currentDocumentKind'] => {
    if (pendingBlankMaterialization) return 'draft'
    return sidebarState?.currentDocumentKind ?? 'blank'
  }

  onUserEdit(() => {
    bumpMcpRevision()
    const markdown = getMarkdown()
    updateEditorPlaceholder(markdown)
    updateDocumentStats(markdown)
    refreshRenderedMedia()
    if (outlinePanelOpen) renderOutlinePanel()

    const decision = decideAutosaveBehavior(
      'user',
      getEffectiveDocumentKind(),
      markdown,
    )

    if (decision.materializeDraftImmediately) {
      pendingBlankMaterialization = true
      void saveImmediately(markdown).catch(() => {
        pendingBlankMaterialization = false
      })
      return
    }

    if (decision.persistImmediately) {
      void saveImmediately(markdown)
      return
    }
  })

  editorShell?.addEventListener('scroll', () => {
    persistCurrentViewportOffset()
  }, { passive: true })

  let searchPanelOpen = false
  let outlinePanelOpen = false
  let agentPanelOpen = false
  let activeContextPanel: ContextPanelMode = 'agent'
  let agentPanelPlacement: AgentPanelPlacement = 'bottom'
  let contextPanelWidth = 310
  let agentDrawerHeight = 230
  let activeAiHelperTemplateId = 'polish'
  let aiHelperBusy = false
  let aiHelperResultText = ''
  let aiHelperStatusText = ''
  let aiPaletteOpen = false
  let aiPaletteBusy = false
  let aiPaletteStartedAt: number | null = null
  let aiPaletteStatusText = ''
  let aiPaletteActiveTemplateId: string | null = null
  let aiPaletteCustomInstruction = ''
  let aiPaletteSelectedIndex = 0
  let aiPaletteRunId = 0
  let aiPaletteTimerInterval: ReturnType<typeof setInterval> | null = null
  let searchInputComposing = false
  let searchQueryMemory: SearchMemoryState = {}
  let agentChangeSession: AgentChangeSession | null = null
  let agentChangeExpanded = false
  let hasShownAgentChangeHint = false
  const agentChangeAutoDismiss = createAgentChangeAutoDismiss(() => {
    clearAgentChangePanel()
  })

  const hasAgentChangeSession = (session: AgentChangeSession | null): session is AgentChangeSession => {
    return !!session && (
      session.summary.addedLines > 0
      || session.summary.removedLines > 0
      || session.summary.changedLines > 0
    )
  }

  const formatAgentChangeStats = (summary: AgentChangeSummary): string => {
    const parts: string[] = []
    if (summary.addedLines > 0) parts.push(`+${summary.addedLines}`)
    if (summary.removedLines > 0) parts.push(`-${summary.removedLines}`)
    if (summary.changedLines > 0) parts.push(`~${summary.changedLines}`)
    return parts.join(' ')
  }

  const formatAgentChangePreviewText = (line: AgentChangePreviewLine): string => {
    if (line.type === 'added') return `+ ${line.text}`
    if (line.type === 'removed') return `- ${line.text}`
    return `${line.previousText ?? ''} -> ${line.text}`
  }

  const renderAgentChangePanel = (): void => {
    if (!agentChangePanel || !agentChangeToggle || !agentChangeStats || !agentChangeDetails || !agentChangeList) return

    if (!hasAgentChangeSession(agentChangeSession)) {
      agentChangePanel.hidden = true
      agentChangeToggle.setAttribute('aria-expanded', 'false')
      agentChangeDetails.hidden = true
      clearElement(agentChangeList)
      return
    }

    agentChangePanel.hidden = false
    const title = document.getElementById('agent-change-title') as HTMLSpanElement | null
    if (title) title.textContent = agentChangeSession.updateCount > 1
      ? `外部更新 ${agentChangeSession.updateCount} 次`
      : '外部更新'
    agentChangeStats.textContent = formatAgentChangeStats(agentChangeSession.summary)
    agentChangeToggle.setAttribute('aria-expanded', agentChangeExpanded ? 'true' : 'false')
    agentChangeDetails.hidden = !agentChangeExpanded
    clearElement(agentChangeList)

    for (const previewLine of agentChangeSession.summary.preview) {
      const row = document.createElement('div')
      row.className = `agent-change-line ${previewLine.type}`

      const lineNumber = document.createElement('span')
      lineNumber.className = 'agent-change-line-number'
      lineNumber.textContent = String(previewLine.lineNumber)
      row.appendChild(lineNumber)

      const text = document.createElement('span')
      text.className = 'agent-change-line-text'
      text.title = formatAgentChangePreviewText(previewLine)
      text.textContent = formatAgentChangePreviewText(previewLine)
      row.appendChild(text)

      agentChangeList.appendChild(row)
    }

    if (agentChangeSession.summary.truncated) {
      agentChangeList.appendChild(createTextBlock('agent-change-truncated', '还有更多变更'))
    }
  }

  const clearAgentChangePanel = (): void => {
    agentChangeAutoDismiss.clear()
    agentChangeSession = null
    agentChangeExpanded = false
    renderAgentChangePanel()
  }

  const restoreAgentChangeSession = (): void => {
    if (!agentChangeSession) return
    const previousContent = agentChangeSession.previousContent
    applyProgrammaticDocumentContent(previousContent, editorShell?.scrollTop ?? 0, { preserveHistory: true })
    void saveImmediately(previousContent)
    clearAgentChangePanel()
  }

  const renderSearchPreviewText = (
    target: HTMLDivElement | null,
    text: string,
    emptyClass = false,
  ): void => {
    if (!target) return
    target.textContent = text
    target.classList.toggle('empty', emptyClass)
  }

  const renderSearchPreviewCurrent = (state: SearchState): void => {
    if (!searchContextCurrent) return

    const preview = resolveSearchPanelPreview(state)
    if (preview.status !== 'ready') {
      searchContextCurrent.textContent = preview.currentLine
      searchContextCurrent.classList.add('empty')
      renderSearchPreviewText(searchContextPrev, preview.previousLine, true)
      renderSearchPreviewText(searchContextNext, preview.nextLine, true)
      return
    }

    searchContextCurrent.classList.remove('empty')
    searchContextCurrent.textContent = ''

    if (preview.currentLineBefore) {
      searchContextCurrent.appendChild(document.createTextNode(preview.currentLineBefore))
      searchContextCurrent.appendChild(document.createTextNode(' '))
    }

    const match = document.createElement('span')
    match.className = 'search-context-current-match'
    match.textContent = preview.currentLineMatch
    searchContextCurrent.appendChild(match)

    if (preview.currentLineAfter) {
      searchContextCurrent.appendChild(document.createTextNode(` ${preview.currentLineAfter}`))
    }

    renderSearchPreviewText(searchContextPrev, preview.previousLine, preview.previousLine.length === 0)
    renderSearchPreviewText(searchContextNext, preview.nextLine, preview.nextLine.length === 0)
  }

  const getCurrentSearchDocumentKey = (): string | null => {
    if (!sidebarState) return null
    return getDocumentViewportKey(
      sidebarState.currentDocumentKind,
      sidebarState.currentFilePath,
      sidebarState.currentDraftId,
    )
  }

  const renderSearchPanel = (state: SearchState): void => {
    if (!searchCount || !searchPrev || !searchNext) return

    const hasQuery = !!state.normalizedQuery
    searchPanel?.classList.toggle('search-has-query', hasQuery)
    searchPanel?.classList.toggle('search-no-matches', hasQuery && state.totalMatches === 0)

    if (!hasQuery) {
      searchCount.textContent = ''
    } else if (state.totalMatches === 0) {
      searchCount.textContent = '无结果'
    } else {
      const count = resolveSearchCount(state.query, state.totalMatches, state.activeIndex)
      searchCount.textContent = `${count.activeNumber} / ${count.totalMatches}`
    }
    searchPrev.disabled = state.totalMatches === 0
    searchNext.disabled = state.totalMatches === 0
    renderSearchPreviewCurrent(state)
  }

  const refreshSearchPanel = (): void => {
    renderSearchPanel(getSearchState())
  }

  const renderOutlinePanel = (): void => {
    if (!outlineList) return
    clearElement(outlineList)

    const items = getOutlineItems()
    if (items.length === 0) {
      outlineList.appendChild(createTextBlock('outline-empty', '当前文档没有标题'))
      return
    }

    for (const item of items) {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = `outline-item level-${item.level}`
      button.dataset.outlineId = item.id
      button.textContent = item.title
      button.title = item.title
      button.addEventListener('click', () => {
        scrollToOutlineItem(item.id)
      })
      outlineList.appendChild(button)
    }
  }

  function applyAgentPanelPlacementClass(): void {
    appShell?.classList.remove('agent-panel-bottom', 'agent-panel-right')
    appShell?.classList.add(resolveAgentPanelClassName(agentPanelPlacement))
  }

  function syncContextPanelMetrics(): void {
    appShell?.style.setProperty('--context-panel-width', `${contextPanelWidth}px`)
    appShell?.style.setProperty('--agent-drawer-height', `${agentDrawerHeight}px`)
  }

  function syncAgentDrawerLeftOffset(): void {
    if (!sidebarState || sidebarState.isDrawerMode || !sidebarState.sidebarOpen) {
      appShell?.style.setProperty('--agent-drawer-left', '0px')
      return
    }
    const resizerWidth = sidebarResizer?.hidden ? 0 : 10
    appShell?.style.setProperty('--agent-drawer-left', `${sidebarState.sidebarWidth + resizerWidth}px`)
  }

  function applyResolvedContextPanelState(): void {
    const nextState = resolveContextPanelState({
      placement: agentPanelPlacement,
      activeContextPanel,
      agentPanelOpen,
      outlinePanelOpen,
    })
    activeContextPanel = nextState.activeContextPanel
    agentPanelOpen = nextState.agentPanelOpen
    outlinePanelOpen = nextState.outlinePanelOpen
  }

  function refreshAgentPanelPlacement(): void {
    agentPanelPlacement = resolveAgentPanelPlacement({
      preference: appSettings.agentPanelPosition,
      width: window.innerWidth,
      height: window.innerHeight,
      previous: agentPanelPlacement,
    })
    applyResolvedContextPanelState()
    applyAgentPanelPlacementClass()
  }

  const getAiHelperTemplates = () => {
    return appSettings.aiHelper?.templates?.length
      ? appSettings.aiHelper.templates
      : createDefaultSettings().aiHelper.templates
  }

  const resolveAiHelperTemplate = () => {
    const templates = getAiHelperTemplates()
    const template = templates.find((candidate) => candidate.id === activeAiHelperTemplateId)
      ?? templates[0]
    if (template) activeAiHelperTemplateId = template.id
    return template
  }

  const buildAiHelperPrompt = (selection: string): string => {
    const template = resolveAiHelperTemplate()
    if (!template) return selection
    if (template.prompt.includes('{{selection}}')) {
      return template.prompt.replaceAll('{{selection}}', selection)
    }
    return `${template.prompt}\n\n${selection}`
  }

  const renderAiHelperPanel = (): void => {
    const templates = getAiHelperTemplates()
    const activeTemplate = resolveAiHelperTemplate()
    const templateSelects = [aiHelperTemplate, aiHelperDrawerTemplate].filter((element): element is HTMLSelectElement => Boolean(element))
    const selectionPreviews = [aiHelperSelectionPreview, aiHelperDrawerSelectionPreview].filter((element): element is HTMLDivElement => Boolean(element))
    const promptPreviews = [aiHelperPromptPreview, aiHelperDrawerPromptPreview].filter((element): element is HTMLTextAreaElement => Boolean(element))
    const resultInputs = [aiHelperResult, aiHelperDrawerResult].filter((element): element is HTMLTextAreaElement => Boolean(element))
    const statusElements = [aiHelperStatus, aiHelperDrawerStatus].filter((element): element is HTMLDivElement => Boolean(element))
    const runButtons = [aiHelperRun, aiHelperDrawerRun].filter((element): element is HTMLButtonElement => Boolean(element))
    const copyButtons = [aiHelperCopyPrompt, aiHelperDrawerCopyPrompt].filter((element): element is HTMLButtonElement => Boolean(element))
    const replaceButtons = [aiHelperReplaceSelection, aiHelperDrawerReplaceSelection].filter((element): element is HTMLButtonElement => Boolean(element))
    const insertButtons = [aiHelperInsertBelow, aiHelperDrawerInsertBelow].filter((element): element is HTMLButtonElement => Boolean(element))

    for (const templateSelect of templateSelects) {
      clearElement(templateSelect)
      for (const template of templates) {
        const option = document.createElement('option')
        option.value = template.id
        option.textContent = template.title
        templateSelect.appendChild(option)
      }
      templateSelect.value = activeTemplate?.id ?? ''
    }

    const selection = getSelectedPlainText().trim()
    const prompt = selection ? buildAiHelperPrompt(selection) : ''
    for (const selectionPreview of selectionPreviews) {
      selectionPreview.textContent = selection || '先选中文本，再打开 AI 精灵。'
      selectionPreview.classList.toggle('empty', !selection)
    }
    for (const promptPreview of promptPreviews) {
      promptPreview.value = prompt
    }
    for (const resultInput of resultInputs) {
      if (document.activeElement !== resultInput) resultInput.value = aiHelperResultText
    }
    for (const copyButton of copyButtons) {
      copyButton.disabled = !prompt
    }
    for (const runButton of runButtons) {
      runButton.disabled = !prompt || aiHelperBusy
      runButton.textContent = aiHelperBusy ? '生成中...' : '直接生成'
    }
    for (const statusElement of statusElements) {
      statusElement.textContent = aiHelperStatusText
      statusElement.hidden = !aiHelperStatusText
    }
    const hasResult = Boolean(aiHelperResultText.trim())
    for (const replaceButton of replaceButtons) {
      replaceButton.disabled = !selection || !hasResult
    }
    for (const insertButton of insertButtons) {
      insertButton.disabled = !hasResult
    }
  }

  const renderContextPanel = (): void => {
    applyResolvedContextPanelState()
    const widePanel = agentPanelPlacement === 'right'
    const showAgentInRightPanel = widePanel && agentPanelOpen && activeContextPanel === 'agent'
    const showOutlineInRightPanel = outlinePanelOpen && (!widePanel || activeContextPanel === 'outline')
    const showContextPanel = showAgentInRightPanel || showOutlineInRightPanel
    const showAgentDrawer = !widePanel && agentPanelOpen

    syncContextPanelMetrics()
    syncAgentDrawerLeftOffset()

    appShell?.classList.toggle('context-panel-open', showContextPanel)
    appShell?.classList.toggle('agent-drawer-open', showAgentDrawer)
    appShell?.classList.toggle('outline-open', showOutlineInRightPanel)
    appShell?.classList.toggle('agent-open', agentPanelOpen)
    appShell?.classList.toggle('context-panel-agent', showAgentInRightPanel)
    appShell?.classList.toggle('context-panel-outline', showOutlineInRightPanel)
    outlineToggle?.classList.toggle('active', outlinePanelOpen)
    outlineToggle?.setAttribute('aria-pressed', outlinePanelOpen ? 'true' : 'false')
    contextPanel?.setAttribute('aria-hidden', showContextPanel ? 'false' : 'true')
    agentDrawer?.setAttribute('aria-hidden', showAgentDrawer ? 'false' : 'true')

    if (agentPanel) {
      agentPanel.hidden = !showAgentInRightPanel
      agentPanel.setAttribute('aria-hidden', showAgentInRightPanel ? 'false' : 'true')
    }
    if (showAgentInRightPanel || showAgentDrawer) renderAiHelperPanel()
    if (outlinePanel) {
      outlinePanel.hidden = !showOutlineInRightPanel
      outlinePanel.setAttribute('aria-hidden', showOutlineInRightPanel ? 'false' : 'true')
    }
    if (showOutlineInRightPanel) renderOutlinePanel()
  }

  const setContextPanelMode = (mode: 'agent' | 'outline'): void => {
    activeContextPanel = mode
    if (mode === 'agent') {
      agentPanelOpen = true
      if (agentPanelPlacement === 'right') outlinePanelOpen = false
    } else {
      outlinePanelOpen = true
      if (agentPanelPlacement === 'right') agentPanelOpen = false
    }
    refreshAgentPanelPlacement()
    renderContextPanel()
  }

  const toggleAgentPanel = (): void => {
    openAiPalette()
  }

  const openAiPalette = (): void => {
    if (!aiPaletteOverlay) return
    aiPaletteOpen = true
    aiPaletteBusy = false
    aiPaletteStatusText = ''
    aiPaletteCustomInstruction = ''
    aiPaletteSelectedIndex = 0
    aiPaletteActiveTemplateId = getAiHelperTemplates()[0]?.id ?? null
    agentToggle?.classList.add('active')
    agentToggle?.setAttribute('aria-pressed', 'true')
    clearAiPaletteTimer()
    if (aiPaletteSearch) aiPaletteSearch.value = ''
    aiPaletteOverlay.hidden = false
    aiPaletteOverlay.setAttribute('aria-hidden', 'false')
    renderAiPalette()
    queueMicrotask(() => {
      aiPaletteSearch?.focus()
    })
  }

  const closeAiPalette = (options: { restoreFocus?: boolean } = {}): void => {
    if (!aiPaletteOverlay) return
    if (aiPaletteBusy) {
      aiPaletteRunId += 1
      aiPaletteBusy = false
      aiPaletteStatusText = ''
    }
    aiPaletteOpen = false
    aiPaletteOverlay.hidden = true
    aiPaletteOverlay.setAttribute('aria-hidden', 'true')
    agentToggle?.classList.remove('active')
    agentToggle?.setAttribute('aria-pressed', 'false')
    clearAiPaletteTimer()
    if (options.restoreFocus !== false) {
      focusEditorAtLastSelection()
    }
  }

  const hideAiPaletteForBackgroundRun = (): void => {
    if (!aiPaletteOverlay) return
    aiPaletteOpen = false
    aiPaletteOverlay.hidden = true
    aiPaletteOverlay.setAttribute('aria-hidden', 'true')
    agentToggle?.classList.remove('active')
    agentToggle?.setAttribute('aria-pressed', 'false')
    focusEditorAtLastSelection()
  }

  const clearAiPaletteTimer = (): void => {
    if (aiPaletteTimerInterval) {
      clearInterval(aiPaletteTimerInterval)
      aiPaletteTimerInterval = null
    }
    aiPaletteStartedAt = null
    updateDocumentStatsAiStatus('')
  }

  const showAiPaletteStatusNotice = (status: string): void => {
    aiPaletteStatusText = status
    updateDocumentStatsAiStatus(status)
    window.setTimeout(() => {
      if (!aiPaletteBusy && documentStatsAiStatus === status) {
        updateDocumentStatsAiStatus('')
      }
    }, 4500)
  }

  const startAiPaletteTimer = (): void => {
    clearAiPaletteTimer()
    aiPaletteStartedAt = Date.now()
    aiPaletteStatusText = '思考中… 0s'
    updateDocumentStatsAiStatus(aiPaletteStatusText)
    aiPaletteTimerInterval = setInterval(() => {
      if (!aiPaletteStartedAt) return
      const elapsed = Math.floor((Date.now() - aiPaletteStartedAt) / 1000)
      aiPaletteStatusText = `思考中… ${elapsed}s`
      updateDocumentStatsAiStatus(aiPaletteStatusText)
      renderAiPalette()
    }, 250)
  }

  const getAiPaletteTemplateDescription = (templateId: string): string => {
    if (templateId === 'polish') return '改善清晰度和流畅度'
    if (templateId === 'condense') return 'Make text more concise'
    if (templateId === 'fix-grammar') return 'Fix grammar and spelling'
    if (templateId === 'rephrase') return 'Say the same thing differently'
    if (templateId === 'simplify') return 'Use simpler language'
    if (templateId === 'expand') return 'Develop idea into fuller prose'
    if (templateId === 'vivid') return 'Add sensory details and imagery'
    if (templateId === 'rewrite-english') return 'Rewrite text in English'
    if (templateId === 'translate') return 'Translate to English'
    if (templateId === 'summarize') return '提炼为简洁要点'
    return '基于当前选区生成建议'
  }

  const getAiPaletteTemplateCategory = (templateId: string): string => {
    if (['polish', 'condense', 'fix-grammar', 'simplify'].includes(templateId)) return 'EDITING'
    if (['rewrite-english', 'translate'].includes(templateId)) return 'TOOLS'
    if (['rephrase', 'expand', 'vivid'].includes(templateId)) return 'CREATIVE'
    if (['summarize'].includes(templateId)) return 'STRUCTURE'
    return 'CUSTOM'
  }

  const getAiPaletteCategoryLabel = (category: string): string => {
    if (category === 'EDITING') return 'EDITING'
    if (category === 'TOOLS') return 'TOOLS'
    if (category === 'CREATIVE') return 'CREATIVE'
    if (category === 'STRUCTURE') return 'STRUCTURE'
    return 'CUSTOM'
  }

  const getAiProviderLabel = (): string => {
    const provider = appSettings.aiHelper?.provider ?? createDefaultSettings().aiHelper.provider
    const baseUrl = provider.baseUrl.toLowerCase()
    if (baseUrl.includes('api.openai.com')) return 'OpenAI'
    if (baseUrl.includes('anthropic') || provider.model.toLowerCase().includes('claude')) return 'Claude 网关'
    try {
      return new URL(provider.baseUrl).hostname.replace(/^api\./, '')
    } catch {
      return 'OpenAI 兼容'
    }
  }

  const getAiPaletteFilteredTemplates = (): ReturnType<typeof getAiHelperTemplates> => {
    const templates = getAiHelperTemplates()
    const query = aiPaletteSearch?.value.trim().toLowerCase() ?? ''
    if (!query) return templates
    return templates.filter((template) => {
      return template.title.toLowerCase().includes(query)
        || template.id.toLowerCase().includes(query)
        || template.prompt.toLowerCase().includes(query)
    })
  }

  const hasAiPaletteCustomItem = (): boolean => {
    const query = aiPaletteSearch?.value.trim() ?? ''
    return Boolean(query) && getAiPaletteFilteredTemplates().length === 0
  }

  const getAiPaletteVisibleTemplates = (): ReturnType<typeof getAiHelperTemplates> => {
    const query = aiPaletteSearch?.value.trim() ?? ''
    const templates = getAiHelperTemplates()
    if (query) return getAiPaletteFilteredTemplates()
    return templates.slice(0, 2).concat(templates)
  }

  const clampAiPaletteSelectedIndex = (): void => {
    const itemCount = getAiPaletteVisibleTemplates().length + (hasAiPaletteCustomItem() ? 1 : 0)
    aiPaletteSelectedIndex = Math.max(0, Math.min(aiPaletteSelectedIndex, Math.max(0, itemCount - 1)))
  }

  const runSelectedAiPaletteItem = (): void => {
    const templates = getAiPaletteVisibleTemplates()
    const selectedTemplate = templates[aiPaletteSelectedIndex]
    if (selectedTemplate) {
      selectAiPaletteTemplate(selectedTemplate.id)
      void runAiPalettePrompt()
      return
    }

    const customInstruction = aiPaletteSearch?.value.trim() ?? ''
    if (!customInstruction) return
    aiPaletteActiveTemplateId = null
    aiPaletteCustomInstruction = customInstruction
    void runAiPalettePrompt()
  }

  const renderAiPalette = (): void => {
    if (!aiPaletteOverlay) return

    const selection = getSelectedPlainText().trim()
    const templates = getAiHelperTemplates()
    const filteredTemplates = getAiPaletteFilteredTemplates()
    const customInstruction = aiPaletteSearch?.value.trim() ?? ''
    const quickTemplates = templates.slice(0, 4)
    const hasCustomItem = hasAiPaletteCustomItem()
    clampAiPaletteSelectedIndex()

    if (aiPaletteChips) {
      clearElement(aiPaletteChips)
      for (const template of quickTemplates) {
        const chip = document.createElement('button')
        chip.type = 'button'
        chip.className = 'ai-palette-chip'
        chip.dataset.templateId = template.id
        chip.textContent = template.title
        chip.classList.toggle('active', aiPaletteActiveTemplateId === template.id)
        chip.disabled = aiPaletteBusy
        aiPaletteChips.appendChild(chip)
      }
    }

    if (aiPaletteStatus) {
      const paletteStatusText = aiPaletteBusy ? '' : (aiPaletteStatusText || (!selection ? '先选中文本，再使用 AI 精灵。' : ''))
      aiPaletteStatus.textContent = paletteStatusText
      aiPaletteStatus.hidden = !aiPaletteStatus.textContent
      aiPaletteStatus.classList.remove('success', 'error', 'busy')
      if (aiPaletteBusy) {
        aiPaletteStatus.classList.add('busy')
      } else if (aiPaletteStatusText === '完成') {
        aiPaletteStatus.classList.add('success')
      } else if (aiPaletteStatusText && !aiPaletteBusy) {
        aiPaletteStatus.classList.add('error')
      }
    }

    if (aiPaletteList) {
      clearElement(aiPaletteList)

      let itemIndex = 0
      const appendSection = (label: string): void => {
        const section = document.createElement('div')
        section.className = 'ai-palette-section-label'
        section.textContent = label
        aiPaletteList.appendChild(section)
      }

      const appendTemplateItem = (template: ReturnType<typeof getAiHelperTemplates>[number]): void => {
        const item = document.createElement('button')
        item.type = 'button'
        item.className = 'ai-palette-item'
        item.dataset.templateId = template.id
        item.setAttribute('role', 'option')
        item.setAttribute('aria-selected', String(itemIndex === aiPaletteSelectedIndex))
        item.classList.toggle('selected', itemIndex === aiPaletteSelectedIndex)
        item.disabled = aiPaletteBusy || !selection

        const copy = document.createElement('span')
        copy.className = 'ai-palette-item-copy'

        const title = document.createElement('span')
        title.className = 'ai-palette-item-title'
        title.textContent = template.title

        const description = document.createElement('span')
        description.className = 'ai-palette-item-description'
        description.textContent = getAiPaletteTemplateDescription(template.id)

        copy.append(title, description)

        const scope = document.createElement('span')
        scope.className = 'ai-palette-item-scope'
        scope.textContent = 'selection'

        item.append(copy, scope)
        aiPaletteList.appendChild(item)
        itemIndex += 1
      }

      const appendCustomItem = (): void => {
        const item = document.createElement('button')
        item.type = 'button'
        item.className = 'ai-palette-item'
        item.dataset.customInstruction = customInstruction
        item.setAttribute('role', 'option')
        item.setAttribute('aria-selected', String(itemIndex === aiPaletteSelectedIndex))
        item.classList.toggle('selected', itemIndex === aiPaletteSelectedIndex)
        item.disabled = aiPaletteBusy || !selection

        const copy = document.createElement('span')
        copy.className = 'ai-palette-item-copy'

        const title = document.createElement('span')
        title.className = 'ai-palette-item-title'
        title.textContent = '按描述执行'

        const description = document.createElement('span')
        description.className = 'ai-palette-item-description'
        description.textContent = customInstruction

        copy.append(title, description)

        const scope = document.createElement('span')
        scope.className = 'ai-palette-item-scope'
        scope.textContent = 'selection'

        item.append(copy, scope)
        aiPaletteList.appendChild(item)
        itemIndex += 1
      }

      if (customInstruction) {
        appendSection('匹配结果')
        for (const template of filteredTemplates) appendTemplateItem(template)
        if (hasCustomItem) appendCustomItem()
      } else {
        const recentTemplates = templates.slice(0, 2)
        appendSection('最近使用')
        for (const template of recentTemplates) appendTemplateItem(template)

        const categories = ['EDITING', 'TOOLS', 'CREATIVE', 'STRUCTURE', 'CUSTOM']
        for (const category of categories) {
          const categoryTemplates = templates.filter((template) => getAiPaletteTemplateCategory(template.id) === category)
          if (categoryTemplates.length === 0) continue
          appendSection(getAiPaletteCategoryLabel(category))
          for (const template of categoryTemplates) appendTemplateItem(template)
        }
      }
    }

    if (aiPaletteScope) {
      aiPaletteScope.textContent = '范围：selection'
    }
    if (aiPaletteProviderLink) {
      aiPaletteProviderLink.textContent = `通过 ${getAiProviderLabel()}`
    }
  }

  const selectAiPaletteTemplate = (templateId: string): void => {
    const template = getAiHelperTemplates().find((t) => t.id === templateId)
    if (!template) return
    aiPaletteActiveTemplateId = templateId
    aiPaletteCustomInstruction = template.prompt
    renderAiPalette()
  }

  const buildAiPalettePrompt = (selection: string): string => {
    const instruction = aiPaletteCustomInstruction.trim()
    if (!instruction) return selection
    if (instruction.includes('{{selection}}')) {
      return instruction.replaceAll('{{selection}}', selection)
    }
    return `${instruction}\n\n${selection}`
  }

  const runAiPalettePrompt = async (): Promise<void> => {
    const selectionSnapshot = getSelectedTextSnapshot()
    const selection = selectionSnapshot?.text.trim() ?? ''
    if (!selectionSnapshot || !selection || aiPaletteBusy) return

    const prompt = buildAiPalettePrompt(selection)
    aiPaletteBusy = true
    aiPaletteStatusText = ''
    const runId = aiPaletteRunId + 1
    aiPaletteRunId = runId
    renderAiPalette()
    startAiPaletteTimer()
    hideAiPaletteForBackgroundRun()

    const result = await api.completeAiPrompt(prompt).catch((error) => ({
      ok: false,
      error: error instanceof Error ? error.message : 'AI 请求失败。',
    }))

    aiPaletteBusy = false
    clearAiPaletteTimer()
    if (runId !== aiPaletteRunId) return

    if (result.ok && 'text' in result && result.text) {
      const created = createAiSuggestionFromSnapshot(result.text, selectionSnapshot)
      aiPaletteStatusText = created ? '完成' : '无法创建建议预览。'
      if (created) {
        return
      }
      showAiPaletteStatusNotice(aiPaletteStatusText)
    } else {
      showAiPaletteStatusNotice(result.error ?? 'AI 请求失败。')
    }
    renderAiPalette()
  }

  const setOutlinePanelOpen = (open: boolean): void => {
    if (open) {
      setContextPanelMode('outline')
      return
    }
    outlinePanelOpen = false
    renderContextPanel()
  }

  const toggleOutlinePanel = (): void => {
    refreshAgentPanelPlacement()
    if (outlinePanelOpen && activeContextPanel === 'outline') {
      outlinePanelOpen = false
    } else {
      activeContextPanel = 'outline'
      outlinePanelOpen = true
      if (agentPanelPlacement === 'right') agentPanelOpen = false
    }
    renderContextPanel()
  }

  const focusSearchInputWithoutSelecting = (): void => {
    if (!searchInput) return
    searchInput.focus()
    const caret = searchInput.value.length
    searchInput.setSelectionRange(caret, caret)
  }

  const centerActiveSearchResultInViewport = (): void => {
    if (!editorShell) return

    const selection = document.getSelection()
    if (!selection || selection.rangeCount === 0) return

    const range = selection.getRangeAt(0)
    const rects = range.getClientRects()
    const targetRect = rects[0] ?? range.getBoundingClientRect()
    if (!targetRect || targetRect.height === 0) return

    const shellRect = editorShell.getBoundingClientRect()
    const nextScrollTop = resolveCenteredViewportScrollTop({
      currentScrollTop: editorShell.scrollTop,
      viewportHeight: editorShell.clientHeight,
      targetTop: targetRect.top - shellRect.top,
      targetHeight: targetRect.height,
    })

    editorShell.scrollTop = nextScrollTop
    persistCurrentViewportOffset()
  }

  const navigateSearchMatches = (direction: 'next' | 'previous'): void => {
    focusEditorPreservingSelection()
    if (direction === 'previous') {
      previousSearchMatch()
    } else {
      nextSearchMatch()
    }
    refreshSearchPanel()
    centerActiveSearchResultInViewport()
  }

  const openSearchPanel = (): void => {
    const selectedText = window.getSelection?.()?.toString().trim() ?? ''
    const documentKey = getCurrentSearchDocumentKey()
    const nextQuery = selectedText || resolveRememberedQuery(searchQueryMemory, documentKey)

    searchPanelOpen = true
    if (searchPanel) {
      searchPanel.hidden = false
      searchPanel.setAttribute('aria-hidden', 'false')
    }
    if (searchInput) {
      searchInput.value = nextQuery
    }
    const nextState = setSearchQuery(nextQuery)
    if (searchInput) {
      searchInput.value = nextState.normalizedQuery
    }
    renderSearchPanel(nextState)
    searchInput?.focus()
    searchInput?.select()
  }

  const closeSearchPanel = (): void => {
    searchPanelOpen = false
    searchPanel?.classList.remove('search-has-query', 'search-no-matches')
    if (searchPanel) {
      searchPanel.hidden = true
      searchPanel.setAttribute('aria-hidden', 'true')
    }
  }

  const clearDrawerHoverTimers = (): void => {
    if (drawerHoverOpenTimer) {
      clearTimeout(drawerHoverOpenTimer)
      drawerHoverOpenTimer = null
    }
    if (drawerHoverCloseTimer) {
      clearTimeout(drawerHoverCloseTimer)
      drawerHoverCloseTimer = null
    }
  }

  const scheduleDrawerHoverOpen = (): void => {
    if (!sidebarState?.isDrawerMode || sidebarState.sidebarOpen) return
    if (drawerHoverOpenTimer) clearTimeout(drawerHoverOpenTimer)
    drawerHoverOpenTimer = setTimeout(() => {
      drawerHoverOpenTimer = null
      if (!sidebarState?.isDrawerMode || sidebarState.sidebarOpen) return
      drawerOpenedByHover = true
      api.toggleSidebar().catch(() => {
        drawerOpenedByHover = false
      })
    }, 140)
  }

  const scheduleDrawerHoverClose = (): void => {
    if (!drawerOpenedByHover || !sidebarState?.isDrawerMode || !sidebarState.sidebarOpen) return
    if (drawerHoverCloseTimer) clearTimeout(drawerHoverCloseTimer)
    drawerHoverCloseTimer = setTimeout(() => {
      drawerHoverCloseTimer = null
      if (!drawerOpenedByHover || !sidebarState?.isDrawerMode || !sidebarState.sidebarOpen) return
      drawerOpenedByHover = false
      api.toggleSidebar().catch(() => {})
    }, 160)
  }

  const createIconSvg = (
    paths: string[],
    options: { className?: string; filled?: boolean } = {},
  ): SVGSVGElement => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svg.setAttribute('viewBox', '0 0 18 18')
    svg.setAttribute('width', '15')
    svg.setAttribute('height', '15')
    svg.setAttribute('aria-hidden', 'true')
    svg.setAttribute('fill', options.filled ? 'currentColor' : 'none')
    svg.setAttribute('stroke', 'currentColor')
    svg.setAttribute('stroke-width', '1.45')
    svg.setAttribute('stroke-linecap', 'round')
    svg.setAttribute('stroke-linejoin', 'round')
    if (options.className) svg.setAttribute('class', options.className)

    for (const data of paths) {
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
      path.setAttribute('d', data)
      svg.appendChild(path)
    }

    return svg
  }

  const createPinButton = (item: SidebarItem): HTMLButtonElement => {
    const control = resolvePinControl(item.pinned, item.title)
    const button = document.createElement('button')
    button.type = 'button'
    button.className = `row-action-button pin-toggle-button${item.pinned ? ' active' : ''}`
    button.title = control.title
    if (item.kind === 'draft') {
      button.dataset.pinDraftId = item.id
    } else {
      button.dataset.pinFilePath = item.filePath
    }
    button.setAttribute('aria-label', control.ariaLabel)
    button.appendChild(createIconSvg(
      ['M6.8 2.8h4.4l-.8 4.2 3 3v1H9.8l-.6 4.2H8.8L8.2 11H4.6v-1l3-3-.8-4.2Z', 'M9 11v4.2'],
      { filled: control.icon === 'pin-filled' },
    ))
    return button
  }

  const clearPendingRemoveConfirmation = (): void => {
    if (pendingRemoveActionTimer) {
      clearTimeout(pendingRemoveActionTimer)
      pendingRemoveActionTimer = null
    }
    pendingRemoveActionKey = null
  }

  const requestRemoveConfirmation = (actionKey: string): boolean => {
    if (pendingRemoveActionKey === actionKey) {
      clearPendingRemoveConfirmation()
      return true
    }

    clearPendingRemoveConfirmation()
    pendingRemoveActionKey = actionKey
    pendingRemoveActionTimer = setTimeout(() => {
      pendingRemoveActionKey = null
      pendingRemoveActionTimer = null
      renderSidebar()
    }, 3500)
    renderSidebar()
    return false
  }

  const createRemoveButton = (item: SidebarItem): HTMLButtonElement | null => {
    const plan = resolveRemoveActionPlan(item)
    if (!plan) return null

    const actionKey = resolveRemoveActionKey(plan)
    const control = resolveRemoveControl(item.title, pendingRemoveActionKey === actionKey)
    const button = document.createElement('button')
    button.type = 'button'
    button.className = `row-action-button remove-action-button${control.tone === 'danger' ? ' confirm-delete' : ''}`
    button.title = control.title

    if (plan.kind === 'draft') {
      button.dataset.removeDraftId = plan.draftId
    } else if (plan.kind === 'recent') {
      button.dataset.removeRecentPath = plan.filePath
    } else if (plan.kind === 'workdir') {
      button.dataset.removeWorkdirPath = plan.filePath
    }
    button.setAttribute('aria-label', control.ariaLabel)
    button.appendChild(control.icon === 'check'
      ? createIconSvg(['M4 9.5 7.3 12.8 14 5.8'])
      : createIconSvg([
          'M5 6h8',
          'M7 6V4.5h4V6',
          'M6 6l.5 8h5L12 6',
        ]))
    return button
  }

  const createWorkbenchItem = (item: SidebarItem, allowInlineEdit: boolean): HTMLElement => {
    if (item.kind === 'draft') {
      if (allowInlineEdit && sidebarInlineTitleEdit?.kind === 'draft' && sidebarInlineTitleEdit.draftId === item.id) {
        return createSidebarInlineEditor(
          `编辑 ${item.title} 的标题`,
          sidebarInlineTitleEdit?.value ?? item.title,
          (nextValue) => {
            if (!sidebarInlineTitleEdit || sidebarInlineTitleEdit.kind !== 'draft') return
            sidebarInlineTitleEdit.value = nextValue
          },
          () => {
            void commitSidebarInlineTitleEdit()
          },
          () => {
            cancelSidebarInlineTitleEdit()
          },
        )
      }
      return createDraftItem(item.id, item.title, sidebarState?.currentDraftId ?? null)
    }

    if (allowInlineEdit && sidebarInlineTitleEdit?.kind === 'file'
      && sidebarInlineTitleEdit.filePath === item.filePath
      && sidebarInlineTitleEdit.source === item.source
    ) {
      return createSidebarInlineEditor(
        `编辑 ${item.title} 的标题`,
        sidebarInlineTitleEdit?.value ?? item.title,
        (nextValue) => {
          if (!sidebarInlineTitleEdit || sidebarInlineTitleEdit.kind !== 'file') return
          sidebarInlineTitleEdit.value = nextValue
        },
        () => {
          void commitSidebarInlineTitleEdit()
        },
        () => {
          cancelSidebarInlineTitleEdit()
        },
      )
    }

    return createFileItem(
      item.filePath,
      item.title,
      null,
      sidebarState?.currentFilePath ?? null,
      item.source === 'workdir' ? 'workdir-item' : '',
      item.source,
    )
  }

  const appendWorkbenchRow = (
    container: Element,
    item: SidebarItem,
    options: { allowInlineEdit: boolean; depth?: number; showRemove: boolean },
  ): void => {
    const row = document.createElement('div')
    row.className = 'sidebar-item-row'
    if (options.depth && options.depth > 0) {
      row.classList.add('tree-row')
      row.style.setProperty('--tree-depth', String(options.depth))
    }
    row.appendChild(createWorkbenchItem(item, options.allowInlineEdit))

    const actions = document.createElement('div')
    actions.className = 'sidebar-row-actions'
    actions.appendChild(createPinButton(item))

    if (options.showRemove) {
      const remove = createRemoveButton(item)
      if (remove) {
        row.classList.add('with-remove')
        actions.appendChild(remove)
      }
    }

    row.appendChild(actions)
    container.appendChild(row)
  }

  const createWorkdirFolderRow = (row: Extract<WorkdirTreeRow, { kind: 'directory' }>): HTMLElement => {
    const wrapper = document.createElement('div')
    wrapper.className = 'sidebar-item-row tree-folder-row'
    if (row.depth > 0) {
      wrapper.style.setProperty('--tree-depth', String(row.depth))
    }

    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'sidebar-item workdir-folder-item'
    button.dataset.workdirFolderPath = row.absolutePath
    button.dataset.workdirFolderExpanded = row.expanded ? 'true' : 'false'
    button.setAttribute('aria-expanded', row.expanded ? 'true' : 'false')
    button.title = row.relativePath
    button.appendChild(createIconSvg(row.expanded
      ? ['M5 7.2 9 11.2 13 7.2']
      : ['M7.2 5 11.2 9 7.2 13'],
      { className: 'workdir-folder-chevron' },
    ))
    button.appendChild(createIconSvg([
      'M3.5 5.4h4.2l1.2 1.4h5.6v6.8h-11Z',
      'M3.5 6.8h11',
    ], { className: 'sidebar-item-icon workdir-folder-icon' }))
    button.appendChild(createTextBlock('sidebar-title', row.name))

    wrapper.appendChild(button)
    return wrapper
  }

  const appendWorkdirTreeRows = (container: Element): void => {
    if (!sidebarState) return
    const rows = resolveVisibleWorkdirTreeRows(sidebarState, expandedWorkdirFolders, collapsedWorkdirFolders)

    for (const row of rows) {
      if (row.kind === 'directory') {
        container.appendChild(createWorkdirFolderRow(row))
        continue
      }
      appendWorkbenchRow(container, row, {
        allowInlineEdit: true,
        depth: row.depth,
        showRemove: true,
      })
    }
  }

  const renderSidebar = (): void => {
    if (!appShell || !workspacesList || !pinnedList || !libraryList || !sidebarState) return

    appShell.classList.toggle('sidebar-open', sidebarState.sidebarOpen)
    appShell.classList.toggle('drawer-mode', sidebarState.isDrawerMode)
    appShell.classList.toggle('drawer-open', sidebarState.isDrawerMode && sidebarState.sidebarOpen)
    appShell.style.setProperty('--sidebar-width', `${sidebarState.sidebarWidth}px`)
    if (drawerBackdrop) {
      drawerBackdrop.hidden = !(sidebarState.isDrawerMode && sidebarState.sidebarOpen)
      drawerBackdrop.setAttribute('aria-hidden', sidebarState.isDrawerMode && sidebarState.sidebarOpen ? 'false' : 'true')
    }
    if (sidebarResizer) {
      sidebarResizer.hidden = sidebarState.isDrawerMode || !sidebarState.sidebarOpen
    }
    syncAgentDrawerLeftOffset()
    if (onboardingOverlay) {
      onboardingOverlay.hidden = sidebarState.draftOnboardingCompleted
      onboardingOverlay.setAttribute('aria-hidden', sidebarState.draftOnboardingCompleted ? 'true' : 'false')
    }
    if (onboardingDirectoryPreview) {
      onboardingDirectoryPreview.textContent = sidebarState.draftDirectoryPath ?? 'Documents/LyraMD Drafts'
    }

    clearElement(workspacesList)
    workspacesList.classList.toggle('scrollable', shouldScrollWorkspaces(sidebarState.workspacePaths))
    if (sidebarState.workspacePaths.length === 0) {
      const action = document.createElement('button')
      action.type = 'button'
      action.id = 'workdir-empty-action'
      action.className = 'workspace-item empty'
      action.textContent = '选择目录'
      workspacesList.appendChild(action)
    } else {
      for (const workspacePath of sidebarState.workspacePaths) {
        const row = document.createElement('div')
        row.className = 'workspace-item-row with-remove'

        const item = document.createElement('button')
        item.type = 'button'
        item.className = 'workspace-item'
        item.dataset.workspacePath = workspacePath
        item.draggable = true
        item.title = workspacePath
        item.classList.toggle('active', workspacePath === sidebarState.workdirPath)
        item.appendChild(createTextBlock('workspace-item-label', resolveWorkspaceLabel(workspacePath)))
        item.appendChild(createTextBlock('workspace-drag-handle', '⋮⋮'))

        const actions = document.createElement('div')
        actions.className = 'workspace-row-actions'
        const remove = document.createElement('button')
        remove.type = 'button'
        remove.className = `row-action-button remove-action-button${pendingRemoveActionKey === `workspace:${workspacePath}` ? ' confirm-delete' : ''}`
        remove.dataset.removeWorkspacePath = workspacePath
        remove.title = pendingRemoveActionKey === `workspace:${workspacePath}`
          ? `确认移除 ${resolveWorkspaceLabel(workspacePath)}`
          : `从列表移除 ${resolveWorkspaceLabel(workspacePath)}`
        remove.setAttribute('aria-label', remove.title)
        remove.appendChild(pendingRemoveActionKey === `workspace:${workspacePath}`
          ? createIconSvg(['M4 9.5 7.3 12.8 14 5.8'])
          : createIconSvg([
              'M5 6h8',
              'M7 6V4.5h4V6',
              'M6 6l.5 8h5L12 6',
            ]))
        actions.appendChild(remove)

        row.appendChild(item)
        row.appendChild(actions)
        workspacesList.appendChild(row)
      }
    }

    pinnedSection?.classList.toggle('collapsed', !sidebarState.pinnedExpanded)
    if (pinnedToggle) {
      pinnedToggle.setAttribute('aria-expanded', sidebarState.pinnedExpanded ? 'true' : 'false')
    }
    clearElement(pinnedList)
    if (sidebarState.pinnedExpanded) {
      const pinnedItems = resolvePinnedItems(sidebarState)
      if (pinnedItems.length === 0) {
        pinnedList.appendChild(createTextBlock('sidebar-empty', '还没有置顶文稿'))
      } else {
        for (const item of pinnedItems) {
          appendWorkbenchRow(pinnedList, item, { allowInlineEdit: false, showRemove: false })
        }
      }
    }

    const activeTab = sidebarState.activeSidebarTab
    librarySection?.classList.toggle('library-tab-workdir', activeTab === 'workdir')
    if (draftNew) {
      const label = activeTab === 'workdir' ? '新建工作目录项目' : '新建草稿'
      draftNew.setAttribute('aria-label', label)
      draftNew.title = label
    }
    if (draftsTab) {
      draftsTab.classList.toggle('active', activeTab === 'drafts')
      draftsTab.setAttribute('aria-selected', activeTab === 'drafts' ? 'true' : 'false')
    }
    if (recentTab) {
      recentTab.classList.toggle('active', activeTab === 'recent')
      recentTab.setAttribute('aria-selected', activeTab === 'recent' ? 'true' : 'false')
    }
    if (workdirTab) {
      workdirTab.classList.toggle('active', activeTab === 'workdir')
      workdirTab.setAttribute('aria-selected', activeTab === 'workdir' ? 'true' : 'false')
    }

    clearElement(libraryList)
    const tabItems = resolveVisibleTabItems(sidebarState, activeTab)
    const hasWorkdirTree = activeTab === 'workdir' && sidebarState.workdirPath && sidebarState.workdirTree.length > 0
    if (tabItems.length === 0 && !hasWorkdirTree) {
      libraryList.appendChild(createTextBlock(
        'sidebar-empty',
        activeTab === 'drafts'
          ? '未命名草稿会在开始输入后出现在这里'
          : activeTab === 'workdir'
            ? (sidebarState.workdirPath ? '这个工作目录里没有 Markdown 文件' : '先选择一个工作区')
            : '还没有最近文件',
      ))
      return
    }

    if (hasWorkdirTree) {
      appendWorkdirTreeRows(libraryList)
      return
    }

    for (const item of tabItems) {
      appendWorkbenchRow(libraryList, item, {
        allowInlineEdit: true,
        showRemove: true,
      })
    }
  }

  const renderSidebarPreservingLibraryScroll = (): void => {
    const previousScrollTop = libraryScrollRegion?.scrollTop ?? 0
    renderSidebar()
    if (libraryScrollRegion) {
      libraryScrollRegion.scrollTop = previousScrollTop
    }
  }

  let zoomLevel = 0

  const applyZoom = (): void => {
    const root = document.documentElement
    const zoom = String(Math.pow(1.1, zoomLevel))
    root.style.setProperty('--app-zoom', zoom)
    const shell = document.getElementById('editor-shell')
    if (shell) {
      shell.style.setProperty('--editor-zoom', zoom)
    }
    schedulePlaceholderLayoutSync()
  }
  applyZoom()

  const saveCurrentDocument = (): void => {
    void flushAutoSave().then(() => {
      const markdown = getMarkdown()
      recordRecentLocalEcho(markdown)
      api.saveFile(markdown).catch(() => {})
    })
  }

  const saveCurrentDocumentAs = (): void => {
    void flushAutoSave().then(() => {
      const markdown = getMarkdown()
      recordRecentLocalEcho(markdown)
      api.saveFileAs(markdown, appSettings.saveAsMode).catch(() => {})
    })
  }

  const cleanCurrentCjkTypography = (): void => {
    void flushAutoSave().then(() => {
      const markdown = getMarkdown()
      const nextMarkdown = formatCjkTypography(markdown)
      if (nextMarkdown === markdown) return
      applyProgrammaticDocumentContent(nextMarkdown, editorShell?.scrollTop ?? 0, { preserveHistory: true })
      void saveImmediately(nextMarkdown)
    })
  }

  const exportCurrentHTML = (): void => {
    const s = getComputedStyle(document.body)
    const v = (name: string) => s.getPropertyValue(name).trim()
    const bgColor = v('--bg-color')
    const textColor = v('--text-color')
    const textMuted = v('--text-muted')
    const borderColor = v('--border-color')
    const linkColor = v('--link-color')
    const codeBg = v('--code-bg')
    const codeBlockBg = v('--code-block-bg')
    const codeBlockText = v('--code-block-text') || textColor
    const blockquoteBorder = v('--blockquote-border')
    const blockquoteBg = v('--blockquote-bg') || 'transparent'
    const tableHeaderBg = v('--table-header-bg')
    const selectionBg = v('--selection-bg')

    const editor = document.querySelector('#editor .ProseMirror')
    const fontFamily = editor ? getComputedStyle(editor).fontFamily : '-apple-system,BlinkMacSystemFont,sans-serif'

    const getElColor = (selector: string, fallback: string): string => {
      const el = document.querySelector(`#editor .ProseMirror ${selector}`)
      return el ? getComputedStyle(el).color : fallback
    }
    const strongColor = getElColor('strong', textColor)
    const codeColor = getElColor('code', textColor)

    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>LyraMD Export</title>
<style>
body{max-width:780px;margin:40px auto;padding:20px;font-family:${fontFamily};line-height:1.75;background:${bgColor};color:${textColor}}
h1{font-size:2em;font-weight:700;border-bottom:1px solid ${borderColor};padding-bottom:.3em}
h2{font-size:1.5em;font-weight:600;border-bottom:1px solid ${borderColor};padding-bottom:.25em}
h3{font-size:1.25em;font-weight:600}
strong{color:${strongColor}}
a{color:${linkColor};text-decoration:none}
code{background:${codeBg};color:${codeColor};padding:2px 6px;border-radius:3px;font-size:.875em;font-family:'SF Mono','Fira Code',Menlo,monospace}
pre{background:${codeBlockBg};color:${codeBlockText};padding:16px;border-radius:6px;overflow-x:auto;margin:1em 0}
pre code{background:none;padding:0;color:inherit}
blockquote{border-left:4px solid ${blockquoteBorder};background:${blockquoteBg};padding-left:16px;margin:1em 0;color:${textMuted}}
table{border-collapse:collapse;width:100%;margin:1em 0}
th,td{border:1px solid ${borderColor};padding:8px 12px}
th{background:${tableHeaderBg};font-weight:600}
hr{border:none;border-top:2px solid ${borderColor};margin:2em 0}
img{max-width:100%}
::selection{background:${selectionBg}}
</style>
</head><body>${getHTML()}</body></html>`
    api.exportHTML(html)
  }

  const applyThemeSelection = async (theme: string): Promise<void> => {
    await applyConfiguredTheme(theme)
    appSettings = (await api.updateSettings({ themeName: theme }).catch(() => null)) ?? {
      ...appSettings,
      themeName: theme,
    }
    settingsDialog.refresh()
  }

  const importCustomThemeSelection = async (): Promise<void> => {
    const result = await api.loadCustomTheme()
    if (!result) return
    const themeName = `custom:${result.name}`
    applyTheme(themeName, result.css)
    appSettings = (await api.updateSettings({ themeName }).catch(() => null)) ?? {
      ...appSettings,
      themeName,
    }
    settingsDialog.refresh()
  }

  const closeWindowsMenus = (): void => {
    windowsMenu?.querySelectorAll('.windows-menu-group.open').forEach((group) => {
      group.classList.remove('open')
    })
  }

  const execEditCommand = (command: string): void => {
    document.execCommand(command)
  }

  const handleWindowsMenuAction = (action: string): void => {
    closeWindowsMenus()

    if (action.startsWith('theme-')) {
      void applyThemeSelection(action.slice(6))
      return
    }

    switch (action) {
      case 'new':
        beginLibraryDocumentFromSidebar()
        break
      case 'new-window':
        api.createNewWindow().catch(() => {})
        break
      case 'open':
        persistCurrentViewportOffset()
        void flushAutoSave().then(() => api.openFile()).catch(() => {})
        break
      case 'save':
        saveCurrentDocument()
        break
      case 'save-as':
        saveCurrentDocumentAs()
        break
      case 'export-pdf':
        api.exportPDF().catch(() => {})
        break
      case 'export-html':
        exportCurrentHTML()
        break
      case 'undo':
      case 'redo':
      case 'cut':
      case 'copy':
      case 'paste':
        execEditCommand(action)
        break
      case 'select-all':
        execEditCommand('selectAll')
        break
      case 'find':
        openSearchPanel()
        break
      case 'clean-cjk':
        cleanCurrentCjkTypography()
        break
      case 'toggle-sidebar':
        clearDrawerHoverTimers()
        drawerOpenedByHover = false
        api.toggleSidebar().catch(() => {})
        break
      case 'toggle-outline':
        toggleOutlinePanel()
        break
      case 'zoom-in':
        zoomLevel = Math.max(-5, Math.min(5, zoomLevel + 1))
        applyZoom()
        break
      case 'zoom-out':
        zoomLevel = Math.max(-5, Math.min(5, zoomLevel - 1))
        applyZoom()
        break
      case 'zoom-reset':
        zoomLevel = 0
        applyZoom()
        break
      case 'open-ai-palette':
        openAiPalette()
        break
      case 'settings':
        closeTitleSyncPrompt()
        openSettingsSurface()
        break
      case 'import-theme':
        void importCustomThemeSelection()
        break
      case 'check-updates':
        api.checkForUpdates?.().catch(() => {})
        break
      case 'help':
        api.openExternal('https://github.com/Afeng01/LyraMD')
        break
    }
  }

  sidebarState = await api.getSidebarState()
  if (sidebarState) {
    renderSidebar()
  }

  api.onMenuOpen(async () => {
    persistCurrentViewportOffset()
    await flushAutoSave()
    await api.openFile()
  })

  api.onMenuSave(() => {
    saveCurrentDocument()
  })
  api.onMenuSaveAs(() => {
    saveCurrentDocumentAs()
  })
  api.onMenuSearch(() => {
    openSearchPanel()
  })
  api.onMenuCleanCjkTypography(() => {
    cleanCurrentCjkTypography()
  })
  api.onMenuOpenAiPalette(() => {
    openAiPalette()
  })
  api.onMenuSettings?.(() => {
    closeTitleSyncPrompt()
    openSettingsSurface()
  })
  api.onMenuExportPDF(() => api.exportPDF())
  api.onMenuExportHTML(() => {
    exportCurrentHTML()
  })
  api.onNewFile(() => {
    resetLocalEchoState()
    clearAgentChangePanel()
    applyProgrammaticDocumentContent('', 0)
  })
  api.onNewFileInWindow(() => {
    beginLibraryDocumentFromSidebar()
  })
  api.onFileOpened((data) => {
    applyOpenedDocument(data)
  })
  const startupDocument = typeof api.getCurrentDocument === 'function'
    ? await api.getCurrentDocument().catch(() => null)
    : null
  if (startupDocument) {
    applyOpenedDocument(startupDocument)
  }
  api.onFileChanged((content) => {
    const currentScrollTop = editorShell?.scrollTop ?? 0
    const agentChangePayload = queuedAgentChangePayload
    queuedAgentChangePayload = null
    processIncomingDocumentContent(content, currentScrollTop, { allowDefer: true, agentChangePayload })
  })
  api.onSetTheme((theme) => {
    void applyThemeSelection(theme)
  })
  api.onSetCustomCSS((css) => {
    const theme = appSettings.themeName || loadSavedTheme()
    applyTheme(theme, css)
  })

  api.onMenuImportTheme(() => {
    void importCustomThemeSelection()
  })

  api.onAgentChangeSummary((payload) => {
    queuedAgentChangePayload = payload
  })

  api.onSidebarState((state) => {
    setSidebarState(state)
    refreshRenderedMedia()
    settingsDialog.refresh()
  })

  api.onAgentActivity((state) => {
    updateAgentActivityLight(state)
  })

  sidebarToggle?.addEventListener('click', () => {
    clearDrawerHoverTimers()
    drawerOpenedByHover = false
    api.toggleSidebar().catch(() => {})
  })

  settingsToggle?.addEventListener('click', () => {
    closeTitleSyncPrompt()
    openSettingsSurface()
  })

  agentToggle?.addEventListener('click', () => {
    openAiPalette()
  })

  aiPaletteProviderLink?.addEventListener('click', () => {
    closeAiPalette({ restoreFocus: false })
    openSettingsSurface('integrations')
  })

  const handleAiHelperTemplateChange = (templateSelect: HTMLSelectElement): void => {
    activeAiHelperTemplateId = templateSelect.value
    renderAiHelperPanel()
  }

  const copyAiHelperPrompt = async (): Promise<void> => {
    const selection = getSelectedPlainText().trim()
    if (!selection) return
    const prompt = buildAiHelperPrompt(selection)
    await navigator.clipboard.writeText(prompt)
    aiHelperStatusText = '已复制 Prompt。'
    renderAiHelperPanel()
  }

  const runAiHelperPrompt = async (): Promise<void> => {
    const selection = getSelectedPlainText().trim()
    if (!selection || aiHelperBusy) return
    const prompt = buildAiHelperPrompt(selection)
    aiHelperBusy = true
    aiHelperStatusText = '正在请求 AI...'
    renderAiHelperPanel()
    const result = await api.completeAiPrompt(prompt).catch((error) => ({
      ok: false,
      error: error instanceof Error ? error.message : 'AI 请求失败。',
    }))
    aiHelperBusy = false
    if (result.ok && result.text) {
      aiHelperResultText = result.text
      aiHelperStatusText = 'AI 结果已生成，可替换或插入。'
    } else {
      aiHelperStatusText = result.error ?? 'AI 请求失败。'
    }
    renderAiHelperPanel()
  }

  const handleAiHelperResultInput = (resultInput: HTMLTextAreaElement): void => {
    aiHelperResultText = resultInput.value
    renderAiHelperPanel()
  }

  const replaceSelectionWithAiHelperResult = (): void => {
    const result = aiHelperResultText.trim()
    if (!result) return
    if (replaceSelectedText(result)) {
      aiHelperResultText = ''
      aiHelperStatusText = '已替换选区。'
      renderAiHelperPanel()
    }
  }

  const insertAiHelperResultBelow = (): void => {
    const result = aiHelperResultText.trim()
    if (!result) return
    if (insertTextBelowSelection(result)) {
      aiHelperResultText = ''
      aiHelperStatusText = '已插入到下方。'
      renderAiHelperPanel()
    }
  }

  for (const templateSelect of [aiHelperTemplate, aiHelperDrawerTemplate]) {
    templateSelect?.addEventListener('change', () => handleAiHelperTemplateChange(templateSelect))
  }

  for (const copyButton of [aiHelperCopyPrompt, aiHelperDrawerCopyPrompt]) {
    copyButton?.addEventListener('click', () => { void copyAiHelperPrompt() })
  }

  for (const runButton of [aiHelperRun, aiHelperDrawerRun]) {
    runButton?.addEventListener('click', () => { void runAiHelperPrompt() })
  }

  for (const resultInput of [aiHelperResult, aiHelperDrawerResult]) {
    resultInput?.addEventListener('input', () => handleAiHelperResultInput(resultInput))
  }

  for (const replaceButton of [aiHelperReplaceSelection, aiHelperDrawerReplaceSelection]) {
    replaceButton?.addEventListener('click', replaceSelectionWithAiHelperResult)
  }

  for (const insertButton of [aiHelperInsertBelow, aiHelperDrawerInsertBelow]) {
    insertButton?.addEventListener('click', insertAiHelperResultBelow)
  }

  document.addEventListener('selectionchange', () => {
    if (!agentPanelOpen) return
    renderAiHelperPanel()
  })

  aiPaletteClose?.addEventListener('click', () => {
    closeAiPalette()
  })

  aiPaletteOverlay?.addEventListener('click', (event) => {
    if (event.target === aiPaletteOverlay) {
      closeAiPalette()
    }
  })

  aiPaletteChips?.addEventListener('click', (event) => {
    const chip = (event.target as HTMLElement)?.closest('[data-template-id]') as HTMLElement | null
    const templateId = chip?.dataset.templateId
    if (!templateId || aiPaletteBusy) return
    selectAiPaletteTemplate(templateId)
    void runAiPalettePrompt()
  })

  aiPaletteList?.addEventListener('click', (event) => {
    const item = (event.target as HTMLElement)?.closest('.ai-palette-item') as HTMLElement | null
    if (!item || aiPaletteBusy) return
    const items = Array.from(aiPaletteList.querySelectorAll('.ai-palette-item'))
    aiPaletteSelectedIndex = Math.max(0, items.indexOf(item))
    const templateId = item.dataset.templateId
    if (templateId) {
      selectAiPaletteTemplate(templateId)
      void runAiPalettePrompt()
      return
    }
    aiPaletteActiveTemplateId = null
    aiPaletteCustomInstruction = item.dataset.customInstruction ?? aiPaletteSearch?.value.trim() ?? ''
    void runAiPalettePrompt()
  })

  aiPaletteSearch?.addEventListener('input', () => {
    aiPaletteCustomInstruction = aiPaletteSearch.value
    aiPaletteActiveTemplateId = null
    aiPaletteSelectedIndex = 0
    renderAiPalette()
  })

  aiPaletteSearch?.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const itemCount = getAiPaletteVisibleTemplates().length + (hasAiPaletteCustomItem() ? 1 : 0)
      if (itemCount === 0) return
      aiPaletteSelectedIndex = event.key === 'ArrowDown'
        ? (aiPaletteSelectedIndex + 1) % itemCount
        : (aiPaletteSelectedIndex - 1 + itemCount) % itemCount
      renderAiPalette()
      return
    }
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      runSelectedAiPaletteItem()
    }
  })

  document.addEventListener('selectionchange', () => {
    if (!aiPaletteOpen) return
    renderAiPalette()
  })

  outlineToggle?.addEventListener('click', () => {
    toggleOutlinePanel()
  })

  api.onMenuToggleOutline(() => {
    toggleOutlinePanel()
  })

  windowsMenu?.addEventListener('click', (event) => {
    const target = event.target as HTMLElement | null
    const actionButton = target?.closest('[data-windows-action]') as HTMLButtonElement | null
    if (actionButton) {
      event.preventDefault()
      event.stopPropagation()
      const action = actionButton.dataset.windowsAction
      if (action) handleWindowsMenuAction(action)
      return
    }

    const menuButton = target?.closest('[data-windows-menu]') as HTMLButtonElement | null
    if (!menuButton) return
    event.preventDefault()
    event.stopPropagation()
    const group = menuButton.closest('.windows-menu-group')
    const wasOpen = group?.classList.contains('open') ?? false
    closeWindowsMenus()
    if (!wasOpen) group?.classList.add('open')
  })

  windowMinimize?.addEventListener('click', () => {
    api.minimizeWindow().catch(() => {})
  })

  windowMaximize?.addEventListener('click', () => {
    api.toggleMaximizeWindow().catch(() => {})
  })

  windowClose?.addEventListener('click', () => {
    api.closeWindow().catch(() => {})
  })

  agentChangeToggle?.addEventListener('click', () => {
    agentChangeExpanded = !agentChangeExpanded
    renderAgentChangePanel()
    if (agentChangeExpanded && hasAgentChangeSession(agentChangeSession)) {
      agentChangeAutoDismiss.schedule()
    }
  })

  agentChangeRestore?.addEventListener('click', () => {
    restoreAgentChangeSession()
  })

  agentChangeDismiss?.addEventListener('click', () => {
    clearAgentChangePanel()
  })

  drawerBackdrop?.addEventListener('click', () => {
    if (sidebarState?.isDrawerMode && sidebarState.sidebarOpen) {
      clearDrawerHoverTimers()
      drawerOpenedByHover = false
      api.toggleSidebar().catch(() => {})
    }
  })

  drawerEdgeTrigger?.addEventListener('pointerenter', () => {
    scheduleDrawerHoverOpen()
  })

  drawerEdgeTrigger?.addEventListener('pointerleave', () => {
    if (drawerHoverOpenTimer) {
      clearTimeout(drawerHoverOpenTimer)
      drawerHoverOpenTimer = null
    }
  })

  drawerShell?.addEventListener('pointerenter', () => {
    if (drawerHoverCloseTimer) {
      clearTimeout(drawerHoverCloseTimer)
      drawerHoverCloseTimer = null
    }
  })

  drawerShell?.addEventListener('pointerleave', () => {
    scheduleDrawerHoverClose()
  })

  api.onZoomChange((data) => {
    if (data.level !== undefined) {
      zoomLevel = data.level
    } else if (data.delta !== undefined) {
      zoomLevel = Math.max(-5, Math.min(5, zoomLevel + data.delta))
    }
    applyZoom()
  })

  recentFilesToggle?.addEventListener('click', () => {
    api.toggleRecentFilesExpanded().catch(() => {})
  })

  draftNew?.addEventListener('click', () => {
    if (sidebarState?.activeSidebarTab === 'workdir') {
      openLibraryCreateMenu()
      return
    }
    closeLibraryCreateMenu()
    beginBlankDocumentFromSidebar()
  })

  libraryCreateFile?.addEventListener('click', createWorkdirFileFromSidebar)

  libraryCreateFolder?.addEventListener('click', createWorkdirFolderFromSidebar)

  currentFile?.addEventListener('dblclick', (event) => {
    event.preventDefault()
    startCurrentTitleEdit()
  })

  draftsToggle?.addEventListener('click', () => {
    api.toggleDraftsExpanded().catch(() => {})
  })

  workdirToggle?.addEventListener('click', () => {
    api.toggleWorkdirExpanded().catch(() => {})
  })

  pinnedToggle?.addEventListener('click', () => {
    api.togglePinnedExpanded().catch(() => {})
  })

  workdirChange?.addEventListener('click', () => {
    api.chooseWorkdir().catch(() => {})
  })

  workspaceAdd?.addEventListener('click', () => {
    api.chooseWorkdir().catch(() => {})
  })

  const selectSidebarTab = (tab: SidebarTab): void => {
    api.setActiveSidebarTab(tab).then((state) => {
      if (state) setSidebarState(state)
    }).catch(() => syncSidebarState())
  }

  draftsTab?.addEventListener('click', () => {
    selectSidebarTab('drafts')
  })

  recentTab?.addEventListener('click', () => {
    selectSidebarTab('recent')
  })

  workdirTab?.addEventListener('click', () => {
    selectSidebarTab('workdir')
  })

  document.addEventListener('dragstart', (event) => {
    const target = event.target as HTMLElement | null
    const workspaceButton = target?.closest('[data-workspace-path]') as HTMLElement | null
    if (!workspaceButton) return
    const workspacePath = workspaceButton.dataset.workspacePath
    if (!workspacePath || !event.dataTransfer) return
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('application/x-colamd-workspace', workspacePath)
  })

  document.addEventListener('dragover', (event) => {
    const target = event.target as HTMLElement | null
    const workspaceButton = target?.closest('[data-workspace-path]') as HTMLElement | null
    if (!workspaceButton || !event.dataTransfer) return
    if (!event.dataTransfer.types.includes('application/x-colamd-workspace')) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    workspaceButton.classList.add('drag-over')
  })

  document.addEventListener('dragleave', (event) => {
    const target = event.target as HTMLElement | null
    target?.closest('[data-workspace-path]')?.classList.remove('drag-over')
  })

  document.addEventListener('dragend', () => {
    document.querySelectorAll('.workspace-item.drag-over').forEach((element) => {
      element.classList.remove('drag-over')
    })
  })

  document.addEventListener('drop', (event) => {
    const target = event.target as HTMLElement | null
    const workspaceButton = target?.closest('[data-workspace-path]') as HTMLElement | null
    if (!workspaceButton || !event.dataTransfer) return
    const sourcePath = event.dataTransfer.getData('application/x-colamd-workspace')
    const targetPath = workspaceButton.dataset.workspacePath
    document.querySelectorAll('.workspace-item.drag-over').forEach((element) => {
      element.classList.remove('drag-over')
    })
    if (!sourcePath || !targetPath || sourcePath === targetPath) return
    event.preventDefault()
    api.reorderWorkspaces(sourcePath, targetPath).then((state) => {
      if (state) setSidebarState(state)
    }).catch(() => syncSidebarState())
  })

  onboardingChoose?.addEventListener('click', () => {
    api.chooseDraftDirectory().then((state) => {
      if (state) setSidebarState(state)
    }).catch(() => {})
  })

  onboardingSkip?.addEventListener('click', () => {
    api.skipDraftOnboarding().then((state) => {
      if (state) setSidebarState(state)
    }).catch(() => {})
  })

  titleSyncOnce?.addEventListener('click', () => {
    void applyAskModeTitleSync('once')
  })

  titleSyncAlways?.addEventListener('click', () => {
    void applyAskModeTitleSync('always')
  })

  titleSyncNever?.addEventListener('click', () => {
    void applyAskModeTitleSync('never')
  })

  searchInput?.addEventListener('input', () => {
    const nextQuery = searchInput.value
    const nextState = setSearchQuery(nextQuery)
    const documentKey = getCurrentSearchDocumentKey()
    searchQueryMemory = rememberQueryForDocument(searchQueryMemory, documentKey, nextState.normalizedQuery)
    searchInput.value = nextState.normalizedQuery
    renderSearchPanel(nextState)
  })

  searchInput?.addEventListener('compositionstart', () => {
    searchInputComposing = true
  })

  searchInput?.addEventListener('compositionend', () => {
    searchInputComposing = false
  })

  searchInput?.addEventListener('keydown', (event) => {
    if (searchInputComposing) return

    if (event.key === 'Escape') {
      event.preventDefault()
      closeSearchPanel()
      focusEditorAtLastSelection()
      return
    }

    if (event.key !== 'Enter') return

    event.preventDefault()
    if (event.shiftKey) {
      navigateSearchMatches('previous')
    } else {
      navigateSearchMatches('next')
    }
    if (resolveSearchNavigationFocusMode('input', event.ctrlKey || event.metaKey) === 'editor') {
      focusEditorAtLastSelection()
      return
    }
    focusSearchInputWithoutSelecting()
  })

  searchPrev?.addEventListener('mousedown', (event) => {
    event.preventDefault()
  })

  searchNext?.addEventListener('mousedown', (event) => {
    event.preventDefault()
  })

  searchPrev?.addEventListener('click', () => {
    navigateSearchMatches('previous')
    if (resolveSearchNavigationFocusMode('button', false) === 'editor') {
      focusEditorAtLastSelection()
      return
    }
    focusSearchInputWithoutSelecting()
  })

  searchNext?.addEventListener('click', () => {
    navigateSearchMatches('next')
    if (resolveSearchNavigationFocusMode('button', false) === 'editor') {
      focusEditorAtLastSelection()
      return
    }
    focusSearchInputWithoutSelecting()
  })

  searchClose?.addEventListener('click', () => {
    closeSearchPanel()
    focusEditorAtLastSelection()
  })

  document.addEventListener('keydown', (event) => {
    if (eventMatchesShortcut(event, shortcutFor(appSettings, 'openAiPalette'))) {
      event.preventDefault()
      openAiPalette()
      return
    }

    if (eventMatchesShortcut(event, shortcutFor(appSettings, 'search'))) {
      event.preventDefault()
      openSearchPanel()
      return
    }

    if (eventMatchesShortcut(event, shortcutFor(appSettings, 'toggleOutline'))) {
      event.preventDefault()
      toggleOutlinePanel()
      return
    }

    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'l') {
      event.preventDefault()
      focusEditorAtLastSelection()
      return
    }

    if (event.key === 'Escape' && searchPanelOpen) {
      if (document.activeElement === searchInput && searchInputComposing) return
      event.preventDefault()
      closeSearchPanel()
      focusEditorAtLastSelection()
      return
    }

    if (event.key === 'Escape' && settingsDialog.isOpen()) {
      event.preventDefault()
      settingsDialog.close()
      return
    }

    if (event.key === 'Escape' && titleSyncPromptState) {
      event.preventDefault()
      closeTitleSyncPrompt()
      return
    }

    if (event.key === 'Escape' && aiPaletteOpen) {
      event.preventDefault()
      closeAiPalette()
    }
  })

  document.addEventListener('click', (event) => {
    const target = event.target as HTMLElement | null
    if (!target?.closest('#windows-menu')) closeWindowsMenus()
    if (!target?.closest('#library-create-menu') && !target?.closest('#draft-new')) {
      closeLibraryCreateMenu()
    }
    const pinDraftButton = target?.closest('[data-pin-draft-id]') as HTMLElement | null
    if (pinDraftButton) {
      event.preventDefault()
      event.stopPropagation()
      const draftId = pinDraftButton.dataset.pinDraftId
      if (!draftId) return
      api.togglePinnedDraft(draftId).then((state) => {
        if (state) setSidebarState(state)
      }).catch(() => syncSidebarState())
      return
    }

    const pinFileButton = target?.closest('[data-pin-file-path]') as HTMLElement | null
    if (pinFileButton) {
      event.preventDefault()
      event.stopPropagation()
      const filePath = pinFileButton.dataset.pinFilePath
      if (!filePath) return
      api.togglePinnedFile(filePath).then((state) => {
        if (state) setSidebarState(state)
      }).catch(() => syncSidebarState())
      return
    }

    const removeDraftButton = target?.closest('[data-remove-draft-id]') as HTMLElement | null
    if (removeDraftButton) {
      event.preventDefault()
      event.stopPropagation()
      const draftId = removeDraftButton.dataset.removeDraftId
      if (!draftId || !sidebarState) return
      if (!requestRemoveConfirmation(`draft:${draftId}`)) return
      sidebarState = {
        ...sidebarState,
        draftEntries: sidebarState.draftEntries.filter((entry) => entry.id !== draftId),
      }
      renderSidebar()
      api.removeDraft(draftId).then((state) => {
        if (state) {
          setSidebarState(state)
          return
        }
        syncSidebarState()
      }).catch(() => syncSidebarState())
      return
    }

    const removeRecentButton = target?.closest('[data-remove-recent-path]') as HTMLElement | null
    if (removeRecentButton) {
      event.preventDefault()
      event.stopPropagation()
      const filePath = removeRecentButton.dataset.removeRecentPath
      if (!filePath || !sidebarState) return
      if (!requestRemoveConfirmation(`recent:${filePath}`)) return
      sidebarState = {
        ...sidebarState,
        recentFiles: sidebarState.recentFiles.filter((entry) => entry !== filePath),
      }
      renderSidebar()
      api.removeRecentFile(filePath).then((removed) => {
        if (!removed) syncSidebarState()
      }).catch(() => syncSidebarState())
      return
    }

    const removeWorkdirButton = target?.closest('[data-remove-workdir-path]') as HTMLElement | null
    if (removeWorkdirButton) {
      event.preventDefault()
      event.stopPropagation()
      const filePath = removeWorkdirButton.dataset.removeWorkdirPath
      if (!filePath) return
      if (!requestRemoveConfirmation(`workdir:${filePath}`)) return
      flushAutoSave().then(() => api.removeWorkdirFile(filePath)).then((state) => {
        if (state) {
          setSidebarState(state)
          return
        }
        syncSidebarState()
      }).catch(() => syncSidebarState())
      return
    }

    const removeWorkspaceButton = target?.closest('[data-remove-workspace-path]') as HTMLElement | null
    if (removeWorkspaceButton) {
      event.preventDefault()
      event.stopPropagation()
      const workspacePath = removeWorkspaceButton.dataset.removeWorkspacePath
      if (!workspacePath) return
      if (!requestRemoveConfirmation(`workspace:${workspacePath}`)) return
      api.removeWorkspace(workspacePath).then((state) => {
        if (state) {
          setSidebarState(state)
          return
        }
        syncSidebarState()
      }).catch(() => syncSidebarState())
      return
    }

    if (pendingRemoveActionKey) {
      clearPendingRemoveConfirmation()
      renderSidebar()
    }

    const workdirFolderButton = target?.closest('[data-workdir-folder-path]') as HTMLElement | null
    if (workdirFolderButton) {
      event.preventDefault()
      const folderPath = workdirFolderButton.dataset.workdirFolderPath
      if (!folderPath) return
      const isExpanded = workdirFolderButton.dataset.workdirFolderExpanded === 'true'
      if (isExpanded) {
        expandedWorkdirFolders.delete(folderPath)
        collapsedWorkdirFolders.add(folderPath)
      } else {
        collapsedWorkdirFolders.delete(folderPath)
        expandedWorkdirFolders.add(folderPath)
      }
      renderSidebarPreservingLibraryScroll()
      return
    }

    if (searchPanelOpen && searchPanel && !target?.closest('#search-panel')) {
      closeSearchPanel()
      focusEditorAtLastSelection()
      return
    }

    const workspaceButton = target?.closest('[data-workspace-path]') as HTMLElement | null
    if (workspaceButton) {
      event.preventDefault()
      const workspacePath = workspaceButton.dataset.workspacePath
      if (!workspacePath) return
      api.selectWorkspace(workspacePath).then((state) => {
        if (state) setSidebarState(state)
      }).catch(() => syncSidebarState())
      return
    }

    const draftButton = target?.closest('[data-draft-id]') as HTMLElement | null
    if (draftButton) {
      if (event.detail > 1) return
      const draftId = draftButton.dataset.draftId
      if (draftId) {
        persistCurrentViewportOffset()
        void flushAutoSave().then(() => {
          api.openDraft(draftId).catch(() => {})
        })
      }
      return
    }

    const fileButton = target?.closest('[data-file-path]') as HTMLElement | null
    if (fileButton) {
      if (event.detail > 1) return
      const filePath = fileButton.dataset.filePath
      if (filePath) {
        persistCurrentViewportOffset()
        void flushAutoSave().then(() => {
          api.openSidebarFile(filePath).catch(() => {})
        })
      }
      return
    }

    if (target?.closest('#workdir-empty-action')) {
      api.chooseWorkdir().catch(() => {})
      return
    }
  })

  document.addEventListener('dblclick', (event) => {
    const target = event.target as HTMLElement | null

    const draftButton = target?.closest('[data-draft-id]') as HTMLElement | null
    if (draftButton) {
      const draftId = draftButton.dataset.draftId
      if (!draftId) return
      event.preventDefault()
      const draft = sidebarState?.draftEntries.find((entry) => entry.id === draftId)
      sidebarInlineTitleEdit = {
        kind: 'draft',
        draftId,
        value: draft?.displayTitle ?? '',
      }
      renderSidebar()
      return
    }

    const fileButton = target?.closest('[data-file-path]') as HTMLElement | null
    if (fileButton) {
      const filePath = fileButton.dataset.filePath
      const source = fileButton.dataset.sidebarSource === 'workdir'
        ? 'workdir'
        : fileButton.dataset.sidebarSource === 'pinned'
          ? 'pinned'
          : 'recent'
      if (!filePath) return
      event.preventDefault()
      sidebarInlineTitleEdit = {
        kind: 'file',
        filePath,
        source,
        value: sidebarState?.fileTitleOverrides[filePath] ?? basename(filePath),
      }
      renderSidebar()
    }
  })

  let dragOriginX = 0
  let dragOriginWidth = 0

  const handlePointerMove = (event: PointerEvent): void => {
    if (!sidebarState) return
    event.preventDefault()
    const nextWidth = clampSidebarWidth(dragOriginWidth + (event.clientX - dragOriginX))
    appShell?.style.setProperty('--sidebar-width', `${nextWidth}px`)
  }

  const stopSidebarResize = (): void => {
    window.removeEventListener('pointermove', handlePointerMove)
    window.removeEventListener('pointerup', handlePointerUp)
    window.removeEventListener('pointercancel', stopSidebarResize)
    window.removeEventListener('blur', stopSidebarResize)
    document.body.classList.remove('sidebar-resizing')
  }

  const handlePointerUp = async (event: PointerEvent): Promise<void> => {
    stopSidebarResize()
    if (!sidebarState) return
    const nextWidth = clampSidebarWidth(dragOriginWidth + (event.clientX - dragOriginX))
    await api.setSidebarWidth(nextWidth).catch(() => {})
  }

  sidebarResizer?.addEventListener('pointerdown', (event) => {
    if (!sidebarState?.sidebarOpen || sidebarState.isDrawerMode) return
    event.preventDefault()
    dragOriginX = event.clientX
    dragOriginWidth = sidebarState.sidebarWidth
    document.body.classList.add('sidebar-resizing')
    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
    window.addEventListener('pointercancel', stopSidebarResize)
    window.addEventListener('blur', stopSidebarResize)
  })

  let contextDragOriginX = 0
  let contextDragOriginWidth = 0

  const handleContextPanelPointerMove = (event: PointerEvent): void => {
    contextPanelWidth = clampContextPanelWidth(contextDragOriginWidth + (contextDragOriginX - event.clientX))
    syncContextPanelMetrics()
  }

  const stopContextPanelResize = (): void => {
    window.removeEventListener('pointermove', handleContextPanelPointerMove)
    window.removeEventListener('pointerup', stopContextPanelResize)
    window.removeEventListener('pointercancel', stopContextPanelResize)
    window.removeEventListener('blur', stopContextPanelResize)
  }

  contextPanelResizer?.addEventListener('pointerdown', (event) => {
    if (!appShell?.classList.contains('context-panel-open')) return
    event.preventDefault()
    contextDragOriginX = event.clientX
    contextDragOriginWidth = contextPanelWidth
    window.addEventListener('pointermove', handleContextPanelPointerMove)
    window.addEventListener('pointerup', stopContextPanelResize)
    window.addEventListener('pointercancel', stopContextPanelResize)
    window.addEventListener('blur', stopContextPanelResize)
  })

  let drawerDragOriginY = 0
  let drawerDragOriginHeight = 0

  const handleAgentDrawerPointerMove = (event: PointerEvent): void => {
    agentDrawerHeight = clampAgentDrawerHeight(drawerDragOriginHeight + (drawerDragOriginY - event.clientY))
    syncContextPanelMetrics()
  }

  const stopAgentDrawerResize = (): void => {
    window.removeEventListener('pointermove', handleAgentDrawerPointerMove)
    window.removeEventListener('pointerup', stopAgentDrawerResize)
    window.removeEventListener('pointercancel', stopAgentDrawerResize)
    window.removeEventListener('blur', stopAgentDrawerResize)
  }

  agentDrawerResizer?.addEventListener('pointerdown', (event) => {
    if (!appShell?.classList.contains('agent-drawer-open')) return
    event.preventDefault()
    drawerDragOriginY = event.clientY
    drawerDragOriginHeight = agentDrawerHeight
    window.addEventListener('pointermove', handleAgentDrawerPointerMove)
    window.addEventListener('pointerup', stopAgentDrawerResize)
    window.addEventListener('pointercancel', stopAgentDrawerResize)
    window.addEventListener('blur', stopAgentDrawerResize)
  })

  window.addEventListener('resize', () => {
    refreshAgentPanelPlacement()
    renderContextPanel()
    schedulePlaceholderLayoutSync()
  })
  refreshAgentPanelPlacement()
  renderContextPanel()

  document.addEventListener('dragover', (e) => e.preventDefault())
  document.addEventListener('drop', async (e) => {
    e.preventDefault()
    const target = e.target as HTMLElement | null
    const file = e.dataTransfer?.files[0]
    if (!file) return
    if (target?.closest('#editor') && isSupportedImageFile(file)) {
      const imagePath = await persistImageFile(file)
      if (imagePath) {
        insertImage(imagePath)
        return
      }
    }
    const filePath = api.getPathForFile(file)
    if (!filePath) return
    persistCurrentViewportOffset()
    await flushAutoSave()
    await api.openFilePath(filePath)
  })
}

init().catch((e) => console.error('LyraMD init failed:', e))
