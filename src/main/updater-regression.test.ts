import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { findMacDmgAsset, isNewerVersion } from './update-release'

describe('auto update regression', () => {
  it('configures electron-updater for packaged non-macOS GitHub Releases builds', () => {
    const updater = readFileSync(join(process.cwd(), 'src/main/updater.ts'), 'utf8')
    const builder = readFileSync(join(process.cwd(), 'electron-builder.yml'), 'utf8')

    expect(updater).toContain("from 'electron-updater'")
    expect(updater).toContain("process.platform === 'darwin'")
    expect(updater).toContain('autoUpdater.autoDownload = true')
    expect(updater).toContain('autoUpdater.checkForUpdates()')
    expect(updater).toContain('autoUpdater.quitAndInstall()')
    expect(updater).toContain('app.isPackaged')
    expect(builder).toContain('publish:')
    expect(builder).toContain('provider: github')
    expect(builder).toContain('owner: Afeng01')
    expect(builder).toContain('repo: LyraMD')
  })

  it('uses a manual DMG fallback for unsigned macOS builds', () => {
    const updater = readFileSync(join(process.cwd(), 'src/main/updater.ts'), 'utf8')
    const release = readFileSync(join(process.cwd(), 'src/main/update-release.ts'), 'utf8')

    expect(updater).toContain('checkForManualMacUpdate')
    expect(updater).toContain("['下载 DMG', '打开 Release 页面', '稍后']")
    expect(updater).toContain('shell.openExternal(downloadUrl)')
    expect(release).toContain('https://api.github.com/repos/Afeng01/LyraMD/releases/latest')
    expect(release).toContain("asset.name.endsWith('.dmg')")
  })

  it('compares semantic release versions conservatively', () => {
    expect(isNewerVersion('v1.3.7', '1.3.6')).toBe(true)
    expect(isNewerVersion('1.4.0', '1.3.9')).toBe(true)
    expect(isNewerVersion('1.3.6', '1.3.6')).toBe(false)
    expect(isNewerVersion('1.3.5', '1.3.6')).toBe(false)
    expect(isNewerVersion('not-a-version', '1.3.6')).toBe(false)
  })

  it('selects the architecture-matching macOS DMG asset when present', () => {
    expect(findMacDmgAsset([
      { name: 'LyraMD-1.3.7-x64.dmg', browser_download_url: 'x64' },
      { name: 'LyraMD-1.3.7-arm64.dmg', browser_download_url: 'arm64' },
    ], 'arm64')?.browser_download_url).toBe('arm64')
    expect(findMacDmgAsset([
      { name: 'LyraMD-1.3.7-arm64.zip', browser_download_url: 'zip' },
      { name: 'LyraMD-1.3.7-arm64.dmg', browser_download_url: 'dmg' },
    ], 'x64')?.browser_download_url).toBe('dmg')
  })
})
