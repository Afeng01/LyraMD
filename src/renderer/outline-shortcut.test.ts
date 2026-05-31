import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('outline shortcut affordance', () => {
  const html = readFileSync(join(process.cwd(), 'src/renderer/index.html'), 'utf8')
  const main = readFileSync(join(process.cwd(), 'src/main/index.ts'), 'utf8')
  const renderer = readFileSync(join(process.cwd(), 'src/renderer/main.ts'), 'utf8')
  const css = readFileSync(join(process.cwd(), 'src/renderer/themes/base.css'), 'utf8')

  it('keeps the outline shortcut wired in the native menu and renderer key handler', () => {
    expect(main).toContain("shortcutFor('toggleOutline')")
    expect(renderer).toContain("shortcutFor(appSettings, 'toggleOutline')")
    expect(renderer).toContain('toggleOutlinePanel()')
  })

  it('shows the outline shortcut on the toolbar button and settings shortcut list', () => {
    expect(html).toMatch(/id="outline-toggle"[^>]*title="打开大纲 \(Cmd\/Ctrl\+Shift\+O\)"/)
    expect(html).toContain('<span class="settings-shortcut-label">打开大纲</span>')
    expect(html).toContain('<kbd class="settings-shortcut-key" data-shortcut-action="toggleOutline">Cmd/Ctrl+Shift+O</kbd>')
  })

  it('keeps the outline panel mounted so open and close can slide', () => {
    expect(css).toContain('#app-shell.context-panel-open.agent-panel-right #context-panel')
    expect(css).toContain('#app-shell.context-panel-open.context-panel-outline #context-panel')
    expect(css).toMatch(/#context-panel[\s\S]*transition:.*(?:width|transform)/)
    expect(renderer).toContain("setContextPanelMode('outline')")
    expect(renderer).toContain('outlinePanel.hidden = !showOutlineInRightPanel')
  })

  it('places top-right AI and outline controls close to the window edge', () => {
    expect(css).toMatch(/#agent-toggle\s*\{[\s\S]*right:\s*56px/)
    expect(css).toMatch(/#outline-toggle\s*\{[\s\S]*right:\s*24px/)
  })
})
