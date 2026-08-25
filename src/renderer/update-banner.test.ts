import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { planUpdateBanner } from './update-banner'
import type { UpdateBannerPayload } from '../main/update-notice'

function availableAuto(version = '1.4.0'): UpdateBannerPayload {
  return { kind: 'available', mode: 'auto', version, detail: null, downloadUrl: null, releaseUrl: null }
}

describe('update banner planner', () => {
  it('auto updates announce background download with skip only', () => {
    const plan = planUpdateBanner(availableAuto())
    expect(plan.title).toContain('1.4.0')
    expect(plan.primary).toBeNull()
    expect(plan.secondary).toBeNull()
    expect(plan.showSkip).toBe(true)
  })

  it('unsigned macOS builds offer DMG download and release page', () => {
    const plan = planUpdateBanner({
      kind: 'available',
      mode: 'manual-mac',
      version: '1.4.0',
      detail: null,
      downloadUrl: 'https://example.com/LyraMD-1.4.0-arm64.dmg',
      releaseUrl: 'https://github.com/Afeng01/LyraMD/releases',
    })
    expect(plan.title).toContain('1.4.0')
    expect(plan.primary?.label).toBe('下载 DMG')
    expect(plan.primary?.action).toBe('download')
    expect(plan.secondary?.label).toBe('打开发布页')
    expect(plan.secondary?.action).toBe('open-release-url')
    expect(plan.showSkip).toBe(true)

    // 没有 DMG 资产时退化为仅发布页入口
    const withoutDmg = planUpdateBanner({ ...availableAuto(), kind: 'available', mode: 'manual-mac', downloadUrl: null, releaseUrl: 'https://github.com/Afeng01/LyraMD/releases' })
    expect(withoutDmg.primary).toBeNull()
    expect(withoutDmg.secondary?.label).toBe('打开发布页')
  })

  it('downloaded updates offer restart-to-install and cannot be skipped', () => {
    const plan = planUpdateBanner({ ...availableAuto(), kind: 'downloaded' })
    expect(plan.title).toBe('LyraMD 更新已就绪')
    expect(plan.primary?.label).toBe('重启并安装')
    expect(plan.primary?.action).toBe('install')
    expect(plan.secondary).toBeNull()
    expect(plan.showSkip).toBe(false)
  })
})

describe('update banner surface wiring', () => {
  const html = readFileSync(join(process.cwd(), 'src/renderer/index.html'), 'utf8')
  const preload = readFileSync(join(process.cwd(), 'src/preload/index.ts'), 'utf8')
  const css = readFileSync(join(process.cwd(), 'src/renderer/themes/base.css'), 'utf8')
  const mainProcess = readFileSync(join(process.cwd(), 'src/main/index.ts'), 'utf8')

  it('keeps markup ids in sync with the controller queries', () => {
    for (const id of [
      'update-banner',
      'update-banner-title',
      'update-banner-meta',
      'update-banner-primary',
      'update-banner-secondary',
      'update-banner-skip',
      'update-banner-close',
    ]) {
      expect(html).toContain(`id="${id}"`)
    }
    // 横幅容器与按钮样式必须存在，且隐藏态真正不占位
    expect(css).toMatch(/#update-banner \{/)
    expect(css).toMatch(/#update-banner\[hidden\] \{[^}]+display: none;/)
    expect(css).toMatch(/#update-banner-actions \{/)
    expect(css).toMatch(/\.update-banner-button \{/)
  })

  it('exposes the banner channels through preload and main IPC handlers', () => {
    expect(preload).toContain("ipcRenderer.on('update-banner'")
    expect(preload).toContain("ipcRenderer.invoke('update-download')")
    expect(preload).toContain("ipcRenderer.invoke('update-install')")
    expect(preload).toContain("ipcRenderer.invoke('update-skip-version', version)")
    expect(mainProcess).toContain("ipcMain.handle('update-download'")
    expect(mainProcess).toContain("ipcMain.handle('update-install'")
    expect(mainProcess).toContain("ipcMain.handle('update-skip-version'")
  })

  it('persists skip state and opens release notes once via release-notice.json', () => {
    expect(mainProcess).toContain("join(appDataDir, 'release-notice.json')")
    expect(mainProcess).toContain('maybeOpenReleaseNotesOnce')
    expect(mainProcess).toContain("openSettingsWindow('release-notes')")
  })
})
