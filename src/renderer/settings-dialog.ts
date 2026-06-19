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
]

const DEFAULT_AI_HELPER_SETTINGS: AiHelperSettings = {
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
  templates: DEFAULT_AI_PROMPT_TEMPLATES,
}

const BUILT_IN_AI_TEMPLATE_IDS = new Set(DEFAULT_AI_PROMPT_TEMPLATES.map((template) => template.id))

type AiProviderPreset = 'openai' | 'claude-gateway' | 'custom-gateway'

function isBuiltInAiTemplate(templateId: string | null | undefined): boolean {
  return typeof templateId === 'string' && BUILT_IN_AI_TEMPLATE_IDS.has(templateId)
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
  openPane: (pane: SettingsPaneId) => void
  refresh: () => void
  toggle: () => void
}

interface CreateSettingsDialogControllerOptions {
  api: ElectronAPI
  getAppSettings: () => AppSettings
  getSidebarState: () => SidebarState | null
  onAppSettingsChange: (settings: AppSettings) => void
  onSidebarStateChange: (state: SidebarState) => void
}

export type SettingsPaneId = 'general' | 'workspace' | 'shortcuts' | 'integrations' | 'feedback' | 'release-notes'

const SETTINGS_PANE_META: Record<
  SettingsPaneId,
  { description: string; kicker: string; title: string }
> = {
  general: {
    description: '决定标题同步、另存为切换方式，以及本地备份和恢复入口如何配合使用。',
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
  feedback: {
    description: '把问题和建议整理成 GitHub Issue，方便后续继续跟进。',
    kicker: '反馈',
    title: '反馈与问题',
  },
  'release-notes': {
    description: '查看 LyraMD 最近几个版本的主要变化，判断当前构建补了什么。',
    kicker: '反馈',
    title: '更新日志',
  },
}

type FeedbackIssueType = 'bug' | 'suggestion' | 'feature'

interface FeedbackIssueDiagnostics {
  themeName: string
  userAgent: string
}

interface FeedbackIssueInput {
  type: FeedbackIssueType
  title: string
  description: string
  includeDiagnostics: boolean
  diagnostics: FeedbackIssueDiagnostics
}

const FEEDBACK_TYPE_LABELS: Record<FeedbackIssueType, string> = {
  bug: '遇到 bug',
  suggestion: '体验建议',
  feature: '功能请求',
}

const FEEDBACK_TYPE_LABELS_FOR_GITHUB: Record<FeedbackIssueType, string> = {
  bug: 'bug',
  suggestion: 'enhancement',
  feature: 'enhancement',
}

function encodeIssueParam(value: string): string {
  return encodeURIComponent(value)
}

export function buildFeedbackIssueUrl(input: FeedbackIssueInput): string {
  const title = `[${FEEDBACK_TYPE_LABELS[input.type]}] ${input.title.trim()}`
  const diagnostics = input.includeDiagnostics
    ? `\n\n### 诊断信息\n- 主题：${input.diagnostics.themeName}\n- User Agent：${input.diagnostics.userAgent}`
    : ''
  const body = `### 类型\n${FEEDBACK_TYPE_LABELS[input.type]}\n\n### 描述\n${input.description.trim()}${diagnostics}`

  return [
    'https://github.com/Afeng01/LyraMD/issues/new',
    `?title=${encodeIssueParam(title)}`,
    `&body=${encodeIssueParam(body)}`,
    `&labels=${encodeIssueParam(FEEDBACK_TYPE_LABELS_FOR_GITHUB[input.type])}`,
  ].join('')
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
  const showDocumentStatsInput = document.getElementById('settings-show-document-stats') as HTMLInputElement | null
  const embedLocalImagesOnCopyInput = document.getElementById('settings-embed-local-images-on-copy') as HTMLInputElement | null
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
  const aiTemplateList = document.getElementById('settings-ai-template-list') as HTMLDivElement | null
  const aiTemplateAddButton = document.getElementById('settings-ai-template-add') as HTMLButtonElement | null
  const aiTemplateDeleteButton = document.getElementById('settings-ai-template-delete') as HTMLButtonElement | null
  const aiTemplateTitleInput = document.getElementById('settings-ai-template-title') as HTMLInputElement | null
  const aiTemplatePrompt = document.getElementById('settings-ai-template-prompt') as HTMLTextAreaElement | null
  const aiProviderPanel = document.getElementById('settings-ai-provider-panel') as HTMLDivElement | null
  const aiProviderPresetButtons = Array.from(
    document.querySelectorAll<HTMLButtonElement>('[data-ai-provider-preset]'),
  )
  const aiBaseUrlInput = document.getElementById('settings-ai-base-url') as HTMLInputElement | null
  const aiApiKeyInput = document.getElementById('settings-ai-api-key') as HTMLInputElement | null
  const aiModelInput = document.getElementById('settings-ai-model') as HTMLInputElement | null
  const aiTemperatureInput = document.getElementById('settings-ai-temperature') as HTMLInputElement | null
  const aiTestButton = document.getElementById('settings-ai-test') as HTMLButtonElement | null
  const aiTestStatus = document.getElementById('settings-ai-test-status') as HTMLDivElement | null
  const aiTestToast = document.getElementById('settings-ai-test-toast') as HTMLDivElement | null
  const aiTestToastTitle = document.getElementById('settings-ai-test-toast-title') as HTMLElement | null
  const aiTestToastMessage = document.getElementById('settings-ai-test-toast-message') as HTMLParagraphElement | null
  const aiTestToastClose = document.getElementById('settings-ai-test-toast-close') as HTMLButtonElement | null
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
  const feedbackTypeSelect = document.getElementById('settings-feedback-type') as HTMLSelectElement | null
  const feedbackTitleInput = document.getElementById('settings-feedback-title') as HTMLInputElement | null
  const feedbackDescriptionInput = document.getElementById('settings-feedback-description') as HTMLTextAreaElement | null
  const feedbackDiagnosticsInput = document.getElementById('settings-feedback-diagnostics') as HTMLInputElement | null
  const feedbackSubmitButton = document.getElementById('settings-feedback-submit') as HTMLButtonElement | null
  const feedbackStatus = document.getElementById('settings-feedback-status') as HTMLDivElement | null

  let dialogOpen = false
  let activePane: SettingsPaneId = 'general'
  let recordingShortcut: HTMLElement | null = null
  let codexStatus: CodexIntegrationStatus | null = null
  let codexLoading = false
  let activeAiTemplateId = 'polish'
  let aiTestLoading = false
  let aiTestStatusText = ''
  let aiTestStatusTone: 'error' | 'success' | '' = ''
  let aiTestToastOpen = false
  let aiTestToastTimer: number | null = null

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

  const getAiTemplateCategory = (templateId: string): { id: string; label: string } => {
    if (['polish', 'condense', 'fix-grammar', 'simplify'].includes(templateId)) return { id: 'editing', label: '编辑' }
    if (['rephrase', 'expand', 'vivid'].includes(templateId)) return { id: 'creative', label: '表达' }
    if (['rewrite-english', 'translate'].includes(templateId)) return { id: 'language', label: '翻译' }
    if (templateId === 'summarize') return { id: 'structure', label: '总结' }
    return { id: 'custom', label: '自定义' }
  }

  const resolveAiProviderPreset = (provider: AiHelperProviderSettings): AiProviderPreset => {
    const baseUrl = provider.baseUrl.toLowerCase()
    const model = provider.model.toLowerCase()
    if (baseUrl.includes('api.openai.com')) return 'openai'
    if (model.includes('claude')) return 'claude-gateway'
    return 'custom-gateway'
  }

  const renderAiTemplateButtons = (templates: AiPromptTemplate[]): void => {
    if (!aiTemplateList) return
    aiTemplateList.replaceChildren()
    const groups = new Map<string, { label: string; templates: AiPromptTemplate[] }>()
    for (const template of templates) {
      const category = getAiTemplateCategory(template.id)
      if (!groups.has(category.id)) groups.set(category.id, { label: category.label, templates: [] })
      groups.get(category.id)?.templates.push(template)
    }
    for (const group of groups.values()) {
      const groupShell = document.createElement('div')
      groupShell.className = 'settings-ai-template-group'
      const label = document.createElement('div')
      label.className = 'settings-ai-template-group-label'
      label.textContent = group.label
      const buttons = document.createElement('div')
      buttons.className = 'settings-ai-template-group-buttons'
      for (const template of group.templates) {
        const button = document.createElement('button')
        button.type = 'button'
        button.className = 'settings-ai-template-button'
        button.dataset.settingsAiTemplate = template.id
        button.textContent = template.title
        button.classList.toggle('active', template.id === activeAiTemplateId)
        buttons.appendChild(button)
      }
      groupShell.append(label, buttons)
      aiTemplateList.appendChild(groupShell)
    }
  }

  const createCustomAiTemplate = (): AiPromptTemplate => {
    const id = `custom-${Date.now().toString(36)}`
    return {
      id,
      title: '自定义精灵',
      prompt: '请根据我的要求处理下面选区。只返回处理后的文字，不要解释：\n\n{{selection}}',
    }
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

    if (showDocumentStatsInput) {
      showDocumentStatsInput.checked = appSettings.showDocumentStats !== false
    }

    if (embedLocalImagesOnCopyInput) {
      embedLocalImagesOnCopyInput.checked = appSettings.embedLocalImagesOnCopy === true
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
    const activeProviderPreset = resolveAiProviderPreset(aiProvider)
    if (aiBaseUrlInput) aiBaseUrlInput.value = aiProvider.baseUrl
    if (aiApiKeyInput) aiApiKeyInput.value = aiProvider.apiKey
    if (aiModelInput) aiModelInput.value = aiProvider.model
    if (aiTemperatureInput) aiTemperatureInput.value = String(aiProvider.temperature)
    for (const button of aiProviderPresetButtons) {
      const isActive = button.dataset.aiProviderPreset === activeProviderPreset
      button.classList.toggle('active', isActive)
      button.setAttribute('aria-pressed', String(isActive))
    }
    const activeAiTemplate = aiHelper.templates.find((template) => template.id === activeAiTemplateId)
      ?? aiHelper.templates[0]
      ?? DEFAULT_AI_PROMPT_TEMPLATES[0]
    if (activeAiTemplate) {
      activeAiTemplateId = activeAiTemplate.id
      if (aiTemplateTitleInput) aiTemplateTitleInput.value = activeAiTemplate.title
      if (aiTemplatePrompt) aiTemplatePrompt.value = activeAiTemplate.prompt
    }
    if (aiTemplateDeleteButton) {
      const canDeleteTemplate = Boolean(activeAiTemplate && !isBuiltInAiTemplate(activeAiTemplate.id))
      aiTemplateDeleteButton.disabled = !canDeleteTemplate
    }
    if (aiTestButton) {
      aiTestButton.disabled = aiTestLoading
      aiTestButton.textContent = aiTestLoading ? '检测中...' : '检测'
    }
    if (aiTestStatus) {
      aiTestStatus.hidden = true
      aiTestStatus.textContent = aiTestStatusText
      aiTestStatus.classList.toggle('settings-integration-error', aiTestStatusTone === 'error')
      aiTestStatus.classList.toggle('settings-status-success', aiTestStatusTone === 'success')
    }
    if (aiTestToast) {
      aiTestToast.hidden = !aiTestToastOpen
      aiTestToast.classList.toggle('loading', aiTestLoading)
      aiTestToast.classList.toggle('success', aiTestStatusTone === 'success')
      aiTestToast.classList.toggle('error', aiTestStatusTone === 'error')
    }
    if (aiTestToastTitle) {
      aiTestToastTitle.textContent = aiTestLoading
        ? '正在检测'
        : (aiTestStatusTone === 'success' ? '连接正常' : '连接失败')
    }
    if (aiTestToastMessage) {
      aiTestToastMessage.textContent = aiTestStatusText || '正在检测 AI 连接...'
    }
    renderAiTemplateButtons(aiHelper.templates)

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

  const getFeedbackIssueType = (): FeedbackIssueType => {
    const value = feedbackTypeSelect?.value
    if (value === 'bug' || value === 'suggestion' || value === 'feature') return value
    return 'bug'
  }

  const setFeedbackStatus = (message: string, kind: 'muted' | 'warning' = 'muted'): void => {
    if (!feedbackStatus) return
    feedbackStatus.hidden = false
    feedbackStatus.textContent = message
    feedbackStatus.dataset.kind = kind
  }

  const submitFeedbackIssue = (): void => {
    const title = feedbackTitleInput?.value.trim() ?? ''
    const description = feedbackDescriptionInput?.value.trim() ?? ''

    if (!title || !description) {
      setFeedbackStatus('请先填写标题和描述。', 'warning')
      return
    }

    const appSettings = getAppSettings()
    const url = buildFeedbackIssueUrl({
      type: getFeedbackIssueType(),
      title,
      description,
      includeDiagnostics: Boolean(feedbackDiagnosticsInput?.checked),
      diagnostics: {
        themeName: appSettings.themeName,
        userAgent: navigator.userAgent,
      },
    })

    api.openExternal(url)
    setFeedbackStatus('已打开 GitHub Issue 页面，确认内容后提交即可。')
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

  const clearAiTestToastTimer = (): void => {
    if (aiTestToastTimer == null) return
    window.clearTimeout(aiTestToastTimer)
    aiTestToastTimer = null
  }

  const showAiTestToast = (text: string, tone: 'error' | 'success' | '' = '', autoHide = true): void => {
    clearAiTestToastTimer()
    aiTestStatusText = text
    aiTestStatusTone = tone
    aiTestToastOpen = true
    render()
    if (!autoHide) return
    aiTestToastTimer = window.setTimeout(() => {
      aiTestToastOpen = false
      aiTestToastTimer = null
      render()
    }, tone === 'error' ? 4200 : 2800)
  }

  const open = (): void => {
    dialogOpen = true
    clearShortcutConflict()
    render()
    if (activePane === 'integrations') void loadCodexStatus()
    if (!overlay) return
    overlay.hidden = false
    overlay.setAttribute('aria-hidden', 'false')
    queueMicrotask(() => {
      if (activePane === 'integrations') {
        aiProviderPanel?.focus()
        return
      }
      closeButton?.focus()
    })
  }

  const openPane = (pane: SettingsPaneId): void => {
    activePane = pane
    open()
  }

  const close = (): void => {
    dialogOpen = false
    stopRecording()
    clearShortcutConflict()
    if (document.body.classList.contains('settings-window-mode')) {
      api.closeWindow().catch(() => {})
      return
    }
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

  const updateShowDocumentStats = async (showDocumentStats: boolean): Promise<void> => {
    const current = getAppSettings()
    const next = (await api.updateSettings({ showDocumentStats }).catch(() => null)) ?? {
      ...current,
      showDocumentStats,
    }
    onAppSettingsChange(next)
    render()
  }

  const updateEmbedLocalImagesOnCopy = async (embedLocalImagesOnCopy: boolean): Promise<void> => {
    const current = getAppSettings()
    const next = (await api.updateSettings({ embedLocalImagesOnCopy }).catch(() => null)) ?? {
      ...current,
      embedLocalImagesOnCopy,
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
    const provider = {
      ...(currentAiHelper.provider ?? DEFAULT_AI_HELPER_SETTINGS.provider),
      ...patch,
      type: 'openai-compatible' as const,
    }
    await updateAiHelperSettings({
      ...currentAiHelper,
      provider,
      customProvider: resolveAiProviderPreset(provider) === 'custom-gateway'
        ? provider
        : (currentAiHelper.customProvider ?? DEFAULT_AI_HELPER_SETTINGS.customProvider),
    })
  }

  const applyAiProviderPreset = async (preset: AiProviderPreset): Promise<void> => {
    const currentAiHelper = getAppSettings().aiHelper ?? DEFAULT_AI_HELPER_SETTINGS
    const currentProvider = readAiProviderSettingsFromInputs()
    const activeProviderPreset = resolveAiProviderPreset(currentProvider)
    const customProvider = activeProviderPreset === 'custom-gateway'
      ? currentProvider
      : (currentAiHelper.customProvider ?? DEFAULT_AI_HELPER_SETTINGS.customProvider)

    if (preset === 'openai') {
      await updateAiHelperSettings({
        ...currentAiHelper,
        customProvider,
        provider: {
          ...DEFAULT_AI_HELPER_SETTINGS.provider,
          temperature: currentProvider.temperature,
        },
      })
      return
    }

    if (preset === 'claude-gateway') {
      await updateAiHelperSettings({
        ...currentAiHelper,
        customProvider,
        provider: {
          ...currentProvider,
          model: currentProvider.model.toLowerCase().includes('claude') ? currentProvider.model : 'claude-sonnet-4-5',
          type: 'openai-compatible',
        },
      })
      return
    }

    await updateAiHelperSettings({
      ...currentAiHelper,
      customProvider,
      provider: {
        ...customProvider,
        type: 'openai-compatible',
      },
    })
  }

  const readAiProviderSettingsFromInputs = (): AiHelperProviderSettings => {
    const current = getAppSettings().aiHelper?.provider ?? DEFAULT_AI_HELPER_SETTINGS.provider
    return {
      ...current,
      baseUrl: aiBaseUrlInput?.value ?? current.baseUrl,
      apiKey: aiApiKeyInput?.value ?? current.apiKey,
      model: aiModelInput?.value ?? current.model,
      temperature: clampNumber(aiTemperatureInput?.value, current.temperature, 0, 2),
      type: 'openai-compatible',
    }
  }

  const updateSelectedAiPromptTemplate = async (patch: Partial<Pick<AiPromptTemplate, 'title' | 'prompt'>>): Promise<void> => {
    const current = getAppSettings()
    const currentAiHelper = current.aiHelper ?? DEFAULT_AI_HELPER_SETTINGS
    const templates = currentAiHelper.templates.map((template) => (
      template.id === activeAiTemplateId
        ? { ...template, ...patch }
        : template
    ))
    await updateAiHelperSettings({
      ...currentAiHelper,
      templates,
    })
  }

  const addCustomAiPromptTemplate = async (): Promise<void> => {
    const current = getAppSettings()
    const currentAiHelper = current.aiHelper ?? DEFAULT_AI_HELPER_SETTINGS
    const template = createCustomAiTemplate()
    activeAiTemplateId = template.id
    await updateAiHelperSettings({
      ...currentAiHelper,
      templates: [...currentAiHelper.templates, template],
    })
  }

  const deleteSelectedCustomAiPromptTemplate = async (): Promise<void> => {
    if (isBuiltInAiTemplate(activeAiTemplateId)) return
    const current = getAppSettings()
    const currentAiHelper = current.aiHelper ?? DEFAULT_AI_HELPER_SETTINGS
    const templates = currentAiHelper.templates.filter((template) => template.id !== activeAiTemplateId)
    activeAiTemplateId = templates[0]?.id ?? DEFAULT_AI_PROMPT_TEMPLATES[0].id
    await updateAiHelperSettings({
      ...currentAiHelper,
      templates,
    })
  }

  const testAiHelperConnection = async (): Promise<void> => {
    if (aiTestLoading) return
    aiTestLoading = true
    showAiTestToast('正在检测 AI 连接...', '', false)
    const current = getAppSettings()
    const currentAiHelper = current.aiHelper ?? DEFAULT_AI_HELPER_SETTINGS
    const provider = readAiProviderSettingsFromInputs()
    const next = (await api.updateSettings({
      aiHelper: {
        ...currentAiHelper,
        provider,
      },
    }).catch(() => null)) ?? {
      ...current,
      aiHelper: {
        ...currentAiHelper,
        provider,
      },
    }
    onAppSettingsChange(next)
    const result = await api.testAiHelperConnection().catch((error) => ({
      ok: false,
      error: error instanceof Error ? error.message : 'AI 连接检测失败。',
    }))
    aiTestLoading = false
    showAiTestToast(
      result.ok ? (result.text ?? 'AI 连接正常。') : (result.error ?? 'AI 连接检测失败。'),
      result.ok ? 'success' : 'error',
    )
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

  feedbackSubmitButton?.addEventListener('click', submitFeedbackIssue)

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

  showDocumentStatsInput?.addEventListener('change', () => {
    void updateShowDocumentStats(showDocumentStatsInput.checked)
  })

  embedLocalImagesOnCopyInput?.addEventListener('change', () => {
    void updateEmbedLocalImagesOnCopy(embedLocalImagesOnCopyInput.checked)
  })

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

  aiTemplateList?.addEventListener('click', (event) => {
    const button = (event.target as HTMLElement | null)?.closest('[data-settings-ai-template]') as HTMLButtonElement | null
    if (button) {
      const templateId = button.dataset.settingsAiTemplate
      if (!templateId || templateId === activeAiTemplateId) return
      activeAiTemplateId = templateId
      render()
    }
  })

  aiTemplateAddButton?.addEventListener('click', () => {
    void addCustomAiPromptTemplate()
  })

  aiTemplateDeleteButton?.addEventListener('click', () => {
    void deleteSelectedCustomAiPromptTemplate()
  })

  for (const button of aiProviderPresetButtons) {
    button.addEventListener('click', () => {
      const preset = button.dataset.aiProviderPreset as AiProviderPreset | undefined
      if (!preset) return
      void applyAiProviderPreset(preset)
    })
  }

  aiTestToastClose?.addEventListener('click', () => {
    clearAiTestToastTimer()
    aiTestToastOpen = false
    render()
  })

  aiTemplateTitleInput?.addEventListener('change', () => {
    const title = aiTemplateTitleInput.value.trim() || '自定义精灵'
    void updateSelectedAiPromptTemplate({ title })
  })

  aiTemplatePrompt?.addEventListener('change', () => {
    void updateSelectedAiPromptTemplate({ prompt: aiTemplatePrompt.value })
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

  aiTestButton?.addEventListener('click', () => {
    void testAiHelperConnection()
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
    openPane,
    refresh: render,
    toggle,
  }
}
