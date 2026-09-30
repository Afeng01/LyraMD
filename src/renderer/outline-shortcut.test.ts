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

  it('keeps the outline shortcut in settings and removes the standalone toolbar button', () => {
    expect(html).not.toContain('id="outline-toggle"')
    expect(html).toContain('id="outline-tab"')
    expect(html).toContain('<span class="settings-shortcut-label">打开大纲</span>')
    expect(html).toContain('<kbd class="settings-shortcut-key" data-shortcut-action="toggleOutline">Cmd/Ctrl+Shift+O</kbd>')
  })

  it('switches the outline inside the sidebar instead of opening a context drawer', () => {
    expect(html).toContain('<section id="outline-panel"')
    expect(css).toContain('#sidebar #outline-panel')
    expect(css).toContain('#app-shell.context-panel-open.agent-panel-right #context-panel')
    expect(css).not.toContain('.context-panel-outline')
    expect(renderer).toContain("selectSidebarTab('outline')")
    expect(renderer).toContain('outlinePanel.hidden = isWorkdirView')
    expect(renderer).toContain("if (sidebarState?.activeSidebarTab === 'outline') renderOutlinePanel()")
  })

  it('keeps the AI control in the top-right titlebar area (agent first, safety beside it)', () => {
    expect(css).toMatch(/#agent-toggle\s*\{[\s\S]*right:\s*16px/)
    expect(css).toMatch(/body\.platform-win32 #agent-toggle\s*\{[\s\S]*right:\s*130px/)
    expect(css).not.toContain('#outline-toggle')
    expect(html).not.toContain('agent-activity-dot')
    expect(css).not.toContain('#agent-activity-dot')
  })
})
