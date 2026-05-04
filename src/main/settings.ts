import { mkdir, readFile, writeFile } from 'fs/promises'
import { dirname } from 'path'

export type TitleSyncMode = 'ask' | 'always' | 'never'
export type SaveAsMode = 'switch' | 'move'
export type ShortcutAction =
  | 'save'
  | 'saveAs'
  | 'settings'
  | 'search'
  | 'toggleSidebar'
  | 'cleanCjkTypography'

export type ShortcutMap = Record<ShortcutAction, string>

export interface AppSettings {
  titleSyncMode: TitleSyncMode
  saveAsMode: SaveAsMode
  themeName: string
  shortcuts: ShortcutMap
}

export const DEFAULT_SHORTCUTS: ShortcutMap = {
  save: 'CmdOrCtrl+S',
  saveAs: 'CmdOrCtrl+Shift+S',
  settings: 'CmdOrCtrl+,',
  search: 'CmdOrCtrl+F',
  toggleSidebar: 'CmdOrCtrl+\\',
  cleanCjkTypography: 'CmdOrCtrl+Shift+F',
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  titleSyncMode: 'ask',
  saveAsMode: 'switch',
  themeName: 'elegant',
  shortcuts: DEFAULT_SHORTCUTS,
}

type PersistedAppSettings = Partial<Record<keyof AppSettings, unknown>>
type AppSettingsPatch = Partial<Record<keyof AppSettings, unknown>>

function isTitleSyncMode(value: unknown): value is TitleSyncMode {
  return value === 'ask' || value === 'always' || value === 'never'
}

function isSaveAsMode(value: unknown): value is SaveAsMode {
  return value === 'switch' || value === 'move'
}

function isThemeName(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
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

function normalizeShortcuts(input: unknown, fallback: ShortcutMap = DEFAULT_SHORTCUTS): ShortcutMap {
  const normalized: ShortcutMap = { ...DEFAULT_SHORTCUTS, ...fallback }
  if (!input || typeof input !== 'object') return normalized

  for (const [action, accelerator] of Object.entries(input)) {
    if (!isShortcutAction(action)) continue
    if (!isShortcutAccelerator(accelerator)) continue
    normalized[action] = accelerator
  }

  return normalized
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
  }

  await persistAppSettings(settingsPath, nextSettings)
  return nextSettings
}
