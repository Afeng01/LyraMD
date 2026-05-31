import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('AI command palette regression', () => {
  it('ships centred palette overlay markup in index.html', () => {
    const html = readFileSync(join(process.cwd(), 'src/renderer/index.html'), 'utf8')

    expect(html).toContain('id="ai-command-overlay"')
    expect(html).toContain('id="ai-command-palette"')
    expect(html).toContain('role="dialog"')
    expect(html).toContain('aria-modal="true"')
    expect(html).toContain('aria-labelledby="ai-palette-title"')
    expect(html).toContain('id="ai-palette-title"')
    expect(html).toContain('id="ai-palette-close"')
    expect(html).toContain('id="ai-palette-selection"')
    expect(html).toContain('id="ai-palette-templates"')
    expect(html).toContain('id="ai-palette-instruction"')
    expect(html).toContain('id="ai-palette-status"')
    expect(html).toContain('id="ai-palette-result"')
    expect(html).toContain('id="ai-palette-run"')
    expect(html).toContain('id="ai-palette-replace"')
    expect(html).toContain('id="ai-palette-insert"')
    expect(html).toContain('id="ai-palette-copy"')
  })

  it('has dedicated palette CSS in base.css', () => {
    const css = readFileSync(join(process.cwd(), 'src/renderer/themes/base.css'), 'utf8')

    expect(css).toContain('#ai-command-overlay')
    expect(css).toContain('#ai-command-palette')
    expect(css).toContain('.ai-palette-header')
    expect(css).toContain('.ai-palette-selection-preview')
    expect(css).toContain('.ai-palette-templates')
    expect(css).toContain('.ai-palette-template-chip')
    expect(css).toContain('.ai-palette-field')
    expect(css).toContain('.ai-palette-status')
    expect(css).toContain('.ai-palette-actions')
    expect(css).toContain('.palette-button')
    expect(css).toContain('.palette-button.primary')
  })

  it('implements openAiPalette and closeAiPalette functions', () => {
    const renderer = readFileSync(join(process.cwd(), 'src/renderer/main.ts'), 'utf8')

    expect(renderer).toContain('const openAiPalette = (): void => {')
    expect(renderer).toContain('const closeAiPalette = (): void => {')
    expect(renderer).toContain('const renderAiPalette = (): void => {')
    expect(renderer).toContain('const selectAiPaletteTemplate = (templateId: string): void => {')
    expect(renderer).toContain('const buildAiPalettePrompt = (selection: string): string => {')
    expect(renderer).toContain('const runAiPalettePrompt = async (): Promise<void> => {')
    expect(renderer).toContain('const replaceAiPaletteResult = (): void => {')
    expect(renderer).toContain('const insertAiPaletteResultBelow = (): void => {')
    expect(renderer).toContain('const copyAiPaletteResult = async (): Promise<void> => {')
  })

  it('tracks aiPaletteOpen state instead of agentPanelOpen for palette lifecycle', () => {
    const renderer = readFileSync(join(process.cwd(), 'src/renderer/main.ts'), 'utf8')

    expect(renderer).toContain('let aiPaletteOpen = false')
    expect(renderer).toContain('let aiPaletteBusy = false')
    expect(renderer).toContain('let aiPaletteResultText = \'\'')
    expect(renderer).toContain('let aiPaletteActiveTemplateId: string | null = null')
  })

  it('routes toggleAgentPanel through openAiPalette (not old bottom/right panel toggle)', () => {
    const renderer = readFileSync(join(process.cwd(), 'src/renderer/main.ts'), 'utf8')

    // toggleAgentPanel is a shim that delegates to the palette
    expect(renderer).toMatch(/const toggleAgentPanel = \(\): void => \{\s*openAiPalette\(\)\s*\}/)
  })

  it('wires agent-toggle button click to openAiPalette', () => {
    const renderer = readFileSync(join(process.cwd(), 'src/renderer/main.ts'), 'utf8')

    const agentToggleIdx = renderer.indexOf("agentToggle?.addEventListener('click'")
    expect(agentToggleIdx).not.toBe(-1)
    const block = renderer.slice(agentToggleIdx, agentToggleIdx + 100)
    expect(block).toContain('openAiPalette()')
  })

  it('connects the native menu to the palette via preload and renderer', () => {
    const mainProcess = readFileSync(join(process.cwd(), 'src/main/index.ts'), 'utf8')
    const preload = readFileSync(join(process.cwd(), 'src/preload/index.ts'), 'utf8')
    const renderer = readFileSync(join(process.cwd(), 'src/renderer/main.ts'), 'utf8')

    expect(mainProcess).toContain("shortcutFor('openAiPalette')")
    expect(mainProcess).toContain("sendToFocused('menu-open-ai-palette')")
    expect(preload).toContain('onMenuOpenAiPalette')
    expect(renderer).toContain('api.onMenuOpenAiPalette')
  })

  it('connects the Windows menu tools panel to open-ai-palette', () => {
    const html = readFileSync(join(process.cwd(), 'src/renderer/index.html'), 'utf8')
    const renderer = readFileSync(join(process.cwd(), 'src/renderer/main.ts'), 'utf8')

    expect(html).toContain('data-windows-action="open-ai-palette"')
    expect(renderer).toContain("case 'open-ai-palette':")
  })

  it('binds Cmd/Ctrl+J to openAiPalette in the keydown handler', () => {
    const renderer = readFileSync(join(process.cwd(), 'src/renderer/main.ts'), 'utf8')

    expect(renderer).toContain("shortcutFor(appSettings, 'openAiPalette')")
    // The handler block immediately following the shortcut check must call openAiPalette
    const shortcutIdx = renderer.indexOf("shortcutFor(appSettings, 'openAiPalette')")
    const forwardBlock = renderer.slice(shortcutIdx, shortcutIdx + 120)
    expect(forwardBlock).toContain('openAiPalette()')
    expect(forwardBlock).toContain('event.preventDefault()')
  })

  it('closes the palette on Escape when aiPaletteOpen is true', () => {
    const renderer = readFileSync(join(process.cwd(), 'src/renderer/main.ts'), 'utf8')

    // The Escape handler should check aiPaletteOpen and call closeAiPalette
    expect(renderer).toMatch(/key === 'Escape' && aiPaletteOpen/)
    const escapeIdx = renderer.indexOf("key === 'Escape' && aiPaletteOpen")
    const escapeBlock = renderer.slice(escapeIdx, escapeIdx + 100)
    expect(escapeBlock).toContain('closeAiPalette()')
  })

  it('closes the palette on backdrop click', () => {
    const renderer = readFileSync(join(process.cwd(), 'src/renderer/main.ts'), 'utf8')

    expect(renderer).toContain("aiPaletteOverlay?.addEventListener('click'")
    expect(renderer).toContain('event.target === aiPaletteOverlay')
  })

  it('preserves the Cmd/Ctrl+Y shortcut rewrites selection using the existing AI helper', () => {
    const renderer = readFileSync(join(process.cwd(), 'src/renderer/main.ts'), 'utf8')

    expect(renderer).toContain("const runAiHelperShortcutRewrite = async (): Promise<void> => {")
    // The Cmd/Ctrl+Y handler should call runAiHelperShortcutRewrite, not openAiPalette
    const shortcutYIdx = renderer.indexOf("eventMatchesShortcut(event, 'CmdOrCtrl+Y')")
    const yBlock = renderer.slice(shortcutYIdx, shortcutYIdx + 120)
    expect(yBlock).toContain('runAiHelperShortcutRewrite()')
    expect(yBlock).not.toContain('openAiPalette()')
  })

  it('exposes openAiPalette shortcut in the settings dialog shortcut list', () => {
    const html = readFileSync(join(process.cwd(), 'src/renderer/index.html'), 'utf8')

    expect(html).toContain('data-shortcut-action="openAiPalette"')
    expect(html).toContain('打开 AI 精灵')
  })

  it('does not inject new CJK template strings inside palette functions', () => {
    const renderer = readFileSync(join(process.cwd(), 'src/renderer/main.ts'), 'utf8')

    // Locate the block from openAiPalette to the end of copyAiPaletteResult
    const paletteStart = renderer.indexOf('const openAiPalette = (): void => {')
    const copyEnd = renderer.indexOf('const copyAiPaletteResult = async (): Promise<void> => {')
    // Find the closing brace of copyAiPaletteResult
    const copyBlockStart = renderer.indexOf('{', copyEnd)
    let depth = 1
    let pos = copyBlockStart + 1
    while (depth > 0 && pos < renderer.length) {
      if (renderer[pos] === '{') depth++
      if (renderer[pos] === '}') depth--
      pos++
    }
    const paletteBlockEnd = pos

    const paletteBlock = renderer.slice(paletteStart, paletteBlockEnd)

    // Template assignment patterns that might carry CJK content
    // The palette should not define its own templates with CJK; it reuses getAiHelperTemplates()
    // We check that no {{selection}}-style CJK template strings appear in the palette block
    // that are NOT inside getAiHelperTemplates / createDefaultSettings
    // The block should NOT contain a fresh CJK template with a {{selection}} placeholder
    const cjkTemplatePattern = /[\u4e00-\u9fff]{4,}\s*\\n\\n\s*\{\{selection\}\}/
    expect(cjkTemplatePattern.test(paletteBlock)).toBe(false)
  })

  it('uses exclusively ASCII template IDs (no CJK in template identifiers)', () => {
    const renderer = readFileSync(join(process.cwd(), 'src/renderer/main.ts'), 'utf8')

    // Find all template id entries used by the palette — they come from getAiHelperTemplates()
    // Verify none of them contain CJK
    const templateIdMatches = renderer.match(/id:\s*'[^']+'/g) || []
    for (const match of templateIdMatches) {
      const id = match.replace(/^id:\s*'/, '').replace(/'$/, '')
      expect(id).not.toMatch(/[\u4e00-\u9fff]/)
    }
  })
})
