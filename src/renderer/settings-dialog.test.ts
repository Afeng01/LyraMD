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
      toggleOutline: 'CmdOrCtrl+Shift+O',
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

  it('renders Codex MCP as a standalone integrations pane', () => {
    const file = readFileSync(join(process.cwd(), 'src/renderer/settings-dialog.ts'), 'utf8')
    const html = readFileSync(join(process.cwd(), 'src/renderer/index.html'), 'utf8')

    expect(html).toContain('data-settings-pane="integrations"')
    expect(html).toContain('data-settings-panel="integrations"')
    expect(html).toContain('Codex MCP')
    expect(file).toContain("activePane === 'integrations'")
  })

  it('renders Codex MCP usage help and keeps integration controls compact', () => {
    const html = readFileSync(join(process.cwd(), 'src/renderer/index.html'), 'utf8')
    const css = readFileSync(join(process.cwd(), 'src/renderer/themes/base.css'), 'utf8')

    expect(html).toContain('settings-integration-help')
    expect(html).toContain('在 Codex 里请求它使用 LyraMD MCP 读取或写入当前文档')
    expect(css).toContain('-webkit-app-region: drag')
    expect(css).toContain('text-overflow: ellipsis')
    expect(css).toContain('white-space: nowrap')
  })

  it('renders compact background appearance controls', () => {
    const file = readFileSync(join(process.cwd(), 'src/renderer/settings-dialog.ts'), 'utf8')
    const html = readFileSync(join(process.cwd(), 'src/renderer/index.html'), 'utf8')

    expect(html).toContain('name="settings-background-scope"')
    expect(html).toContain('value="editor"')
    expect(html).toContain('value="window"')
    expect(html).toContain('name="settings-background-mode"')
    expect(html).toContain('id="settings-background-opacity"')
    expect(html).toContain('id="settings-background-blur"')
    expect(html).toContain('id="settings-background-dim"')
    expect(html).toContain('id="settings-background-reset"')
    expect(file).toContain('api.updateSettings({ background })')
  })

  it('applies background settings through renderer CSS variables', () => {
    const renderer = readFileSync(join(process.cwd(), 'src/renderer/main.ts'), 'utf8')
    const css = readFileSync(join(process.cwd(), 'src/renderer/themes/base.css'), 'utf8')

    expect(renderer).toContain('function applyBackgroundSettings')
    expect(renderer).toContain("root.dataset.backgroundScope = background.scope")
    expect(renderer).toContain("--lyra-bg-image")
    expect(css).toContain(':root[data-background-scope="editor"]')
    expect(css).toContain(':root[data-background-scope="window"]')
    expect(css).toContain('#app-shell.context-panel-open.agent-panel-bottom #editor-shell')
  })
})
