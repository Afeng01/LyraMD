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
  templates: AiPromptTemplate[]
}

export interface AppSettings {
  titleSyncMode: TitleSyncMode
  saveAsMode: SaveAsMode
  themeName: string
  shortcuts: ShortcutMap
  agentPanelPosition: AgentPanelPosition
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
}

export const DEFAULT_AI_PROMPT_TEMPLATES: AiPromptTemplate[] = [
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

export const DEFAULT_APP_SETTINGS: AppSettings = {
  titleSyncMode: 'ask',
  saveAsMode: 'switch',
  themeName: 'elegant',
  shortcuts: DEFAULT_SHORTCUTS,
  agentPanelPosition: 'auto',
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

  if (templates.length === 0) {
    return {
      provider,
      templates: DEFAULT_APP_SETTINGS.aiHelper.templates,
    }
  }

  return {
    provider,
    templates: templates.slice(0, 12),
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
