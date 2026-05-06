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

  it('preserves a persisted theme name alongside other app settings', async () => {
    const settingsModule = await loadSettingsModule()
    const tempDir = await createTempDir()
    const settingsPath = join(tempDir, 'settings.json')
    await writeFile(settingsPath, JSON.stringify({
      titleSyncMode: 'always',
      saveAsMode: 'move',
      themeName: 'newsprint',
    }), 'utf-8')

    const settings = await settingsModule.loadAppSettings(settingsPath)

    expect(settings).toEqual({
      ...settingsModule.DEFAULT_APP_SETTINGS,
      titleSyncMode: 'always',
      saveAsMode: 'move',
      themeName: 'newsprint',
    })
  })

  it('normalizes phase c layout defaults', async () => {
    const settingsModule = await loadSettingsModule()

    const settings = settingsModule.normalizeAppSettings({})

    expect(settings.agentPanelPosition).toBe('auto')
    expect(settings.background.mode).toBe('default')
    expect(settings.background.scope).toBe('editor')
  })

  it('rejects invalid background settings', async () => {
    const settingsModule = await loadSettingsModule()

    const settings = settingsModule.normalizeAppSettings({
      background: {
        mode: 'image',
        scope: 'everything',
        opacity: 3,
        blur: -1,
        dim: 2,
      },
    } as never)

    expect(settings.background.scope).toBe('editor')
    expect(settings.background.opacity).toBeLessThanOrEqual(1)
    expect(settings.background.blur).toBeGreaterThanOrEqual(0)
    expect(settings.background.dim).toBeLessThanOrEqual(1)
  })

  it('loads default shortcuts when none are persisted', async () => {
    const settingsModule = await loadSettingsModule()
    const tempDir = await createTempDir()
    const settingsPath = join(tempDir, 'settings.json')

    const settings = await settingsModule.loadAppSettings(settingsPath)

    expect(settings.shortcuts).toEqual(settingsModule.DEFAULT_SHORTCUTS)
  })

  it('preserves supported shortcut overrides while filling missing defaults', async () => {
    const settingsModule = await loadSettingsModule()
    const tempDir = await createTempDir()
    const settingsPath = join(tempDir, 'settings.json')
    await writeFile(settingsPath, JSON.stringify({
      titleSyncMode: 'ask',
      saveAsMode: 'switch',
      themeName: 'elegant',
      shortcuts: {
        cleanCjkTypography: 'CmdOrCtrl+Alt+K',
      },
    }), 'utf-8')

    const settings = await settingsModule.loadAppSettings(settingsPath)

    expect(settings.shortcuts).toEqual({
      ...settingsModule.DEFAULT_SHORTCUTS,
      cleanCjkTypography: 'CmdOrCtrl+Alt+K',
    })
  })

  it('rejects malformed shortcut overrides', async () => {
    const settingsModule = await loadSettingsModule()
    const tempDir = await createTempDir()
    const settingsPath = join(tempDir, 'settings.json')
    await writeFile(settingsPath, JSON.stringify({
      shortcuts: {
        save: 'not a shortcut',
        search: 'CmdOrCtrl+F',
      },
    }), 'utf-8')

    const settings = await settingsModule.loadAppSettings(settingsPath)

    expect(settings.shortcuts).toEqual(settingsModule.DEFAULT_SHORTCUTS)
  })

  it('rejects persisted shortcut overrides that conflict with another action', async () => {
    const settingsModule = await loadSettingsModule()
    const tempDir = await createTempDir()
    const settingsPath = join(tempDir, 'settings.json')
    await writeFile(settingsPath, JSON.stringify({
      shortcuts: {
        cleanCjkTypography: settingsModule.DEFAULT_SHORTCUTS.search,
      },
    }), 'utf-8')

    const settings = await settingsModule.loadAppSettings(settingsPath)

    expect(settings.shortcuts).toEqual(settingsModule.DEFAULT_SHORTCUTS)
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

    expect(updated).toEqual({
      ...settingsModule.DEFAULT_APP_SETTINGS,
      titleSyncMode: 'always',
      saveAsMode: 'move',
    })
    expect(JSON.parse(await readFile(settingsPath, 'utf-8'))).toEqual({
      ...settingsModule.DEFAULT_APP_SETTINGS,
      titleSyncMode: 'always',
      saveAsMode: 'move',
    })
  })

  it('ignores unsupported app settings updates', async () => {
    const settingsModule = await loadSettingsModule()
    const tempDir = await createTempDir()
    const settingsPath = join(tempDir, 'settings.json')

    const updated = await settingsModule.updateAppSettings(
      settingsPath,
      {
        ...settingsModule.DEFAULT_APP_SETTINGS,
        titleSyncMode: 'never',
        saveAsMode: 'switch',
      },
      {
        titleSyncMode: 'unsupported' as 'ask',
        saveAsMode: 'unsupported' as 'switch',
      },
    )

    expect(updated).toEqual({
      ...settingsModule.DEFAULT_APP_SETTINGS,
      titleSyncMode: 'never',
      saveAsMode: 'switch',
    })
    expect(JSON.parse(await readFile(settingsPath, 'utf-8'))).toEqual({
      ...settingsModule.DEFAULT_APP_SETTINGS,
      titleSyncMode: 'never',
      saveAsMode: 'switch',
    })
  })

  it('persists theme name updates', async () => {
    const settingsModule = await loadSettingsModule()
    const tempDir = await createTempDir()
    const settingsPath = join(tempDir, 'settings.json')

    const updated = await settingsModule.updateAppSettings(
      settingsPath,
      settingsModule.DEFAULT_APP_SETTINGS,
      { themeName: 'dark' },
    )

    expect(updated).toEqual({
      ...settingsModule.DEFAULT_APP_SETTINGS,
      themeName: 'dark',
    })
    expect(JSON.parse(await readFile(settingsPath, 'utf-8'))).toEqual({
      ...settingsModule.DEFAULT_APP_SETTINGS,
      themeName: 'dark',
    })
  })

  it('persists supported shortcut updates', async () => {
    const settingsModule = await loadSettingsModule()
    const tempDir = await createTempDir()
    const settingsPath = join(tempDir, 'settings.json')

    const updated = await settingsModule.updateAppSettings(
      settingsPath,
      settingsModule.DEFAULT_APP_SETTINGS,
      { shortcuts: { cleanCjkTypography: 'CmdOrCtrl+Alt+K' } },
    )

    expect(updated.shortcuts.cleanCjkTypography).toBe('CmdOrCtrl+Alt+K')
    expect(JSON.parse(await readFile(settingsPath, 'utf-8')).shortcuts.cleanCjkTypography).toBe('CmdOrCtrl+Alt+K')
  })

  it('rejects shortcut updates that conflict with another action', async () => {
    const settingsModule = await loadSettingsModule()
    const tempDir = await createTempDir()
    const settingsPath = join(tempDir, 'settings.json')

    const updated = await settingsModule.updateAppSettings(
      settingsPath,
      settingsModule.DEFAULT_APP_SETTINGS,
      { shortcuts: { cleanCjkTypography: settingsModule.DEFAULT_SHORTCUTS.search } },
    )

    expect(updated.shortcuts).toEqual(settingsModule.DEFAULT_SHORTCUTS)
    expect(JSON.parse(await readFile(settingsPath, 'utf-8')).shortcuts).toEqual(settingsModule.DEFAULT_SHORTCUTS)
  })
})
