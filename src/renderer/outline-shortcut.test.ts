import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('outline shortcut affordance', () => {
  const html = readFileSync(join(process.cwd(), 'src/renderer/index.html'), 'utf8')
  const main = readFileSync(join(process.cwd(), 'src/main/index.ts'), 'utf8')
  const renderer = readFileSync(join(process.cwd(), 'src/renderer/main.ts'), 'utf8')

  it('keeps the outline shortcut wired in the native menu and renderer key handler', () => {
    expect(main).toContain("accelerator: 'CmdOrCtrl+Shift+O'")
    expect(renderer).toContain("event.key.toLowerCase() === 'o'")
    expect(renderer).toContain('toggleOutlinePanel()')
  })

  it('shows the outline shortcut on the toolbar button and settings shortcut list', () => {
    expect(html).toMatch(/id="outline-toggle"[^>]*title="打开大纲 \(Cmd\/Ctrl\+Shift\+O\)"/)
    expect(html).toContain('<span class="settings-shortcut-label">打开大纲</span>')
    expect(html).toContain('<kbd class="settings-shortcut-key">Cmd/Ctrl+Shift+O</kbd>')
  })
})
