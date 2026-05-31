import type { AiHelperProviderSettings, AiHelperSettings, AiPromptTemplate, AppSettings, BackgroundMode, BackgroundScope, BackgroundSettings, CodexIntegrationStatus, EditorFontPreset, ElectronAPI, FontSettings, SaveAsMode, ShortcutAction, SidebarState, TitleSyncMode } from '../preload/index'
import { applyTheme } from './themes/theme-manager'

const BUILT_IN_THEMES = [
  { id: 'elegant', label: 'Elegant' },
  { id: 'newsprint', label: 'Newsprint' },
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
] as const

const DEFAULT_BACKGROUND_SETTINGS: BackgroundSettings = {
  mode: 'default',
  scope: 'editor',
  color: '#ffffff',
  imagePath: null,
  opacity: 1,
  blur: 0,
  dim: 0.18,
}

const DEFAULT_FONT_SETTINGS: FontSettings = {
  preset: 'theme',
  customFamily: '',
}

const DEFAULT_AI_PROMPT_TEMPLATES: AiPromptTemplate[] = [
  {
    id: 'polish',
    title: '润色',
    prompt: '请润色下面这段文字，保持原意，不要额外解释：\n\n{{selection}}',
  },
  {
    id: 'expand',
    title: '扩写',
    prompt: '请基于下面这段文字继续扩写，保持语气自然：\n\n{{selection}}',
  },
  {
    id: 'summarize',
    title: '总结',
    prompt: '请把下面这段文字总结成简洁要点：\n\n{{selection}}',
  },
]

const DEFAULT_AI_HELPER_SETTINGS: AiHelperSettings = {
  provider: {
    type: 'openai-compatible',
    baseUrl: 'https://api.openai.com/v1',
    apiKey: '',
    model: 'gpt-4.1-mini',
    temperature: 0.7,
  },
  templates: DEFAULT_AI_PROMPT_TEMPLATES,
}

function getThemeSummary(themeName: string): string {
  if (themeName.startsWith('custom:')) {
    return `自定义主题 · ${themeName.slice(7)}`
  }

  const builtin = BUILT_IN_THEMES.find((theme) => theme.id === themeName)
  return builtin ? `当前主题 · ${builtin.label}` : `当前主题 · ${themeName}`
}

function formatShortcutLabel(accelerator: string): string {
  return accelerator.replace('CmdOrCtrl', 'Cmd/Ctrl')
}

function normalizeRecordedKey(key: string): string {
  if (key === ' ') return 'Space'
  if (key === 'Escape') return 'Esc'
  if (key.length === 1) return key.toUpperCase()
  return key
}

function formatDisplayPath(path: string): string {
  const homePrefix = '/Users/'
  if (!path.startsWith(homePrefix)) return path

  const [, , ...rest] = path.split('/')
  return rest.length > 0 ? `~/${rest.join('/')}` : path
}

function clampNumber(value: string, fallback: number, min: number, max: number): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, parsed))
}

function isBackgroundScope(value: string): value is BackgroundScope {
  return value === 'editor' || value === 'window'
}

function isBackgroundMode(value: string): value is BackgroundMode {
  return value === 'default' || value === 'color' || value === 'image'
}

function isEditorFontPreset(value: string): value is EditorFontPreset {
  return value === 'theme'
    || value === 'elegant'
    || value === 'sans'
    || value === 'serif'
    || value === 'mono'
    || value === 'custom'
}

const SHORTCUT_ACTION_LABELS: Record<ShortcutAction, string> = {
  save: '保存',
  saveAs: '另存为',
  settings: '打开设置',
  search: '搜索',
  toggleSidebar: '切换侧边栏',
  toggleOutline: '打开大纲',
  cleanCjkTypography: '清理中英排版',
  openAiPalette: '打开 AI 精灵',
}

export function resolveShortcutConflict(
  shortcuts: Record<ShortcutAction, string>,
  action: ShortcutAction,
  accelerator: string,
): ShortcutAction | null {
  const conflict = Object.entries(shortcuts).find(([candidateAction, candidateAccelerator]) => (
    candidateAction !== action && candidateAccelerator === accelerator
  ))
  return (conflict?.[0] as ShortcutAction | undefined) ?? null
}

export interface SettingsDialogController {
  close: () => void
  isOpen: () => boolean
  open: () => void
  refresh: () => void
  toggle: () => void
}

export function initSettingsDialogDrag(
  overlay: HTMLElement | null,
  dialog: HTMLElement | null,
  handle: HTMLElement | null,
): void {
  if (!overlay || !dialog || !handle) return

  let offsetX = 0
  let offsetY = 0

  const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value))

  const handlePointerMove = (event: PointerEvent): void => {
    const overlayRect = overlay.getBoundingClientRect()
    const maxLeft = Math.max(0, overlayRect.width - dialog.offsetWidth)
    const maxTop = Math.max(0, overlayRect.height - dialog.offsetHeight)
    dialog.style.left = `${clamp(event.clientX - overlayRect.left - offsetX, 0, maxLeft)}px`
    dialog.style.top = `${clamp(event.clientY - overlayRect.top - offsetY, 0, maxTop)}px`
  }

  const stopDrag = (): void => {
    window.removeEventListener('pointermove', handlePointerMove)
    window.removeEventListener('pointerup', stopDrag)
    window.removeEventListener('pointercancel', stopDrag)
  }

  handle.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return
    const target = event.target as HTMLElement | null
    if (target?.closest('button')) return
    const overlayRect = overlay.getBoundingClientRect()
    const dialogRect = dialog.getBoundingClientRect()
    offsetX = event.clientX - dialogRect.left
    offsetY = event.clientY - dialogRect.top
    dialog.style.position = 'absolute'
    dialog.style.left = `${dialogRect.left - overlayRect.left}px`
    dialog.style.top = `${dialogRect.top - overlayRect.top}px`
    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', stopDrag)
    window.addEventListener('pointercancel', stopDrag)
  })
}

interface CreateSettingsDialogControllerOptions {
  api: ElectronAPI
  getAppSettings: () => AppSettings
  getSidebarState: () => SidebarState | null
  onAppSettingsChange: (settings: AppSettings) => void
  onSidebarStateChange: (state: SidebarState) => void
}

type SettingsPaneId = 'general' | 'workspace' | 'shortcuts' | 'integrations'

const SETTINGS_PANE_META: Record<
  SettingsPaneId,
  { description: string; kicker: string; title: string }
> = {
  general: {
    description: '决定标题和文件名如何一起工作，以及另存为后的切换方式。',
    kicker: '基础',
    title: '编辑器行为',
  },
  workspace: {
    description: '管理草稿落点与视觉主题，让编辑器保持稳定且顺手。',
    kicker: '基础',
    title: '文件与外观',
  },
  shortcuts: {
    description: '把最常用的动作收拢成一页速查，减少在菜单里来回寻找。',
    kicker: '快捷键',
    title: '键盘操作',
  },
  integrations: {
    description: '配置 AI 助手、MCP bridge 和后续终端能力。',
    kicker: '进阶',
    title: '集成与终端',
  },
}

export function createSettingsDialogController({
  api,
  getAppSettings,
  getSidebarState,
  onAppSettingsChange,
  onSidebarStateChange,
}: CreateSettingsDialogControllerOptions): SettingsDialogController {
  const overlay = document.getElementById('settings-overlay') as HTMLDivElement | null
  const dialog = document.getElementById('settings-dialog') as HTMLDivElement | null
  const topBar = document.querySelector<HTMLElement>('.settings-top-bar')
  const closeButton = document.getElementById('settings-close') as HTMLButtonElement | null
  const draftPreview = document.getElementById('settings-draft-preview') as HTMLDivElement | null
  const draftChooseButton = document.getElementById('settings-draft-choose') as HTMLButtonElement | null
  const paneDescription = document.getElementById('settings-pane-description') as HTMLParagraphElement | null
  const paneKicker = document.getElementById('settings-pane-kicker') as HTMLParagraphElement | null
  const paneTitle = document.getElementById('settings-pane-title') as HTMLHeadingElement | null
  const panePanels = Array.from(
    document.querySelectorAll<HTMLElement>('[data-settings-panel]'),
  )
  const paneTabs = Array.from(
    document.querySelectorAll<HTMLButtonElement>('[data-settings-pane]'),
  )
  const themeSummary = document.getElementById('settings-theme-summary') as HTMLDivElement | null
  const importThemeButton = document.getElementById('settings-theme-import') as HTMLButtonElement | null
  const themeButtons = Array.from(
    document.querySelectorAll<HTMLButtonElement>('[data-settings-theme]'),
  )
  const titleSyncInputs = Array.from(
    document.querySelectorAll<HTMLInputElement>('input[name="settings-title-sync-mode"]'),
  )
  const saveAsInputs = Array.from(
    document.querySelectorAll<HTMLInputElement>('input[name="settings-save-as-mode"]'),
  )
  const backgroundScopeInputs = Array.from(
    document.querySelectorAll<HTMLInputElement>('input[name="settings-background-scope"]'),
  )
  const backgroundModeInputs = Array.from(
    document.querySelectorAll<HTMLInputElement>('input[name="settings-background-mode"]'),
  )
  const backgroundColorInput = document.getElementById('settings-background-color') as HTMLInputElement | null
  const backgroundImagePathInput = document.getElementById('settings-background-image-path') as HTMLInputElement | null
  const backgroundOpacityInput = document.getElementById('settings-background-opacity') as HTMLInputElement | null
  const backgroundBlurInput = document.getElementById('settings-background-blur') as HTMLInputElement | null
  const backgroundDimInput = document.getElementById('settings-background-dim') as HTMLInputElement | null
  const backgroundResetButton = document.getElementById('settings-background-reset') as HTMLButtonElement | null
  const fontPresetSelect = document.getElementById('settings-font-preset') as HTMLSelectElement | null
  const fontCustomInput = document.getElementById('settings-font-custom') as HTMLInputElement | null
  const aiTemplateButtons = Array.from(
    document.querySelectorAll<HTMLButtonElement>('[data-settings-ai-template]'),
  )
  const aiTemplatePrompt = document.getElementById('settings-ai-template-prompt') as HTMLTextAreaElement | null
  const aiBaseUrlInput = document.getElementById('settings-ai-base-url') as HTMLInputElement | null
  const aiApiKeyInput = document.getElementById('settings-ai-api-key') as HTMLInputElement | null
  const aiModelInput = document.getElementById('settings-ai-model') as HTMLInputElement | null
  const aiTemperatureInput = document.getElementById('settings-ai-temperature') as HTMLInputElement | null
  const shortcutKeys = Array.from(
    document.querySelectorAll<HTMLElement>('[data-shortcut-action]'),
  )
  const shortcutConflict = document.getElementById('settings-shortcut-conflict') as HTMLDivElement | null
  const codexStatusBadge = document.getElementById('settings-codex-status-badge') as HTMLSpanElement | null
  const codexSummary = document.getElementById('settings-codex-summary') as HTMLDivElement | null
  const codexPath = document.getElementById('settings-codex-path') as HTMLDivElement | null
  const codexError = document.getElementById('settings-codex-error') as HTMLDivElement | null
  const codexRefreshButton = document.getElementById('settings-codex-refresh') as HTMLButtonElement | null
  const codexInstallButton = document.getElementById('settings-codex-install') as HTMLButtonElement | null
  const codexRemoveButton = document.getElementById('settings-codex-remove') as HTMLButtonElement | null

  let dialogOpen = false
  let activePane: SettingsPaneId = 'general'
  let recordingShortcut: HTMLElement | null = null
  let codexStatus: CodexIntegrationStatus | null = null
  let codexLoading = false
  let activeAiTemplateId = 'polish'

  initSettingsDialogDrag(overlay, dialog, topBar)

  const renderPane = (): void => {
    const meta = SETTINGS_PANE_META[activePane]

    if (paneKicker) paneKicker.textContent = meta.kicker
    if (paneTitle) paneTitle.textContent = meta.title
    if (paneDescription) paneDescription.textContent = meta.description

    for (const tab of paneTabs) {
      const isActive = tab.dataset.settingsPane === activePane
      tab.classList.toggle('active', isActive)
      tab.setAttribute('aria-pressed', isActive ? 'true' : 'false')
    }

    for (const panel of panePanels) {
      const isActive = panel.dataset.settingsPanel === activePane
      panel.hidden = !isActive
      panel.classList.toggle('active', isActive)
    }
  }

  const stopRecording = (): void => {
    if (recordingShortcut) {
      recordingShortcut.classList.remove('recording')
      recordingShortcut = null
    }
  }

  const clearShortcutConflict = (): void => {
    if (!shortcutConflict) return
    shortcutConflict.hidden = true
    shortcutConflict.textContent = ''
  }

  const showShortcutConflict = (action: ShortcutAction): void => {
    if (!shortcutConflict) return
    shortcutConflict.hidden = false
    shortcutConflict.textContent = `这个快捷键已经被「${SHORTCUT_ACTION_LABELS[action]}」使用`
  }

  const formatKeyCombo = (event: KeyboardEvent): string | null => {
    const parts: string[] = []
    if (event.metaKey || event.ctrlKey) parts.push('CmdOrCtrl')
    if (event.shiftKey) parts.push('Shift')
    if (event.altKey) parts.push('Alt')

    const key = normalizeRecordedKey(event.key)
    if (!['Control', 'Shift', 'Alt', 'Meta'].includes(key)) {
      parts.push(key)
    }

    return parts.length > 1 ? parts.join('+') : null
  }

  const render = (): void => {
    const appSettings = getAppSettings()
    const sidebarState = getSidebarState()
    const activeTheme = appSettings.themeName

    for (const input of titleSyncInputs) {
      input.checked = input.value === appSettings.titleSyncMode
    }

    for (const input of saveAsInputs) {
      input.checked = input.value === appSettings.saveAsMode
    }

    if (draftPreview) {
      draftPreview.textContent = sidebarState?.draftDirectoryPath ?? 'Documents/LyraMD Drafts'
    }

    if (themeSummary) {
      themeSummary.textContent = getThemeSummary(activeTheme)
    }

    for (const button of themeButtons) {
      button.classList.toggle('active', button.dataset.settingsTheme === activeTheme)
    }

    for (const input of backgroundScopeInputs) {
      input.checked = input.value === appSettings.background.scope
    }

    for (const input of backgroundModeInputs) {
      input.checked = input.value === appSettings.background.mode
    }

    if (backgroundColorInput) backgroundColorInput.value = appSettings.background.color
    if (backgroundImagePathInput) backgroundImagePathInput.value = appSettings.background.imagePath ?? ''
    if (backgroundOpacityInput) backgroundOpacityInput.value = String(appSettings.background.opacity)
    if (backgroundBlurInput) backgroundBlurInput.value = String(appSettings.background.blur)
    if (backgroundDimInput) backgroundDimInput.value = String(appSettings.background.dim)

    const font = appSettings.font ?? DEFAULT_FONT_SETTINGS
    if (fontPresetSelect) fontPresetSelect.value = font.preset
    if (fontCustomInput) {
      fontCustomInput.value = font.customFamily
      fontCustomInput.disabled = font.preset !== 'custom'
    }

    const aiHelper = appSettings.aiHelper ?? DEFAULT_AI_HELPER_SETTINGS
    const aiProvider = aiHelper.provider ?? DEFAULT_AI_HELPER_SETTINGS.provider
    if (aiBaseUrlInput) aiBaseUrlInput.value = aiProvider.baseUrl
    if (aiApiKeyInput) aiApiKeyInput.value = aiProvider.apiKey
    if (aiModelInput) aiModelInput.value = aiProvider.model
    if (aiTemperatureInput) aiTemperatureInput.value = String(aiProvider.temperature)
    const activeAiTemplate = aiHelper.templates.find((template) => template.id === activeAiTemplateId)
      ?? aiHelper.templates[0]
      ?? DEFAULT_AI_PROMPT_TEMPLATES[0]
    if (activeAiTemplate) {
      activeAiTemplateId = activeAiTemplate.id
      if (aiTemplatePrompt) aiTemplatePrompt.value = activeAiTemplate.prompt
    }
    for (const button of aiTemplateButtons) {
      button.classList.toggle('active', button.dataset.settingsAiTemplate === activeAiTemplateId)
    }

    for (const key of shortcutKeys) {
      const action = key.dataset.shortcutAction as ShortcutAction | undefined
      if (!action) continue
      key.textContent = formatShortcutLabel(appSettings.shortcuts[action])
    }

    renderCodexIntegration()
    renderPane()
  }

  const renderCodexIntegration = (): void => {
    if (!codexStatusBadge || !codexSummary || !codexPath || !codexError || !codexInstallButton || !codexRemoveButton || !codexRefreshButton) {
      return
    }

    codexRefreshButton.disabled = codexLoading
    codexInstallButton.disabled = codexLoading || !codexStatus?.codexInstalled
    codexRemoveButton.disabled = codexLoading

    codexStatusBadge.classList.remove('ready', 'warning')
    if (codexLoading) {
      codexStatusBadge.textContent = '处理中'
      codexSummary.textContent = '正在更新 Codex MCP 配置。'
      return
    }

    if (!codexStatus) {
      codexStatusBadge.textContent = '未检测'
      codexSummary.textContent = '点击检测以读取 Codex CLI 和本地 MCP bridge 状态。'
      codexPath.textContent = ''
      codexPath.title = ''
      codexError.hidden = true
      codexError.textContent = ''
      codexRemoveButton.hidden = true
      codexInstallButton.hidden = false
      return
    }

    codexStatusBadge.textContent = codexStatus.codexMcpConfigured
      ? (codexStatus.bridgeRunning ? '已连接' : '已配置')
      : '未配置'
    codexStatusBadge.classList.add(codexStatus.codexMcpConfigured ? 'ready' : 'warning')
    codexSummary.textContent = codexStatus.codexInstalled
      ? `Codex CLI ${codexStatus.version ?? ''}${codexStatus.bridgeRunning ? '，bridge 运行中' : '，bridge 未启动'}`
      : '未检测到 Codex CLI。请先安装并登录 Codex CLI。'
    codexPath.textContent = `配置：${formatDisplayPath(codexStatus.codexConfigPath)}`
    codexPath.title = codexStatus.codexConfigPath
    codexError.hidden = !codexStatus.error
    codexError.textContent = codexStatus.error ?? ''
    codexRemoveButton.hidden = !codexStatus.codexMcpConfigured
    codexInstallButton.hidden = codexStatus.codexMcpConfigured
  }

  const loadCodexStatus = async (): Promise<void> => {
    codexLoading = true
    renderCodexIntegration()
    codexStatus = await api.getCodexIntegrationStatus().catch(() => null)
    codexLoading = false
    renderCodexIntegration()
  }

  const installCodexIntegration = async (): Promise<void> => {
    codexLoading = true
    renderCodexIntegration()
    codexStatus = await api.installCodexIntegration().catch(() => null)
    codexLoading = false
    renderCodexIntegration()
  }

  const removeCodexIntegration = async (): Promise<void> => {
    codexLoading = true
    renderCodexIntegration()
    codexStatus = await api.removeCodexIntegration().catch(() => null)
    codexLoading = false
    renderCodexIntegration()
  }

  const open = (): void => {
    dialogOpen = true
    clearShortcutConflict()
    render()
    void loadCodexStatus()
    if (!overlay) return
    overlay.hidden = false
    overlay.setAttribute('aria-hidden', 'false')
    queueMicrotask(() => {
      closeButton?.focus()
    })
  }

  const close = (): void => {
    dialogOpen = false
    stopRecording()
    clearShortcutConflict()
    if (!overlay) return
    overlay.hidden = true
    overlay.setAttribute('aria-hidden', 'true')
  }

  const toggle = (): void => {
    if (dialogOpen) {
      close()
      return
    }
    open()
  }

  const updateTitleSyncMode = async (mode: TitleSyncMode): Promise<void> => {
    const current = getAppSettings()
    const next = (await api.updateSettings({ titleSyncMode: mode }).catch(() => null)) ?? {
      ...current,
      titleSyncMode: mode,
    }
    onAppSettingsChange(next)
    render()
  }

  const updateSaveAsMode = async (mode: SaveAsMode): Promise<void> => {
    const current = getAppSettings()
    const next = (await api.updateSettings({ saveAsMode: mode }).catch(() => null)) ?? {
      ...current,
      saveAsMode: mode,
    }
    onAppSettingsChange(next)
    render()
  }

  const updateBackgroundSettings = async (patch: Partial<BackgroundSettings>): Promise<void> => {
    const current = getAppSettings()
    const background = {
      ...current.background,
      ...patch,
    }
    const next = (await api.updateSettings({ background }).catch(() => null)) ?? {
      ...current,
      background,
    }
    onAppSettingsChange(next)
    render()
  }

  const updateFontSettings = async (patch: Partial<FontSettings>): Promise<void> => {
    const current = getAppSettings()
    const font = {
      ...(current.font ?? DEFAULT_FONT_SETTINGS),
      ...patch,
    }
    const next = (await api.updateSettings({ font: font }).catch(() => null)) ?? {
      ...current,
      font,
    }
    onAppSettingsChange(next)
    render()
  }

  const updateAiHelperSettings = async (aiHelper: AiHelperSettings): Promise<void> => {
    const current = getAppSettings()
    const next = (await api.updateSettings({ aiHelper }).catch(() => null)) ?? {
      ...current,
      aiHelper,
    }
    onAppSettingsChange(next)
    render()
  }

  const updateAiHelperProviderSettings = async (patch: Partial<AiHelperProviderSettings>): Promise<void> => {
    const current = getAppSettings()
    const currentAiHelper = current.aiHelper ?? DEFAULT_AI_HELPER_SETTINGS
    await updateAiHelperSettings({
      ...currentAiHelper,
      provider: {
        ...(currentAiHelper.provider ?? DEFAULT_AI_HELPER_SETTINGS.provider),
        ...patch,
        type: 'openai-compatible',
      },
    })
  }

  const updateSelectedAiPromptTemplate = async (prompt: string): Promise<void> => {
    const current = getAppSettings()
    const currentAiHelper = current.aiHelper ?? DEFAULT_AI_HELPER_SETTINGS
    const templates = currentAiHelper.templates.map((template) => (
      template.id === activeAiTemplateId
        ? { ...template, prompt }
        : template
    ))
    await updateAiHelperSettings({ templates })
  }

  const updateShortcut = async (action: ShortcutAction, accelerator: string): Promise<void> => {
    const current = getAppSettings()
    const conflict = resolveShortcutConflict(current.shortcuts, action, accelerator)
    if (conflict) {
      render()
      showShortcutConflict(conflict)
      return
    }

    const nextShortcuts = {
      ...current.shortcuts,
      [action]: accelerator,
    }
    const next = (await api.updateSettings({ shortcuts: nextShortcuts }).catch(() => null)) ?? {
      ...current,
      shortcuts: nextShortcuts,
    }
    onAppSettingsChange(next)
    render()
  }

  overlay?.addEventListener('click', (event) => {
    if (event.target === overlay) close()
  })

  closeButton?.addEventListener('click', () => {
    close()
  })

  codexRefreshButton?.addEventListener('click', () => {
    void loadCodexStatus()
  })

  codexInstallButton?.addEventListener('click', () => {
    void installCodexIntegration()
  })

  codexRemoveButton?.addEventListener('click', () => {
    void removeCodexIntegration()
  })

  window.addEventListener('keydown', (event) => {
    if (!dialogOpen || !recordingShortcut) return

    event.preventDefault()
    event.stopPropagation()

    if (event.key === 'Escape') {
      stopRecording()
      clearShortcutConflict()
      render()
      return
    }

    const combo = formatKeyCombo(event)
    const action = recordingShortcut.dataset.shortcutAction as ShortcutAction | undefined
    if (!combo || !action) return

    recordingShortcut.textContent = formatShortcutLabel(combo)
    stopRecording()
    clearShortcutConflict()
    void updateShortcut(action, combo)
  }, true)

  for (const key of shortcutKeys) {
    key.addEventListener('click', (event) => {
      event.stopPropagation()
      if (recordingShortcut === key) {
        stopRecording()
        clearShortcutConflict()
        render()
      } else {
        stopRecording()
        clearShortcutConflict()
        render()
        recordingShortcut = key
        key.classList.add('recording')
        key.textContent = '录制中...'
      }
    })
  }

  for (const input of titleSyncInputs) {
    input.addEventListener('change', () => {
      if (!input.checked) return
      void updateTitleSyncMode(input.value as TitleSyncMode)
    })
  }

  for (const input of saveAsInputs) {
    input.addEventListener('change', () => {
      if (!input.checked) return
      void updateSaveAsMode(input.value as SaveAsMode)
    })
  }

  for (const input of backgroundScopeInputs) {
    input.addEventListener('change', () => {
      if (!input.checked || !isBackgroundScope(input.value)) return
      void updateBackgroundSettings({ scope: input.value })
    })
  }

  for (const input of backgroundModeInputs) {
    input.addEventListener('change', () => {
      if (!input.checked || !isBackgroundMode(input.value)) return
      void updateBackgroundSettings({ mode: input.value })
    })
  }

  backgroundColorInput?.addEventListener('input', () => {
    void updateBackgroundSettings({ color: backgroundColorInput.value })
  })

  backgroundImagePathInput?.addEventListener('change', () => {
    const imagePath = backgroundImagePathInput.value.trim() || null
    void updateBackgroundSettings({ imagePath })
  })

  backgroundOpacityInput?.addEventListener('change', () => {
    const current = getAppSettings().background
    void updateBackgroundSettings({
      opacity: clampNumber(backgroundOpacityInput.value, current.opacity, 0, 1),
    })
  })

  backgroundBlurInput?.addEventListener('change', () => {
    const current = getAppSettings().background
    void updateBackgroundSettings({
      blur: clampNumber(backgroundBlurInput.value, current.blur, 0, 40),
    })
  })

  backgroundDimInput?.addEventListener('change', () => {
    const current = getAppSettings().background
    void updateBackgroundSettings({
      dim: clampNumber(backgroundDimInput.value, current.dim, 0, 1),
    })
  })

  backgroundResetButton?.addEventListener('click', () => {
    void updateBackgroundSettings(DEFAULT_BACKGROUND_SETTINGS)
  })

  fontPresetSelect?.addEventListener('change', () => {
    const preset = fontPresetSelect.value
    if (!isEditorFontPreset(preset)) return
    void updateFontSettings({ preset })
  })

  fontCustomInput?.addEventListener('change', () => {
    void updateFontSettings({ customFamily: fontCustomInput.value })
  })

  for (const button of aiTemplateButtons) {
    button.addEventListener('click', () => {
      const templateId = button.dataset.settingsAiTemplate
      if (!templateId || templateId === activeAiTemplateId) return
      activeAiTemplateId = templateId
      render()
    })
  }

  aiTemplatePrompt?.addEventListener('change', () => {
    void updateSelectedAiPromptTemplate(aiTemplatePrompt.value)
  })

  aiBaseUrlInput?.addEventListener('change', () => {
    void updateAiHelperProviderSettings({ baseUrl: aiBaseUrlInput.value })
  })

  aiApiKeyInput?.addEventListener('change', () => {
    void updateAiHelperProviderSettings({ apiKey: aiApiKeyInput.value })
  })

  aiModelInput?.addEventListener('change', () => {
    void updateAiHelperProviderSettings({ model: aiModelInput.value })
  })

  aiTemperatureInput?.addEventListener('change', () => {
    const current = getAppSettings().aiHelper?.provider ?? DEFAULT_AI_HELPER_SETTINGS.provider
    void updateAiHelperProviderSettings({
      temperature: clampNumber(aiTemperatureInput.value, current.temperature, 0, 2),
    })
  })

  for (const tab of paneTabs) {
    tab.addEventListener('click', () => {
      const nextPane = tab.dataset.settingsPane as SettingsPaneId | undefined
      if (!nextPane || nextPane === activePane) return
      activePane = nextPane
      renderPane()
      if (activePane === 'integrations') {
        void loadCodexStatus()
      }
    })
  }

  draftChooseButton?.addEventListener('click', () => {
    api.chooseDraftDirectory().then((state) => {
      if (!state) return
      onSidebarStateChange(state)
      render()
    }).catch(() => {})
  })

  for (const button of themeButtons) {
    button.addEventListener('click', async () => {
      const themeName = button.dataset.settingsTheme
      if (!themeName) return
      applyTheme(themeName)
      const next = (await api.updateSettings({ themeName }).catch(() => null)) ?? {
        ...getAppSettings(),
        themeName,
      }
      onAppSettingsChange(next)
      render()
    })
  }

  importThemeButton?.addEventListener('click', () => {
    api.loadCustomTheme().then(async (result) => {
      if (!result) return
      const themeName = `custom:${result.name}`
      applyTheme(themeName, result.css)
      const next = (await api.updateSettings({ themeName }).catch(() => null)) ?? {
        ...getAppSettings(),
        themeName,
      }
      onAppSettingsChange(next)
      render()
    }).catch(() => {})
  })

  return {
    close,
    isOpen: () => dialogOpen,
    open,
    refresh: render,
    toggle,
  }
}
