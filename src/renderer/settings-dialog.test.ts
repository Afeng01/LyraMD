import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('settings dialog regression', () => {
  it('keeps renderer-side default app settings aligned with persisted theme support', () => {
    const file = readFileSync(join(process.cwd(), 'src/renderer/main.ts'), 'utf8')

    expect(file).toContain("themeName: 'elegant'")
  })

  it('does not depend on window.process when formatting shortcut recordings', () => {
    const file = readFileSync(join(process.cwd(), 'src/renderer/settings-dialog.ts'), 'utf8')

    expect(file).not.toContain('window.process.platform')
  })

  it('persists theme changes through the shared app settings channel', () => {
    const file = readFileSync(join(process.cwd(), 'src/renderer/settings-dialog.ts'), 'utf8')

    expect(file).toContain('api.updateSettings({ themeName')
  })
})
