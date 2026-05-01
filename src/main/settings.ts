import { mkdir, readFile, writeFile } from 'fs/promises'
import { dirname } from 'path'

export type TitleSyncMode = 'ask' | 'always' | 'never'
export type SaveAsMode = 'switch' | 'move'

export interface AppSettings {
  titleSyncMode: TitleSyncMode
  saveAsMode: SaveAsMode
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  titleSyncMode: 'ask',
  saveAsMode: 'switch',
}

type PersistedAppSettings = Partial<Record<keyof AppSettings, unknown>>
type AppSettingsPatch = Partial<Record<keyof AppSettings, unknown>>

function isTitleSyncMode(value: unknown): value is TitleSyncMode {
  return value === 'ask' || value === 'always' || value === 'never'
}

function isSaveAsMode(value: unknown): value is SaveAsMode {
  return value === 'switch' || value === 'move'
}

export function normalizeAppSettings(input: PersistedAppSettings | null | undefined): AppSettings {
  return {
    titleSyncMode: isTitleSyncMode(input?.titleSyncMode)
      ? input.titleSyncMode
      : DEFAULT_APP_SETTINGS.titleSyncMode,
    saveAsMode: isSaveAsMode(input?.saveAsMode)
      ? input.saveAsMode
      : DEFAULT_APP_SETTINGS.saveAsMode,
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
  }

  await persistAppSettings(settingsPath, nextSettings)
  return nextSettings
}
