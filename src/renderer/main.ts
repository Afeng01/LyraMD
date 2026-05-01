import {
  activateSearchMatch,
  createEditor,
  focusEditorPreservingSelection,
  focusEditorAtLastSelection,
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
import {
  getNearbySearchMatchPreviews,
  type SearchMatchPreview,
  type SearchState,
} from './editor/search'
import {
  consumeQueuedContent,
  recordQueuedContent,
  releaseQueuedContent,
  resolveIncomingContentDecision,
} from './editor/content-sync'
import {
  decideAutosaveBehavior,
  getDocumentViewportKey,
  shouldShowEmptyEditorPlaceholder,
} from './editor/session-ux'
import { createSettingsDialogController } from './settings-dialog'
import { applyTheme, loadSavedTheme } from './themes/theme-manager'
import type { AppSettings, SidebarState } from '../preload/index'
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
  return { titleSyncMode: 'ask', saveAsMode: 'switch' }
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
  const savedTheme = loadSavedTheme()
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

    editorPlaceholder.style.top = `${Math.max(0, anchorRect.top - stageRect.top)}px`
    editorPlaceholder.style.left = `${Math.max(0, proseRect.left - stageRect.left)}px`
    editorPlaceholder.style.width = `${proseRect.width}px`
  }

  const schedulePlaceholderLayoutSync = (): void => {
    requestAnimationFrame(() => {
      syncEditorPlaceholderLayout()
    })
  }

  await createEditor('editor', (markdown) => {
    updateEditorPlaceholder(markdown)
    schedulePlaceholderLayoutSync()
  })
  updateEditorPlaceholder(getMarkdown())
  schedulePlaceholderLayoutSync()
  appSettings = (await api.getSettings().catch(() => null)) ?? createDefaultSettings()
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

  let autoSaveTimer: ReturnType<typeof setTimeout> | null = null
  let dirtyByUser = false
  let immediateSaveInFlight = false
  let pendingImmediateSaveContent: string | null = null
  let immediateSavePromise: Promise<void> | null = null
  let deferredIncomingContent: { content: string; scrollTop: number } | null = null
  const recentLocalEchoes = new Map<string, number>()

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

  const clearPendingAutoSave = (): void => {
    if (autoSaveTimer) {
      clearTimeout(autoSaveTimer)
      autoSaveTimer = null
    }
    dirtyByUser = false
  }

  const processIncomingDocumentContent = (
    content: string,
    scrollTop: number,
    options: { allowDefer: boolean },
  ): void => {
    const decision = resolveIncomingContentDecision({
      currentContent: getMarkdown(),
      incomingContent: content,
      hasPendingLocalSave: options.allowDefer && hasPendingImmediateSave(),
      isKnownLocalEcho: consumeQueuedContent(recentLocalEchoes, content),
    })

    if (decision === 'ignore') return

    if (decision === 'defer') {
      deferredIncomingContent = { content, scrollTop }
      return
    }

    deferredIncomingContent = null
    applyProgrammaticDocumentContent(content, scrollTop)
  }

  const flushDeferredIncomingContent = (): void => {
    if (!deferredIncomingContent || hasPendingImmediateSave()) return

    const { content, scrollTop } = deferredIncomingContent
    deferredIncomingContent = null
    processIncomingDocumentContent(content, scrollTop, { allowDefer: false })
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
    if (autoSaveTimer) {
      clearTimeout(autoSaveTimer)
      autoSaveTimer = null
    }
    if (dirtyByUser) {
      dirtyByUser = false
      await api.autosaveDocument(getMarkdown()).catch(() => null)
      syncSidebarState()
    }
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

  const scheduleAutoSave = (): void => {
    if (autoSaveTimer) clearTimeout(autoSaveTimer)
    dirtyByUser = true
    autoSaveTimer = setTimeout(() => {
      void flushAutoSave()
    }, 3000)
  }

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
  const searchOverlay = document.getElementById('search-overlay') as HTMLDivElement | null
  const searchInput = document.getElementById('search-input') as HTMLInputElement | null
  const searchCount = document.getElementById('search-count') as HTMLDivElement | null
  const searchLocate = document.getElementById('search-locate') as HTMLButtonElement | null
  const searchContext = document.getElementById('search-context') as HTMLDivElement | null
  const searchPrev = document.getElementById('search-prev') as HTMLButtonElement | null
  const searchNext = document.getElementById('search-next') as HTMLButtonElement | null
  const searchResultsToggle = document.getElementById('search-results-toggle') as HTMLButtonElement | null
  const searchResults = document.getElementById('search-results') as HTMLDivElement | null

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
    clearPendingAutoSave()
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

    if (decision.clearPending) {
      clearPendingAutoSave()
    }

    if (decision.materializeDraftImmediately) {
      pendingBlankMaterialization = true
      dirtyByUser = false
      void saveImmediately(markdown).catch(() => {
        pendingBlankMaterialization = false
      })
      return
    }

    if (decision.persistImmediately) {
      clearPendingAutoSave()
      void saveImmediately(markdown)
      return
    }

    if (decision.scheduleDebouncedSave) {
      scheduleAutoSave()
    }
  })

  editorShell?.addEventListener('scroll', () => {
    persistCurrentViewportOffset()
  }, { passive: true })

  let searchPanelOpen = false
  let searchResultsExpanded = false

  const jumpToActiveSearchMatch = (): void => {
    const state = getSearchState()
    if (state.totalMatches === 0 || state.activeIndex < 0) return

    activateSearchMatch(state.activeIndex)
    refreshSearchPanel()
    focusEditorPreservingSelection()
  }

  const renderSearchContextPreview = (
    container: HTMLDivElement,
    match: SearchMatchPreview,
  ): void => {
    clearElement(container)

    const previousLine = document.createElement('div')
    previousLine.className = 'search-context-line muted'
    previousLine.textContent = match.previousLine || ' '
    container.appendChild(previousLine)

    const currentLine = document.createElement('div')
    currentLine.className = 'search-context-line active'
    currentLine.appendChild(document.createTextNode(match.before))

    const hit = document.createElement('mark')
    hit.className = 'search-context-hit'
    hit.textContent = match.match
    currentLine.appendChild(hit)
    currentLine.appendChild(document.createTextNode(match.after))
    container.appendChild(currentLine)

    const nextLine = document.createElement('div')
    nextLine.className = 'search-context-line muted'
    nextLine.textContent = match.nextLine || ' '
    container.appendChild(nextLine)
  }

  const renderSearchPanel = (state: SearchState): void => {
    if (!searchCount || !searchContext || !searchPrev || !searchNext || !searchResultsToggle || !searchResults) return

    const activeNumber = state.totalMatches > 0 && state.activeIndex >= 0 ? state.activeIndex + 1 : 0
    const nearbyMatches = getNearbySearchMatchPreviews(state)
    searchCount.textContent = `${activeNumber} / ${state.totalMatches}`
    if (searchLocate) {
      searchLocate.disabled = state.totalMatches === 0
    }
    searchPrev.disabled = state.totalMatches === 0
    searchNext.disabled = state.totalMatches === 0
    searchResultsToggle.disabled = state.totalMatches === 0
    searchResultsToggle.textContent = searchResultsExpanded ? '收起附近结果' : '附近结果'

    const activeMatch = state.matches[state.activeIndex] ?? null
    if (!state.normalizedQuery) {
      searchContext.textContent = '输入关键词后，这里会显示当前命中的上一行、当前行和下一行。'
    } else if (!activeMatch) {
      searchContext.textContent = '没有找到匹配内容。'
    } else {
      renderSearchContextPreview(searchContext, activeMatch)
    }

    clearElement(searchResults)
    if (searchResultsExpanded && state.matches.length > 0) {
      for (const match of nearbyMatches) {
        const item = document.createElement('button')
        item.type = 'button'
        item.className = 'search-result-item'
        item.dataset.matchIndex = String(match.index)
        item.disabled = match.index === state.activeIndex

        const badge = document.createElement('span')
        badge.className = 'search-result-badge'
        badge.textContent = `${match.index + 1} / ${state.totalMatches}`
        item.appendChild(badge)

        const text = document.createElement('span')
        text.className = 'search-result-text'
        const previousLine = match.previousLine ? `${match.previousLine} / ` : ''
        const nextLine = match.nextLine ? ` / ${match.nextLine}` : ''
        text.textContent = `${previousLine}${match.before}${match.match}${match.after}${nextLine}`.trim()
        item.appendChild(text)

        item.disabled = match.index === state.activeIndex
        searchResults.appendChild(item)
      }

      if (state.totalMatches > nearbyMatches.length) {
        const summary = document.createElement('div')
        summary.className = 'search-results-summary'
        summary.textContent = `仅显示当前命中附近的 ${nearbyMatches.length} 条结果`
        searchResults.appendChild(summary)
      }
    }
    searchResults.hidden = !searchResultsExpanded || state.matches.length === 0
  }

  const refreshSearchPanel = (): void => {
    renderSearchPanel(getSearchState())
  }

  const openSearchPanel = (): void => {
    searchPanelOpen = true
    if (searchOverlay) {
      searchOverlay.hidden = false
      searchOverlay.setAttribute('aria-hidden', 'false')
    }
    if (searchPanel) {
      searchPanel.hidden = false
      searchPanel.setAttribute('aria-hidden', 'false')
    }
    refreshSearchPanel()
    searchInput?.focus()
    searchInput?.select()
  }

  const closeSearchPanel = (): void => {
    searchPanelOpen = false
    searchResultsExpanded = false
    if (searchOverlay) {
      searchOverlay.hidden = true
      searchOverlay.setAttribute('aria-hidden', 'true')
    }
    if (searchPanel) {
      searchPanel.hidden = true
      searchPanel.setAttribute('aria-hidden', 'true')
    }
    if (searchResults) {
      searchResults.hidden = true
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
    applyProgrammaticDocumentContent('', 0)
  })
  api.onNewFileInWindow(() => {
    beginBlankDocumentFromSidebar()
  })
  api.onFileOpened((data) => {
    resetLocalEchoState()
    titleEditActive = false
    closeTitleSyncPrompt()
    applyProgrammaticDocumentContent(data.content)
  })
  api.onFileChanged((content) => {
    const currentScrollTop = editorShell?.scrollTop ?? 0
    processIncomingDocumentContent(content, currentScrollTop, { allowDefer: true })
  })
  api.onSetTheme((theme) => applyTheme(theme))
  api.onSetCustomCSS((css) => {
    const theme = loadSavedTheme()
    applyTheme(theme, css)
  })

  api.onMenuImportTheme(async () => {
    const result = await api.loadCustomTheme()
    if (result) applyTheme(`custom:${result.name}`, result.css)
  })

  const agentDot = document.getElementById('agent-dot')
  api.onAgentActivity((state) => {
    if (agentDot) agentDot.className = state === 'idle' ? '' : state
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
    setSearchQuery(searchInput.value)
    refreshSearchPanel()
  })

  searchInput?.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return

    event.preventDefault()
    if (event.shiftKey) {
      previousSearchMatch()
    } else {
      nextSearchMatch()
    }
    refreshSearchPanel()
  })

  searchPrev?.addEventListener('click', () => {
    previousSearchMatch()
    refreshSearchPanel()
    focusEditorPreservingSelection()
  })

  searchNext?.addEventListener('click', () => {
    nextSearchMatch()
    refreshSearchPanel()
    focusEditorPreservingSelection()
  })

  searchResultsToggle?.addEventListener('click', () => {
    searchResultsExpanded = !searchResultsExpanded
    refreshSearchPanel()
  })

  searchLocate?.addEventListener('click', () => {
    jumpToActiveSearchMatch()
  })

  searchOverlay?.addEventListener('click', () => {
    if (!searchPanelOpen) return
    closeSearchPanel()
    focusEditorAtLastSelection()
  })

  document.addEventListener('keydown', (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'f') {
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

    const searchResultButton = target?.closest('[data-match-index]') as HTMLElement | null
    if (searchResultButton) {
      const nextIndex = Number.parseInt(searchResultButton.dataset.matchIndex ?? '', 10)
      if (Number.isInteger(nextIndex)) {
        activateSearchMatch(nextIndex)
        refreshSearchPanel()
        focusEditorPreservingSelection()
      }
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
