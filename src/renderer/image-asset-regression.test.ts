import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('image asset integration regression', () => {
  it('keeps the preload bridge and renderer shell hooks for image assets and rich copy', () => {
    const preload = readFileSync(join(process.cwd(), 'src/preload/index.ts'), 'utf8')
    const renderer = readFileSync(join(process.cwd(), 'src/renderer/main.ts'), 'utf8')
    const settingsDialog = readFileSync(join(process.cwd(), 'src/renderer/settings-dialog.ts'), 'utf8')
    const html = readFileSync(join(process.cwd(), 'src/renderer/index.html'), 'utf8')

    expect(preload).toContain('persistImageAsset')
    expect(preload).toContain('readLocalImageAsDataUrl')
    expect(renderer).toContain('appSettings.embedLocalImagesOnCopy')
    expect(renderer).toContain('api.persistImageAsset')
    expect(renderer).toContain('api.readLocalImageAsDataUrl')
    expect(renderer).toContain("target?.closest('#editor')")
    expect(settingsDialog).toContain('settings-embed-local-images-on-copy')
    expect(html).toContain('settings-embed-local-images-on-copy')
  })

  it('re-renders relative images after sidebar state catches up with the newly opened document path', () => {
    const renderer = readFileSync(join(process.cwd(), 'src/renderer/main.ts'), 'utf8')
    const sidebarStateHandler = renderer.match(/api\.onSidebarState\(\(state\) => \{[\s\S]*?\n\s*\}\)/)

    expect(sidebarStateHandler?.[0]).toContain('setSidebarState(state)')
    expect(sidebarStateHandler?.[0]).toContain('refreshRenderedMedia()')
  })
})
