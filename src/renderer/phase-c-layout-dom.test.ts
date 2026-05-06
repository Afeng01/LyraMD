import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('Phase C layout DOM skeleton', () => {
  it('ships the shared Agent and outline context panel elements', () => {
    const html = readFileSync(join(process.cwd(), 'src/renderer/index.html'), 'utf8')
    const css = readFileSync(join(process.cwd(), 'src/renderer/themes/base.css'), 'utf8')
    const renderer = readFileSync(join(process.cwd(), 'src/renderer/main.ts'), 'utf8')

    expect(html).toContain('id="context-panel"')
    expect(html).toContain('id="context-panel-agent-tab"')
    expect(html).toContain('id="context-panel-outline-tab"')
    expect(html).toContain('id="agent-panel"')
    expect(html).toContain('id="agent-terminal-placeholder"')
    expect(html).toContain('id="outline-panel"')

    expect(css).toContain('#context-panel')
    expect(css).toContain('.context-panel-open')
    expect(css).toContain('.agent-panel-right')
    expect(css).toContain('.agent-panel-bottom')

    expect(renderer).toContain("let activeContextPanel: 'agent' | 'outline' = 'agent'")
    expect(renderer).toContain('resolveAgentPanelPlacement')
    expect(renderer).toContain('contextPanelAgentTab?.addEventListener')
  })
})
