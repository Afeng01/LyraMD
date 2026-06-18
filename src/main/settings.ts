import { mkdir, readFile, writeFile } from 'fs/promises'
import { dirname } from 'path'

export type TitleSyncMode = 'ask' | 'always' | 'never'
export type SaveAsMode = 'switch' | 'move'
export type AgentPanelPosition = 'auto' | 'bottom' | 'right'
export type BackgroundMode = 'default' | 'color' | 'image'
export type BackgroundScope = 'editor' | 'window'
export type EditorFontPreset = 'theme' | 'elegant' | 'sans' | 'serif' | 'mono' | 'custom'
export type ShortcutAction =
  | 'save'
  | 'saveAs'
  | 'settings'
  | 'search'
  | 'toggleSidebar'
  | 'toggleOutline'
  | 'cleanCjkTypography'
  | 'openAiPalette'

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

export interface AppSettings {
  titleSyncMode: TitleSyncMode
  saveAsMode: SaveAsMode
  themeName: string
  shortcuts: ShortcutMap
  agentPanelPosition: AgentPanelPosition
  showDocumentStats: boolean
  embedLocalImagesOnCopy: boolean
  background: BackgroundSettings
  font: FontSettings
  aiHelper: AiHelperSettings
}

export const DEFAULT_SHORTCUTS: ShortcutMap = {
  save: 'CmdOrCtrl+S',
  saveAs: 'CmdOrCtrl+Shift+S',
  settings: 'CmdOrCtrl+,',
  search: 'CmdOrCtrl+F',
  toggleSidebar: 'CmdOrCtrl+\\',
  toggleOutline: 'CmdOrCtrl+Shift+O',
  cleanCjkTypography: 'CmdOrCtrl+Shift+F',
  openAiPalette: 'CmdOrCtrl+J',
}

export const DEFAULT_AI_PROMPT_TEMPLATES: AiPromptTemplate[] = [
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

export const DEFAULT_APP_SETTINGS: AppSettings = {
  titleSyncMode: 'ask',
  saveAsMode: 'switch',
  themeName: 'elegant',
  shortcuts: DEFAULT_SHORTCUTS,
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
    templates: DEFAULT_AI_PROMPT_TEMPLATES,
  },
}

type PersistedAppSettings = Partial<Record<keyof AppSettings, unknown>>
type AppSettingsPatch = Partial<Record<keyof AppSettings, unknown>>

function isTitleSyncMode(value: unknown): value is TitleSyncMode {
  return value === 'ask' || value === 'always' || value === 'never'
}

function isSaveAsMode(value: unknown): value is SaveAsMode {
  return value === 'switch' || value === 'move'
}

function isAgentPanelPosition(value: unknown): value is AgentPanelPosition {
  return value === 'auto' || value === 'bottom' || value === 'right'
}

function isBackgroundMode(value: unknown): value is BackgroundMode {
  return value === 'default' || value === 'color' || value === 'image'
}

function isBackgroundScope(value: unknown): value is BackgroundScope {
  return value === 'editor' || value === 'window'
}

function isEditorFontPreset(value: unknown): value is EditorFontPreset {
  return value === 'theme'
    || value === 'elegant'
    || value === 'sans'
    || value === 'serif'
    || value === 'mono'
    || value === 'custom'
}

function isThemeName(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean'
}

function clampNumber(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, value))
}

function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)
}

function normalizeBackgroundSettings(input: unknown): BackgroundSettings {
  const candidate = input && typeof input === 'object'
    ? input as Partial<Record<keyof BackgroundSettings, unknown>>
    : {}
  const defaults = DEFAULT_APP_SETTINGS.background

  return {
    mode: isBackgroundMode(candidate.mode) ? candidate.mode : defaults.mode,
    scope: isBackgroundScope(candidate.scope) ? candidate.scope : defaults.scope,
    color: isHexColor(candidate.color) ? candidate.color : defaults.color,
    imagePath: typeof candidate.imagePath === 'string' && candidate.imagePath.trim().length > 0
      ? candidate.imagePath
      : defaults.imagePath,
    opacity: clampNumber(candidate.opacity, defaults.opacity, 0, 1),
    blur: clampNumber(candidate.blur, defaults.blur, 0, 40),
    dim: clampNumber(candidate.dim, defaults.dim, 0, 1),
  }
}

function normalizeFontFamily(input: unknown): string {
  if (typeof input !== 'string') return ''
  const trimmed = input.trim().replace(/\s+/g, ' ')
  if (!trimmed || trimmed.length > 180) return ''
  if (/[{};<>]/.test(trimmed)) return ''
  return trimmed
}

function normalizeFontSettings(input: unknown): FontSettings {
  const candidate = input && typeof input === 'object'
    ? input as Partial<Record<keyof FontSettings, unknown>>
    : {}
  const preset = isEditorFontPreset(candidate.preset)
    ? candidate.preset
    : DEFAULT_APP_SETTINGS.font.preset
  const customFamily = normalizeFontFamily(candidate.customFamily)

  if (preset === 'custom' && !customFamily) {
    return DEFAULT_APP_SETTINGS.font
  }

  return {
    preset,
    customFamily,
  }
}

function normalizePromptText(input: unknown, maxLength: number): string {
  if (typeof input !== 'string') return ''
  return input.trim().replace(/\r\n/g, '\n').slice(0, maxLength)
}

function normalizePromptTemplate(input: unknown): AiPromptTemplate | null {
  const candidate = input && typeof input === 'object'
    ? input as Partial<Record<keyof AiPromptTemplate, unknown>>
    : {}
  const id = normalizePromptText(candidate.id, 80)
  const title = normalizePromptText(candidate.title, 60)
  const prompt = normalizePromptText(candidate.prompt, 4000)
  if (!id || !title || !prompt) return null

  return { id, title, prompt }
}

function mergeAiPromptTemplates(templates: AiPromptTemplate[]): AiPromptTemplate[] {
  const defaultIds = new Set(DEFAULT_AI_PROMPT_TEMPLATES.map((template) => template.id))
  const persistedById = new Map(templates.map((template) => [template.id, template]))
  const mergedDefaults = DEFAULT_AI_PROMPT_TEMPLATES.map((template) => ({
    ...template,
    ...persistedById.get(template.id),
  }))
  const customTemplates = templates.filter((template) => !defaultIds.has(template.id))
  return [...mergedDefaults, ...customTemplates].slice(0, 12)
}

function normalizeAiBaseUrl(input: unknown): string {
  if (typeof input !== 'string') return DEFAULT_APP_SETTINGS.aiHelper.provider.baseUrl
  const trimmed = input.trim().replace(/\/+$/u, '')
  try {
    const url = new URL(trimmed)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      return DEFAULT_APP_SETTINGS.aiHelper.provider.baseUrl
    }
    return url.toString().replace(/\/+$/u, '')
  } catch {
    return DEFAULT_APP_SETTINGS.aiHelper.provider.baseUrl
  }
}

function normalizeAiProviderText(input: unknown, maxLength: number): string {
  if (typeof input !== 'string') return ''
  return input.trim().replace(/\s+/g, ' ').slice(0, maxLength)
}

function normalizeAiHelperProviderSettings(input: unknown): AiHelperProviderSettings {
  const candidate = input && typeof input === 'object'
    ? input as Partial<Record<keyof AiHelperProviderSettings, unknown>>
    : {}
  const model = normalizeAiProviderText(candidate.model, 120)
  return {
    type: 'openai-compatible',
    baseUrl: normalizeAiBaseUrl(candidate.baseUrl),
    apiKey: normalizeAiProviderText(candidate.apiKey, 400),
    model: model || DEFAULT_APP_SETTINGS.aiHelper.provider.model,
    temperature: clampNumber(candidate.temperature, DEFAULT_APP_SETTINGS.aiHelper.provider.temperature, 0, 2),
  }
}

function isCustomAiHelperProvider(provider: AiHelperProviderSettings): boolean {
  const baseUrl = provider.baseUrl.toLowerCase()
  const model = provider.model.toLowerCase()
  return !baseUrl.includes('api.openai.com') && !model.includes('claude')
}

function normalizeAiHelperSettings(input: unknown): AiHelperSettings {
  const candidate = input && typeof input === 'object'
    ? input as Partial<Record<keyof AiHelperSettings, unknown>>
    : {}
  const templates = Array.isArray(candidate.templates)
    ? candidate.templates
      .map(normalizePromptTemplate)
      .filter((template): template is AiPromptTemplate => template !== null)
    : []

  const provider = normalizeAiHelperProviderSettings(candidate.provider)
  const customProvider = candidate.customProvider === undefined && isCustomAiHelperProvider(provider)
    ? provider
    : normalizeAiHelperProviderSettings(candidate.customProvider)

  return {
    provider,
    customProvider,
    templates: templates.length === 0
      ? DEFAULT_APP_SETTINGS.aiHelper.templates
      : mergeAiPromptTemplates(templates),
  }
}

function isShortcutAction(value: string): value is ShortcutAction {
  return value in DEFAULT_SHORTCUTS
}

function isShortcutAccelerator(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const parts = value.split('+').map((part) => part.trim()).filter(Boolean)
  if (parts.length === 0) return false

  const modifiers = new Set(['CmdOrCtrl', 'CommandOrControl', 'Cmd', 'Command', 'Ctrl', 'Control', 'Alt', 'Option', 'Shift', 'Meta', 'Super'])
  const key = parts.at(-1)
  if (!key || /\s/.test(key)) return false

  return parts.slice(0, -1).every((part) => modifiers.has(part))
}

function hasShortcutConflict(shortcuts: ShortcutMap, action: ShortcutAction, accelerator: string): boolean {
  return Object.entries(shortcuts).some(([candidateAction, candidateAccelerator]) => (
    candidateAction !== action && candidateAccelerator === accelerator
  ))
}

function applyShortcutOverrides(base: ShortcutMap, input: unknown): ShortcutMap {
  const normalized = { ...base }
  if (!input || typeof input !== 'object') return normalized

  for (const [action, accelerator] of Object.entries(input)) {
    if (!isShortcutAction(action)) continue
    if (!isShortcutAccelerator(accelerator)) continue
    if (hasShortcutConflict(normalized, action, accelerator)) continue
    normalized[action] = accelerator
  }

  return normalized
}

function normalizeShortcuts(input: unknown, fallback: ShortcutMap = DEFAULT_SHORTCUTS): ShortcutMap {
  return applyShortcutOverrides(
    applyShortcutOverrides(DEFAULT_SHORTCUTS, fallback),
    input,
  )
}

export function normalizeAppSettings(input: PersistedAppSettings | null | undefined): AppSettings {
  return {
    titleSyncMode: isTitleSyncMode(input?.titleSyncMode)
      ? input.titleSyncMode
      : DEFAULT_APP_SETTINGS.titleSyncMode,
    saveAsMode: isSaveAsMode(input?.saveAsMode)
      ? input.saveAsMode
      : DEFAULT_APP_SETTINGS.saveAsMode,
    themeName: isThemeName(input?.themeName)
      ? input.themeName
      : DEFAULT_APP_SETTINGS.themeName,
    shortcuts: normalizeShortcuts(input?.shortcuts),
    agentPanelPosition: isAgentPanelPosition(input?.agentPanelPosition)
      ? input.agentPanelPosition
      : DEFAULT_APP_SETTINGS.agentPanelPosition,
    showDocumentStats: typeof input?.showDocumentStats === 'boolean'
      ? input.showDocumentStats
      : DEFAULT_APP_SETTINGS.showDocumentStats,
    embedLocalImagesOnCopy: isBoolean(input?.embedLocalImagesOnCopy)
      ? input.embedLocalImagesOnCopy
      : DEFAULT_APP_SETTINGS.embedLocalImagesOnCopy,
    background: normalizeBackgroundSettings(input?.background),
    font: normalizeFontSettings(input?.font),
    aiHelper: normalizeAiHelperSettings(input?.aiHelper),
  }
}

async function persistAppSettings(settingsPath: string, settings: AppSettings): Promise<void> {
  await mkdir(dirname(settingsPath), { recursive: true })
  await writeFile(settingsPath, JSON.stringify(settings, null, 2), 'utf-8')
}

export async function loadAppSettings(settingsPath: string): Promise<AppSettings> {
  try {
    const raw = await readFile(settingsPath, 'utf-8')
    const normalized = normalizeAppSettings(JSON.parse(raw) as PersistedAppSettings)
    await persistAppSettings(settingsPath, normalized)
    return normalized
  } catch {
    await persistAppSettings(settingsPath, DEFAULT_APP_SETTINGS)
    return DEFAULT_APP_SETTINGS
  }
}

export async function updateAppSettings(
  settingsPath: string,
  currentSettings: AppSettings,
  patch: AppSettingsPatch,
): Promise<AppSettings> {
  const nextSettings: AppSettings = {
    titleSyncMode: isTitleSyncMode(patch.titleSyncMode)
      ? patch.titleSyncMode
      : currentSettings.titleSyncMode,
    saveAsMode: isSaveAsMode(patch.saveAsMode)
      ? patch.saveAsMode
      : currentSettings.saveAsMode,
    themeName: isThemeName(patch.themeName)
      ? patch.themeName
      : currentSettings.themeName,
    shortcuts: patch.shortcuts === undefined
      ? normalizeShortcuts(currentSettings.shortcuts)
      : normalizeShortcuts(patch.shortcuts, currentSettings.shortcuts),
    agentPanelPosition: isAgentPanelPosition(patch.agentPanelPosition)
      ? patch.agentPanelPosition
      : currentSettings.agentPanelPosition,
    showDocumentStats: typeof patch.showDocumentStats === 'boolean'
      ? patch.showDocumentStats
      : currentSettings.showDocumentStats,
    embedLocalImagesOnCopy: isBoolean(patch.embedLocalImagesOnCopy)
      ? patch.embedLocalImagesOnCopy
      : currentSettings.embedLocalImagesOnCopy,
    background: patch.background === undefined
      ? normalizeBackgroundSettings(currentSettings.background)
      : normalizeBackgroundSettings(patch.background),
    font: patch.font === undefined
      ? normalizeFontSettings(currentSettings.font)
      : normalizeFontSettings(patch.font),
    aiHelper: patch.aiHelper === undefined
      ? normalizeAiHelperSettings(currentSettings.aiHelper)
      : normalizeAiHelperSettings(patch.aiHelper),
  }

  await persistAppSettings(settingsPath, nextSettings)
  return nextSettings
}
