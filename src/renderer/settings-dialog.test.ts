import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { resolveShortcutConflict } from './settings-dialog'

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

  it('persists recorded shortcut changes through the shared app settings channel', () => {
    const file = readFileSync(join(process.cwd(), 'src/renderer/settings-dialog.ts'), 'utf8')
    const html = readFileSync(join(process.cwd(), 'src/renderer/index.html'), 'utf8')

    expect(html).toContain('data-shortcut-action="cleanCjkTypography"')
    expect(file).toContain('api.updateSettings({ shortcuts:')
  })

  it('detects shortcut conflicts before persisting a recorded shortcut', () => {
    const shortcuts = {
      save: 'CmdOrCtrl+S',
      saveAs: 'CmdOrCtrl+Shift+S',
      settings: 'CmdOrCtrl+,',
      search: 'CmdOrCtrl+F',
      toggleSidebar: 'CmdOrCtrl+\\',
      cleanCjkTypography: 'CmdOrCtrl+Shift+F',
    }

    expect(resolveShortcutConflict(shortcuts, 'cleanCjkTypography', 'CmdOrCtrl+F')).toBe('search')
    expect(resolveShortcutConflict(shortcuts, 'search', 'CmdOrCtrl+F')).toBeNull()
  })

  it('renders an inline shortcut conflict message target', () => {
    const file = readFileSync(join(process.cwd(), 'src/renderer/settings-dialog.ts'), 'utf8')
    const html = readFileSync(join(process.cwd(), 'src/renderer/index.html'), 'utf8')

    expect(html).toContain('id="settings-shortcut-conflict"')
    expect(file).toContain('showShortcutConflict')
  })
})
