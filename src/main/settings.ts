import { mkdir, readFile, writeFile } from 'fs/promises'
import { dirname } from 'path'

export type TitleSyncMode = 'ask' | 'always' | 'never'
export type SaveAsMode = 'switch' | 'move'
export type AgentPanelPosition = 'auto' | 'bottom' | 'right'
export type BackgroundMode = 'default' | 'color' | 'image'
export type BackgroundScope = 'editor' | 'window'
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

export interface AppSettings {
  titleSyncMode: TitleSyncMode
  saveAsMode: SaveAsMode
  themeName: string
  shortcuts: ShortcutMap
  agentPanelPosition: AgentPanelPosition
  background: BackgroundSettings
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
  }

  await persistAppSettings(settingsPath, nextSettings)
  return nextSettings
}
