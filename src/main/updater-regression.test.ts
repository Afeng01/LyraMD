import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('auto update regression', () => {
  it('configures electron-updater for packaged GitHub Releases builds', () => {
    const updater = readFileSync(join(process.cwd(), 'src/main/updater.ts'), 'utf8')
    const builder = readFileSync(join(process.cwd(), 'electron-builder.yml'), 'utf8')

    expect(updater).toContain("from 'electron-updater'")
    expect(updater).toContain('autoUpdater.autoDownload = true')
    expect(updater).toContain('autoUpdater.checkForUpdates()')
    expect(updater).toContain('autoUpdater.quitAndInstall()')
    expect(updater).toContain('app.isPackaged')
    expect(builder).toContain('publish:')
    expect(builder).toContain('provider: github')
    expect(builder).toContain('owner: Afeng01')
    expect(builder).toContain('repo: LyraMD')
  })
})
