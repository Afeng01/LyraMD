import {
  activateSearchMatch,
  createEditor,
  focusEditorAtLastSelection,
  focusEditorPreservingSelection,
  getHTML,
  getMarkdown,
  isEditorTextFocused,
  getSearchState,
  nextSearchMatch,
  onUserEdit,
  previousSearchMatch,
  setMarkdown,
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
import { createSettingsDialogController } from './settings-dialog'
import { applyTheme, loadSavedTheme } from './themes/theme-manager'
import type { AgentChangePayload, AgentChangePreviewLine, AgentChangeSummary, AppSettings, ShortcutAction, SidebarState } from '../preload/index'
import './themes/base.css'

type TitleEditingAPI = typeof window.electronAPI & {
  updateCurrentDraftTitle?: (nextTitle: string) => Promise<SidebarState | null>
  updateCurrentFileTitle?: (nextTitle: string) => Promise<SidebarState | null>
  updateDraftTitleById?: (draftId: string, nextTitle: string) => Promise<SidebarState | null>
  updateFileTitleByPath?: (filePath: string, nextTitle: string) => Promise<SidebarState | null>
  onMenuSettings?: (callback: () => void) => void
}

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
      cleanCjkTypography: 'CmdOrCtrl+Shift+F',
    },
  }
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

function shortcutFor(settings: AppSettings, action: ShortcutAction): string {
  return settings.shortcuts[action] ?? createDefaultSettings().shortcuts[action]
}

function createFileItem(
  filePath: string,
  title: string,
  meta: string | null,
  currentFilePath: string | null,
  extraClass = '',
  source: 'recent' | 'workdir' = 'recent',
): HTMLButtonElement {
  const item = document.createElement('button')
  item.type = 'button'
  item.className = `sidebar-list-item${extraClass ? ` ${extraClass}` : ''}`
  item.dataset.filePath = filePath
  item.dataset.sidebarSource = source
  item.title = filePath
  item.classList.toggle('active', isSamePath(filePath, currentFilePath))

  item.appendChild(createTextBlock('sidebar-title', title))
  if (meta) item.appendChild(createTextBlock('sidebar-meta', meta))
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
  item.classList.toggle('active', draftId === currentDraftId)
  item.appendChild(createTextBlock('sidebar-title', title))
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
  let appSettings = createDefaultSettings()
  let sidebarState: SidebarState | null = null
  let lastDocumentViewportKey: string | null = null
  let managingDrafts = false
  let managingRecentFiles = false
  let pendingBlankMaterialization = false
  let titleEditActive = false
  let titleEditValue = ''
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
    | { kind: 'file'; filePath: string; source: 'recent' | 'workdir'; value: string }
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
  const savedViewportOffsets = new Map<string, number>()
  let drawerOpenedByHover = false
  let drawerHoverOpenTimer: ReturnType<typeof setTimeout> | null = null
  let drawerHoverCloseTimer: ReturnType<typeof setTimeout> | null = null
  const setSidebarState = (state: SidebarState): void => {
    const nextViewportKey = getDocumentViewportKey(
      state.currentDocumentKind,
      state.currentFilePath,
      state.currentDraftId,
    )
    sidebarState = state
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
    if (state.draftEntries.length === 0) managingDrafts = false
    if (state.recentFiles.length === 0) managingRecentFiles = false
    if (!state.isDrawerMode || !state.sidebarOpen) drawerOpenedByHover = false
    renderSidebar()
    schedulePlaceholderLayoutSync()

    if (!editorShell) {
      lastDocumentViewportKey = nextViewportKey
      return
    }

    if (lastDocumentViewportKey === nextViewportKey) return

    const restoreOffset = nextViewportKey ? savedViewportOffsets.get(nextViewportKey) ?? 0 : 0
    queueMicrotask(() => {
      requestAnimationFrame(() => {
        editorShell.scrollTop = restoreOffset
      })
    })
    lastDocumentViewportKey = nextViewportKey
  }
  activeSidebarStateSetter = setSidebarState
  appSettings = (await api.getSettings().catch(() => null)) ?? createDefaultSettings()
  const savedTheme = appSettings.themeName || loadSavedTheme()
  applyTheme(savedTheme)

  if (savedTheme.startsWith('custom:')) {
    const fileName = savedTheme.slice(7)
    const css = await api.loadThemeCSS(fileName)
    if (css) applyTheme(savedTheme, css)
  }

  const editorShell = document.getElementById('editor-shell') as HTMLElement | null
  const editorStage = document.getElementById('editor-stage') as HTMLElement | null
  const editorPlaceholder = document.getElementById('editor-placeholder') as HTMLDivElement | null
  const titleSyncOverlay = document.getElementById('title-sync-overlay') as HTMLDivElement | null
  const titleSyncCurrentName = document.getElementById('title-sync-current-name') as HTMLSpanElement | null
  const titleSyncNextName = document.getElementById('title-sync-next-name') as HTMLSpanElement | null
  const titleSyncOnce = document.getElementById('title-sync-once') as HTMLButtonElement | null
  const titleSyncAlways = document.getElementById('title-sync-always') as HTMLButtonElement | null
  const titleSyncNever = document.getElementById('title-sync-never') as HTMLButtonElement | null
  const appShell = document.getElementById('app-shell')
  const sidebarToggle = document.getElementById('sidebar-toggle') as HTMLButtonElement | null
  const settingsToggle = document.getElementById('settings-toggle') as HTMLButtonElement | null
  const drawerBackdrop = document.getElementById('sidebar-drawer-backdrop') as HTMLDivElement | null
  const drawerEdgeTrigger = document.getElementById('drawer-edge-trigger') as HTMLDivElement | null
  const drawerShell = document.getElementById('sidebar-drawer-shell') as HTMLDivElement | null
  const onboardingOverlay = document.getElementById('onboarding-overlay') as HTMLDivElement | null
  const onboardingChoose = document.getElementById('onboarding-choose') as HTMLButtonElement | null
  const onboardingSkip = document.getElementById('onboarding-skip') as HTMLButtonElement | null
  const onboardingDirectoryPreview = document.getElementById('onboarding-directory-preview') as HTMLDivElement | null
  const currentFileNew = document.getElementById('current-file-new') as HTMLButtonElement | null
  const draftsToggle = document.getElementById('drafts-toggle') as HTMLButtonElement | null
  const draftsClear = document.getElementById('drafts-clear') as HTMLButtonElement | null
  const recentFilesToggle = document.getElementById('recent-files-toggle') as HTMLButtonElement | null
  const recentFilesClear = document.getElementById('recent-files-clear') as HTMLButtonElement | null
  const workdirToggle = document.getElementById('workdir-toggle') as HTMLButtonElement | null
  const workdirChange = document.getElementById('workdir-change') as HTMLButtonElement | null
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
  const agentChangePanel = document.getElementById('agent-change-panel') as HTMLDivElement | null
  const agentChangeToggle = document.getElementById('agent-change-toggle') as HTMLButtonElement | null
  const agentChangeStats = document.getElementById('agent-change-stats') as HTMLSpanElement | null
  const agentChangeDetails = document.getElementById('agent-change-details') as HTMLDivElement | null
  const agentChangeList = document.getElementById('agent-change-list') as HTMLDivElement | null
  const agentChangeRestore = document.getElementById('agent-change-restore') as HTMLButtonElement | null
  const agentChangeDismiss = document.getElementById('agent-change-dismiss') as HTMLButtonElement | null

  const updateEditorPlaceholder = (content: string): void => {
    if (!editorPlaceholder) return
    editorPlaceholder.hidden = !shouldShowEmptyEditorPlaceholder(content)
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

  if (typeof ResizeObserver !== 'undefined') {
    const placeholderLayoutObserver = new ResizeObserver(() => {
      schedulePlaceholderLayoutSync()
    })
    if (editorShell) placeholderLayoutObserver.observe(editorShell)
    if (appShell) placeholderLayoutObserver.observe(appShell)
  }

  await createEditor('editor', (markdown) => {
    updateEditorPlaceholder(markdown)
    schedulePlaceholderLayoutSync()
  })
  updateEditorPlaceholder(getMarkdown())
  schedulePlaceholderLayoutSync()
  const settingsDialog = createSettingsDialogController({
    api,
    getAppSettings: () => appSettings,
    getSidebarState: () => sidebarState,
    onAppSettingsChange: (settings) => {
      appSettings = settings
    },
    onSidebarStateChange: (state) => {
      setSidebarState(state)
    },
  })

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
    applyProgrammaticDocumentContent(content, scrollTop)
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

    if (editTarget.kind === 'draft') {
      const snapshot = api.updateDraftTitleById
        ? await api.updateDraftTitleById(editTarget.draftId, trimmedTitle).catch(() => null)
        : (
            sidebarState?.currentDocumentKind === 'draft'
            && sidebarState.currentDraftId === editTarget.draftId
            && api.updateCurrentDraftTitle
              ? await api.updateCurrentDraftTitle(trimmedTitle).catch(() => null)
              : null
          )
      if (snapshot) setSidebarState(snapshot)
      else renderSidebar()
      return
    }

    const snapshot = api.updateFileTitleByPath
      ? await api.updateFileTitleByPath(editTarget.filePath, trimmedTitle).catch(() => null)
      : (
          sidebarState?.currentDocumentKind === 'file'
          && sidebarState.currentFilePath === editTarget.filePath
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

  const applyProgrammaticDocumentContent = (content: string, nextScrollTop?: number): void => {
    const shouldRestoreFocus = isEditorTextFocused()
    pendingBlankMaterialization = false
    setMarkdown(content)
    updateEditorPlaceholder(content)
    schedulePlaceholderLayoutSync()
    refreshSearchPanel()

    if (!editorShell) return
    if (typeof nextScrollTop === 'number') {
      requestAnimationFrame(() => {
        editorShell.scrollTop = nextScrollTop
      })
    }

    if (shouldRestoreFocus) {
      requestAnimationFrame(() => {
        focusEditorAtLastSelection()
      })
    }
  }

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

  const getEffectiveDocumentKind = (): SidebarState['currentDocumentKind'] => {
    if (pendingBlankMaterialization) return 'draft'
    return sidebarState?.currentDocumentKind ?? 'blank'
  }

  onUserEdit(() => {
    const markdown = getMarkdown()
    updateEditorPlaceholder(markdown)

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
    applyProgrammaticDocumentContent(previousContent, editorShell?.scrollTop ?? 0)
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

  const renderSidebar = (): void => {
    if (!appShell || !currentFile || !draftsList || !recentFiles || !recentFilesSection || !workdirBody || !workdirSection || !sidebarState) return

    appShell.classList.toggle('sidebar-open', sidebarState.sidebarOpen)
    appShell.classList.toggle('drawer-mode', sidebarState.isDrawerMode)
    appShell.classList.toggle('drawer-open', sidebarState.isDrawerMode && sidebarState.sidebarOpen)
    appShell.style.setProperty('--sidebar-width', `${sidebarState.sidebarWidth}px`)
    draftsSection?.classList.toggle('collapsed', !sidebarState.draftsExpanded)
    recentFilesSection.classList.toggle('collapsed', !sidebarState.recentFilesExpanded)
    workdirSection.classList.toggle('collapsed', !sidebarState.workdirExpanded)
    if (drawerBackdrop) {
      drawerBackdrop.hidden = !(sidebarState.isDrawerMode && sidebarState.sidebarOpen)
      drawerBackdrop.setAttribute('aria-hidden', sidebarState.isDrawerMode && sidebarState.sidebarOpen ? 'false' : 'true')
    }
    if (sidebarResizer) {
      sidebarResizer.hidden = sidebarState.isDrawerMode || !sidebarState.sidebarOpen
    }
    if (onboardingOverlay) {
      onboardingOverlay.hidden = sidebarState.draftOnboardingCompleted
      onboardingOverlay.setAttribute('aria-hidden', sidebarState.draftOnboardingCompleted ? 'true' : 'false')
    }
    if (onboardingDirectoryPreview) {
      onboardingDirectoryPreview.textContent = sidebarState.draftDirectoryPath ?? 'Documents/LyraMD Drafts'
    }

    if (recentFilesClear) {
      recentFilesClear.textContent = managingRecentFiles ? '完成' : '清除'
      recentFilesClear.classList.toggle('active', managingRecentFiles)
      recentFilesClear.disabled = sidebarState.recentFiles.length === 0
    }

    if (draftsClear) {
      draftsClear.textContent = managingDrafts ? '完成' : '清除'
      draftsClear.classList.toggle('active', managingDrafts)
      draftsClear.disabled = sidebarState.draftEntries.length === 0
    }

    clearElement(currentFile)
    currentFile.className = 'sidebar-list-item current-file-item'
    const isEditableTitle = sidebarState.currentDocumentKind !== 'blank'
    currentFile.classList.toggle('editable', isEditableTitle)
    currentFile.classList.toggle('editing', titleEditActive)

    if (titleEditActive && isEditableTitle) {
      const input = document.createElement('input')
      input.type = 'text'
      input.className = 'current-file-title-input'
      input.value = titleEditValue || currentDocumentTitle(sidebarState)
      input.setAttribute('aria-label', '编辑当前文档标题')
      input.addEventListener('click', (event) => {
        event.stopPropagation()
      })
      input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault()
          void commitDocumentTitleChange(input.value)
        } else if (event.key === 'Escape') {
          event.preventDefault()
          titleEditActive = false
          titleEditValue = ''
          renderSidebar()
        }
      })
      input.addEventListener('blur', () => {
        void commitDocumentTitleChange(input.value)
      })
      currentFile.appendChild(input)

      const editMeta = document.createElement('div')
      editMeta.className = 'current-file-edit-meta'
      editMeta.textContent = 'Enter 保存，Esc 取消'
      currentFile.appendChild(editMeta)

      queueMicrotask(() => {
        input.focus()
        input.select()
      })
    } else {
      const titleRow = document.createElement('div')
      titleRow.className = 'current-file-title-row'
      titleRow.appendChild(createTextBlock('sidebar-title', currentDocumentTitle(sidebarState)))
      if (isEditableTitle) {
        const hint = document.createElement('span')
        hint.className = 'current-file-edit-hint'
        hint.textContent = '双击改标题'
        titleRow.appendChild(hint)
      }
      currentFile.appendChild(titleRow)
      currentFile.appendChild(createTextBlock(
        'sidebar-meta',
        currentDocumentMeta(sidebarState),
      ))
    }

    clearElement(draftsList)
    if (sidebarState.draftEntries.length === 0) {
      draftsList.appendChild(createTextBlock('sidebar-empty', '未命名草稿会在开始输入后出现在这里'))
    } else {
      for (const draft of sidebarState.draftEntries) {
        let item: HTMLElement = createDraftItem(draft.id, draft.displayTitle, sidebarState.currentDraftId)
        const isInlineEditing = sidebarInlineTitleEdit?.kind === 'draft' && sidebarInlineTitleEdit.draftId === draft.id
        if (isInlineEditing) {
          item = createSidebarInlineEditor(
            `编辑 ${draft.displayTitle} 的标题`,
            sidebarInlineTitleEdit?.value ?? draft.displayTitle,
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
        if (!managingDrafts) {
          draftsList.appendChild(item)
          continue
        }

        const row = document.createElement('div')
        row.className = 'sidebar-recent-row'
        row.appendChild(item)

        const remove = document.createElement('button')
        remove.type = 'button'
        remove.className = 'recent-remove-button'
        remove.dataset.removeDraftId = draft.id
        remove.setAttribute('data-remove-draft-id', draft.id)
        remove.setAttribute('aria-label', `删除 ${draft.displayTitle}`)
        remove.textContent = '−'
        row.appendChild(remove)
        draftsList.appendChild(row)
      }
    }

    clearElement(recentFiles)
    if (sidebarState.recentFilesExpanded) {
      if (sidebarState.recentFiles.length === 0) {
        recentFiles.appendChild(createTextBlock('sidebar-empty', '还没有最近文件'))
      } else {
        for (const filePath of sidebarState.recentFiles) {
          let item: HTMLElement = createFileItem(
            filePath,
            sidebarState.fileTitleOverrides[filePath] ?? basename(filePath),
            null,
            sidebarState.currentFilePath,
            '',
            'recent',
          )
          const isInlineEditing = sidebarInlineTitleEdit?.kind === 'file'
            && sidebarInlineTitleEdit.filePath === filePath
            && sidebarInlineTitleEdit.source === 'recent'
          if (isInlineEditing) {
            item = createSidebarInlineEditor(
              `编辑 ${basename(filePath)} 的标题`,
              sidebarInlineTitleEdit?.value ?? sidebarState.fileTitleOverrides[filePath] ?? basename(filePath),
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

          if (!managingRecentFiles) {
            recentFiles.appendChild(item)
          } else {
            const row = document.createElement('div')
            row.className = 'sidebar-recent-row'
            row.appendChild(item)

            const remove = document.createElement('button')
            remove.type = 'button'
            remove.className = 'recent-remove-button'
            remove.dataset.removeRecentPath = filePath
            remove.setAttribute('aria-label', `删除 ${basename(filePath)}`)
            remove.textContent = '−'
            remove.addEventListener('click', (event) => {
              event.preventDefault()
              event.stopPropagation()
              if (!sidebarState) return
              sidebarState = {
                ...sidebarState,
                recentFiles: sidebarState.recentFiles.filter((entry) => entry !== filePath),
              }
              if (sidebarState.recentFiles.length === 0) managingRecentFiles = false
              renderSidebar()
              api.removeRecentFile(filePath).then((removed) => {
                if (!removed) syncSidebarState()
              }).catch(() => syncSidebarState())
            })
            row.appendChild(remove)
            recentFiles.appendChild(row)
          }
        }
      }
    }

    if (workdirName) {
      workdirName.textContent = sidebarState.workdirPath ? basename(sidebarState.workdirPath) : ''
      workdirName.title = sidebarState.workdirPath ?? ''
    }

    clearElement(workdirBody)
    if (!sidebarState.workdirPath) {
      const action = document.createElement('button')
      action.type = 'button'
      action.id = 'workdir-empty-action'
      action.className = 'sidebar-empty-action'
      action.textContent = '选择工作目录'
      workdirBody.appendChild(action)
      return
    }

    if (!sidebarState.workdirExpanded) {
      return
    }

    if (sidebarState.workdirEntries.length === 0) {
      renderEmpty(workdirBody, '这个目录里没有 Markdown 文件')
      return
    }

    const workdirList = document.createElement('div')
    workdirList.className = 'sidebar-list'
    for (const entry of sidebarState.workdirEntries) {
      let item: HTMLElement = createFileItem(
        entry.absolutePath,
        sidebarState.fileTitleOverrides[entry.absolutePath] ?? basename(entry.relativePath),
        null,
        sidebarState.currentFilePath,
        'workdir-item',
        'workdir',
      )
      const isInlineEditing = sidebarInlineTitleEdit?.kind === 'file'
        && sidebarInlineTitleEdit.filePath === entry.absolutePath
        && sidebarInlineTitleEdit.source === 'workdir'
      if (isInlineEditing) {
        item = createSidebarInlineEditor(
          `编辑 ${basename(entry.relativePath)} 的标题`,
          sidebarInlineTitleEdit?.value ?? sidebarState.fileTitleOverrides[entry.absolutePath] ?? basename(entry.relativePath),
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
      workdirList.appendChild(item)
    }
    workdirBody.appendChild(workdirList)
  }

  sidebarState = await api.getSidebarState()
  if (sidebarState) renderSidebar()

  api.onMenuOpen(async () => {
    persistCurrentViewportOffset()
    await flushAutoSave()
    await api.openFile()
  })

  api.onMenuSave(() => {
    void flushAutoSave().then(() => {
      const markdown = getMarkdown()
      recordRecentLocalEcho(markdown)
      api.saveFile(markdown).catch(() => {})
    })
  })
  api.onMenuSaveAs(() => {
    void flushAutoSave().then(() => {
      const markdown = getMarkdown()
      recordRecentLocalEcho(markdown)
      api.saveFileAs(markdown, appSettings.saveAsMode).catch(() => {})
    })
  })
  api.onMenuSearch(() => {
    openSearchPanel()
  })
  api.onMenuCleanCjkTypography(() => {
    void flushAutoSave().then(() => {
      const markdown = getMarkdown()
      const nextMarkdown = formatCjkTypography(markdown)
      if (nextMarkdown === markdown) return
      applyProgrammaticDocumentContent(nextMarkdown, editorShell?.scrollTop ?? 0)
      void saveImmediately(nextMarkdown)
    })
  })
  api.onMenuSettings?.(() => {
    closeTitleSyncPrompt()
    settingsDialog.toggle()
  })
  api.onMenuExportPDF(() => api.exportPDF())
  api.onMenuExportHTML(() => {
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
  })
  api.onNewFile(() => {
    resetLocalEchoState()
    clearAgentChangePanel()
    applyProgrammaticDocumentContent('', 0)
  })
  api.onNewFileInWindow(() => {
    beginBlankDocumentFromSidebar()
  })
  api.onFileOpened((data) => {
    resetLocalEchoState()
    clearAgentChangePanel()
    titleEditActive = false
    closeTitleSyncPrompt()
    applyProgrammaticDocumentContent(data.content)
  })
  api.onFileChanged((content) => {
    const currentScrollTop = editorShell?.scrollTop ?? 0
    const agentChangePayload = queuedAgentChangePayload
    queuedAgentChangePayload = null
    processIncomingDocumentContent(content, currentScrollTop, { allowDefer: true, agentChangePayload })
  })
  api.onSetTheme(async (theme) => {
    applyTheme(theme)
    appSettings = (await api.updateSettings({ themeName: theme }).catch(() => null)) ?? {
      ...appSettings,
      themeName: theme,
    }
    settingsDialog.refresh()
  })
  api.onSetCustomCSS((css) => {
    const theme = appSettings.themeName || loadSavedTheme()
    applyTheme(theme, css)
  })

  api.onMenuImportTheme(async () => {
    const result = await api.loadCustomTheme()
    if (!result) return
    const themeName = `custom:${result.name}`
    applyTheme(themeName, result.css)
    appSettings = (await api.updateSettings({ themeName }).catch(() => null)) ?? {
      ...appSettings,
      themeName,
    }
    settingsDialog.refresh()
  })

  const agentDot = document.getElementById('agent-dot')
  api.onAgentActivity((state) => {
    if (agentDot) agentDot.className = state === 'idle' ? '' : state
  })
  api.onAgentChangeSummary((payload) => {
    queuedAgentChangePayload = payload
  })

  api.onSidebarState((state) => {
    setSidebarState(state)
    settingsDialog.refresh()
  })

  sidebarToggle?.addEventListener('click', () => {
    clearDrawerHoverTimers()
    drawerOpenedByHover = false
    api.toggleSidebar().catch(() => {})
  })

  settingsToggle?.addEventListener('click', () => {
    closeTitleSyncPrompt()
    settingsDialog.toggle()
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

  let zoomLevel = 0

  const applyZoom = (): void => {
    const editorShell = document.getElementById('editor-shell')
    if (editorShell) {
      editorShell.style.setProperty('--editor-zoom', String(Math.pow(1.1, zoomLevel)))
    }
    schedulePlaceholderLayoutSync()
  }

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

  currentFileNew?.addEventListener('click', () => {
    beginBlankDocumentFromSidebar()
  })

  currentFile?.addEventListener('dblclick', (event) => {
    event.preventDefault()
    startCurrentTitleEdit()
  })

  draftsToggle?.addEventListener('click', () => {
    api.toggleDraftsExpanded().catch(() => {})
  })

  draftsClear?.addEventListener('click', () => {
    if (!sidebarState?.draftEntries.length) return
    managingDrafts = !managingDrafts
    if (!sidebarState.draftsExpanded) api.toggleDraftsExpanded().catch(() => {})
    renderSidebar()
  })

  recentFilesClear?.addEventListener('click', () => {
    if (!sidebarState?.recentFiles.length) return
    managingRecentFiles = !managingRecentFiles
    if (!sidebarState.recentFilesExpanded) api.toggleRecentFilesExpanded().catch(() => {})
    renderSidebar()
  })

  workdirToggle?.addEventListener('click', () => {
    api.toggleWorkdirExpanded().catch(() => {})
  })

  workdirChange?.addEventListener('click', () => {
    api.chooseWorkdir().catch(() => {})
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
    if (eventMatchesShortcut(event, shortcutFor(appSettings, 'search'))) {
      event.preventDefault()
      openSearchPanel()
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
    }
  })

  document.addEventListener('click', (event) => {
    const target = event.target as HTMLElement | null
    const removeDraftButton = target?.closest('[data-remove-draft-id]') as HTMLElement | null
    if (removeDraftButton) {
      event.preventDefault()
      event.stopPropagation()
      const draftId = removeDraftButton.dataset.removeDraftId
      if (!draftId || !sidebarState) return
      sidebarState = {
        ...sidebarState,
        draftEntries: sidebarState.draftEntries.filter((entry) => entry.id !== draftId),
      }
      if (sidebarState.draftEntries.length === 0) managingDrafts = false
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

    if (searchPanelOpen && searchPanel && !target?.closest('#search-panel')) {
      closeSearchPanel()
      focusEditorAtLastSelection()
      return
    }

    const draftButton = target?.closest('[data-draft-id]') as HTMLElement | null
    if (draftButton) {
      if (event.detail > 1) return
      if (managingDrafts) return
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
      if (managingRecentFiles) return
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
    if (draftButton && !managingDrafts) {
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
    if (fileButton && !managingRecentFiles) {
      const filePath = fileButton.dataset.filePath
      const source = fileButton.dataset.sidebarSource === 'workdir' ? 'workdir' : 'recent'
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
    const nextWidth = clampSidebarWidth(dragOriginWidth + (event.clientX - dragOriginX))
    appShell?.style.setProperty('--sidebar-width', `${nextWidth}px`)
  }

  const handlePointerUp = async (event: PointerEvent): Promise<void> => {
    window.removeEventListener('pointermove', handlePointerMove)
    window.removeEventListener('pointerup', handlePointerUp)
    if (!sidebarState) return
    const nextWidth = clampSidebarWidth(dragOriginWidth + (event.clientX - dragOriginX))
    await api.setSidebarWidth(nextWidth).catch(() => {})
  }

  sidebarResizer?.addEventListener('pointerdown', (event) => {
    if (!sidebarState?.sidebarOpen || sidebarState.isDrawerMode) return
    dragOriginX = event.clientX
    dragOriginWidth = sidebarState.sidebarWidth
    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
  })

  window.addEventListener('resize', () => {
    schedulePlaceholderLayoutSync()
  })

  document.addEventListener('dragover', (e) => e.preventDefault())
  document.addEventListener('drop', async (e) => {
    e.preventDefault()
    const file = e.dataTransfer?.files[0]
    if (!file) return
    const filePath = api.getPathForFile(file)
    if (!filePath) return
    persistCurrentViewportOffset()
    await flushAutoSave()
    await api.openFilePath(filePath)
  })
}

init().catch((e) => console.error('LyraMD init failed:', e))
