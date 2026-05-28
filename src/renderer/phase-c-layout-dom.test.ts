import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('Phase C layout DOM skeleton', () => {
  it('ships the shared Agent and outline context panel elements', () => {
    const html = readFileSync(join(process.cwd(), 'src/renderer/index.html'), 'utf8')
    const css = readFileSync(join(process.cwd(), 'src/renderer/themes/base.css'), 'utf8')
    const renderer = readFileSync(join(process.cwd(), 'src/renderer/main.ts'), 'utf8')

    expect(html).toContain('id="context-panel"')
    expect(html).toContain('id="agent-toggle"')
    expect(html).toContain('id="context-panel-resizer"')
    expect(html).toContain('id="agent-panel"')
    expect(html).toContain('id="ai-helper-template"')
    expect(html).toContain('id="ai-helper-copy-prompt"')
    expect(html).toContain('id="ai-helper-result"')
    expect(html).toContain('id="ai-helper-replace-selection"')
    expect(html).toContain('id="ai-helper-insert-below"')
    expect(html).toContain('id="agent-drawer"')
    expect(html).toContain('id="agent-drawer-resizer"')
    expect(html).toContain('id="ai-helper-panel"')
    expect(html).toContain('id="outline-panel"')
    expect(html).not.toContain('id="file-tabbar"')

    expect(css).toContain('#context-panel')
    expect(css).toContain('.context-panel-open')
    expect(css).toContain('.agent-panel-right')
    expect(css).toContain('.agent-panel-bottom')
    expect(css).toContain('#app-shell.agent-drawer-open #editor-shell')
    expect(css).not.toContain('--file-tabbar-height')
    expect(css).not.toContain('#file-tabbar')

    expect(renderer).toContain('let agentPanelOpen = false')
    expect(renderer).toContain("let activeContextPanel: ContextPanelMode = 'agent'")
    expect(renderer).toContain('resolveContextPanelState')
    expect(renderer).toContain('resolveAgentPanelPlacement')
    expect(renderer).toContain('agentToggle?.addEventListener')
    expect(renderer).toContain('getSelectedPlainText')
    expect(renderer).toContain('writeText(prompt)')
    expect(renderer).toContain('replaceSelectedText')
    expect(renderer).toContain('insertTextBelowSelection')
    expect(renderer).not.toContain('function renderFileTabs')
    expect(renderer).not.toContain('fileTabDraftId')
  })
})
