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
    expect(settings.font).toEqual({
      customFamily: '',
      preset: 'theme',
    })
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

  it('normalizes supported editor font presets and custom font families', async () => {
    const settingsModule = await loadSettingsModule()

    expect(settingsModule.normalizeAppSettings({
      font: {
        preset: 'serif',
        customFamily: 'Georgia, Songti SC, serif',
      },
    }).font).toEqual({
      preset: 'serif',
      customFamily: 'Georgia, Songti SC, serif',
    })

    expect(settingsModule.normalizeAppSettings({
      font: {
        preset: 'custom',
        customFamily: '',
      },
    }).font).toEqual(settingsModule.DEFAULT_APP_SETTINGS.font)
  })

  it('normalizes AI helper prompt templates and keeps usable custom prompts', async () => {
    const settingsModule = await loadSettingsModule()

    const settings = settingsModule.normalizeAppSettings({
      aiHelper: {
        templates: [
          {
            id: 'custom-polish',
            title: '  轻润色  ',
            prompt: '  请润色：{{selection}}  ',
          },
          {
            id: '',
            title: '无效',
            prompt: '没有稳定 id',
          },
          {
            id: 'bad',
            title: '',
            prompt: '没有标题',
          },
        ],
      },
    })

    expect(settings.aiHelper.templates).toEqual([
      {
        id: 'custom-polish',
        title: '轻润色',
        prompt: '请润色：{{selection}}',
      },
    ])
  })

  it('falls back to default AI helper prompts when persisted templates are unusable', async () => {
    const settingsModule = await loadSettingsModule()

    expect(settingsModule.normalizeAppSettings({
      aiHelper: {
        templates: [
          { id: 'x', title: 'x', prompt: '' },
        ],
      },
    }).aiHelper).toEqual(settingsModule.DEFAULT_APP_SETTINGS.aiHelper)
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

  it('persists supported AI helper prompt templates', async () => {
    const settingsModule = await loadSettingsModule()
    const tempDir = await createTempDir()
    const settingsPath = join(tempDir, 'settings.json')

    const updated = await settingsModule.updateAppSettings(
      settingsPath,
      settingsModule.DEFAULT_APP_SETTINGS,
      {
        aiHelper: {
          templates: [
            {
              id: 'meeting-summary',
              title: '会议纪要',
              prompt: '把选区整理成会议纪要：{{selection}}',
            },
          ],
        },
      },
    )

    expect(updated.aiHelper.templates).toEqual([
      {
        id: 'meeting-summary',
        title: '会议纪要',
        prompt: '把选区整理成会议纪要：{{selection}}',
      },
    ])
    expect(JSON.parse(await readFile(settingsPath, 'utf-8')).aiHelper.templates).toEqual(updated.aiHelper.templates)
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
