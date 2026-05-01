import { mkdtemp, readFile, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, describe, expect, it } from 'vitest'

const tempDirs: string[] = []

async function createTempDir(): Promise<string> {
  const tempDir = await mkdtemp(join(tmpdir(), 'lyramd-settings-'))
  tempDirs.push(tempDir)
  return tempDir
}

async function loadSettingsModule() {
  const module = await import('./settings').catch(() => null)
  expect(module).not.toBeNull()
  return module as typeof import('./settings')
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe('loadAppSettings', () => {
  it('returns defaults and creates a settings file when none exists', async () => {
    const settingsModule = await loadSettingsModule()
    const tempDir = await createTempDir()
    const settingsPath = join(tempDir, 'settings.json')

    const settings = await settingsModule.loadAppSettings(settingsPath)

    expect(settings).toEqual(settingsModule.DEFAULT_APP_SETTINGS)
    expect(JSON.parse(await readFile(settingsPath, 'utf-8'))).toEqual(settingsModule.DEFAULT_APP_SETTINGS)
  })

  it('normalizes invalid persisted values back to defaults', async () => {
    const settingsModule = await loadSettingsModule()
    const tempDir = await createTempDir()
    const settingsPath = join(tempDir, 'settings.json')
    await writeFile(settingsPath, JSON.stringify({ titleSyncMode: 'sometimes', saveAsMode: 'teleport' }), 'utf-8')

    const settings = await settingsModule.loadAppSettings(settingsPath)

    expect(settings).toEqual(settingsModule.DEFAULT_APP_SETTINGS)
    expect(JSON.parse(await readFile(settingsPath, 'utf-8'))).toEqual(settingsModule.DEFAULT_APP_SETTINGS)
  })
})

describe('updateAppSettings', () => {
  it('persists supported title sync mode updates', async () => {
    const settingsModule = await loadSettingsModule()
    const tempDir = await createTempDir()
    const settingsPath = join(tempDir, 'settings.json')

    const updated = await settingsModule.updateAppSettings(
      settingsPath,
      settingsModule.DEFAULT_APP_SETTINGS,
      { titleSyncMode: 'always', saveAsMode: 'move' },
    )

    expect(updated).toEqual({ titleSyncMode: 'always', saveAsMode: 'move' })
    expect(JSON.parse(await readFile(settingsPath, 'utf-8'))).toEqual({ titleSyncMode: 'always', saveAsMode: 'move' })
  })

  it('ignores unsupported app settings updates', async () => {
    const settingsModule = await loadSettingsModule()
    const tempDir = await createTempDir()
    const settingsPath = join(tempDir, 'settings.json')

    const updated = await settingsModule.updateAppSettings(
      settingsPath,
      { titleSyncMode: 'never', saveAsMode: 'switch' },
      {
        titleSyncMode: 'unsupported' as 'ask',
        saveAsMode: 'unsupported' as 'switch',
      },
    )

    expect(updated).toEqual({ titleSyncMode: 'never', saveAsMode: 'switch' })
    expect(JSON.parse(await readFile(settingsPath, 'utf-8'))).toEqual({ titleSyncMode: 'never', saveAsMode: 'switch' })
  })
})
