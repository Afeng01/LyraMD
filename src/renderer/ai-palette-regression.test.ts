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
    expect(html).toContain('id="ai-palette-search"')
    expect(html).toContain('id="ai-palette-chips"')
    expect(html).toContain('id="ai-palette-list"')
    expect(html).toContain('id="ai-palette-status"')
    expect(html).toContain('class="ai-palette-footer"')
    expect(html).toContain('id="ai-palette-provider-link"')
    expect(html).toContain('范围：')
    expect(html).not.toContain('id="ai-palette-result"')
    expect(html).not.toContain('id="ai-palette-replace"')
    expect(html).not.toContain('id="ai-palette-insert"')
    expect(html).not.toContain('id="ai-palette-copy"')
  })

  it('has dedicated palette CSS in base.css', () => {
    const css = readFileSync(join(process.cwd(), 'src/renderer/themes/base.css'), 'utf8')

    expect(css).toContain('#ai-command-overlay')
    expect(css).toContain('#ai-command-palette')
    expect(css).toContain('.ai-palette-header')
    expect(css).toContain('.ai-palette-search')
    expect(css).toContain('.ai-palette-chips')
    expect(css).toContain('.ai-palette-chip')
    expect(css).toContain('.ai-palette-list')
    expect(css).toContain('.ai-palette-item')
    expect(css).toContain('.ai-palette-footer')
    expect(css).toContain('.ai-palette-status')
    expect(css).toContain('.ai-suggestion-ghost')
    expect(css).toContain('.ai-suggestion-original')
    expect(css).toContain('.ai-suggestion-actions')
  })

  it('keeps the palette compact and scrolls surplus commands inside the list', () => {
    const css = readFileSync(join(process.cwd(), 'src/renderer/themes/base.css'), 'utf8')
    const overlayRule = css.match(/#ai-command-overlay\s*\{[\s\S]*?\}/)?.[0] ?? ''
    const paletteRule = css.match(/#ai-command-palette\s*\{[\s\S]*?\}/)?.[0] ?? ''
    const listRule = css.match(/\.ai-palette-list\s*\{[\s\S]*?\}/)?.[0] ?? ''

    expect(overlayRule).toContain('align-items: center')
    expect(overlayRule).toContain('padding: 24px 16px')
    expect(paletteRule).toContain('width: min(560px, calc(100vw - 32px))')
    expect(paletteRule).toContain('max-height: min(460px, calc(100vh - 220px))')
    expect(listRule).toContain('min-height: 0')
    expect(listRule).toContain('overflow: auto')
  })

  it('tightens the search field and command rows to avoid an oversized palette', () => {
    const css = readFileSync(join(process.cwd(), 'src/renderer/themes/base.css'), 'utf8')
    const headerRule = css.match(/\.ai-palette-header\s*\{[\s\S]*?\}/)?.[0] ?? ''
    const searchRule = css.match(/\.ai-palette-search\s*\{[\s\S]*?\}/)?.[0] ?? ''
    const itemRule = css.match(/\.ai-palette-item\s*\{[\s\S]*?\}/)?.[0] ?? ''
    const footerRule = css.match(/\.ai-palette-footer\s*\{[\s\S]*?\}/)?.[0] ?? ''

    expect(headerRule).toContain('min-height: 52px')
    expect(headerRule).toContain('padding: 10px 14px 8px')
    expect(searchRule).toContain('min-height: 30px')
    expect(searchRule).toContain('max-height: 72px')
    expect(searchRule).toContain('font-size: 14px')
    expect(itemRule).toContain('min-height: 48px')
    expect(itemRule).toContain('padding: 7px 8px')
    expect(footerRule).toContain('min-height: 30px')
    expect(footerRule).toContain('padding: 6px 14px')
  })

  it('keeps palette scrollbars visually hidden until the command list is active', () => {
    const css = readFileSync(join(process.cwd(), 'src/renderer/themes/base.css'), 'utf8')

    expect(css).toContain('.ai-palette-list::-webkit-scrollbar-thumb')
    expect(css).toContain('background: transparent')
    expect(css).toContain('.ai-palette-list:hover::-webkit-scrollbar-thumb')
    expect(css).toContain('.ai-palette-list:focus-within::-webkit-scrollbar-thumb')
  })

  it('keeps the page behind the AI palette clear instead of blurred', () => {
    const css = readFileSync(join(process.cwd(), 'src/renderer/themes/base.css'), 'utf8')
    const overlayRule = css.match(/#ai-command-overlay\s*\{[\s\S]*?\}/)?.[0] ?? ''

    expect(overlayRule).toContain('background: transparent')
    expect(overlayRule).not.toContain('backdrop-filter')
  })

  it('implements openAiPalette and closeAiPalette functions', () => {
    const renderer = readFileSync(join(process.cwd(), 'src/renderer/main.ts'), 'utf8')

    expect(renderer).toContain('const openAiPalette = (): void => {')
    expect(renderer).toContain('const closeAiPalette = (options: { restoreFocus?: boolean } = {}): void => {')
    expect(renderer).toContain('const renderAiPalette = (): void => {')
    expect(renderer).toContain('const selectAiPaletteTemplate = (templateId: string): void => {')
    expect(renderer).toContain('const buildAiPalettePrompt = (selection: string): string => {')
    expect(renderer).toContain('const runAiPalettePrompt = async (): Promise<void> => {')
    expect(renderer).not.toContain('const replaceAiPaletteResult = (): void => {')
    expect(renderer).not.toContain('const insertAiPaletteResultBelow = (): void => {')
    expect(renderer).not.toContain('const copyAiPaletteResult = async (): Promise<void> => {')
  })

  it('tracks aiPaletteOpen state instead of agentPanelOpen for palette lifecycle', () => {
    const renderer = readFileSync(join(process.cwd(), 'src/renderer/main.ts'), 'utf8')

    expect(renderer).toContain('let aiPaletteOpen = false')
    expect(renderer).toContain('let aiPaletteBusy = false')
    expect(renderer).toContain('let aiPaletteActiveTemplateId: string | null = null')
    expect(renderer).toContain('let aiPaletteSelectedIndex = 0')
  })

  it('renders recently used and built-in category sections in the palette', () => {
    const renderer = readFileSync(join(process.cwd(), 'src/renderer/main.ts'), 'utf8')

    expect(renderer).toContain("appendSection('最近使用')")
    expect(renderer).toContain('getAiPaletteTemplateCategory')
    expect(renderer).toContain('getAiPaletteCategoryLabel')
    expect(renderer).toContain("return 'EDITING'")
    expect(renderer).toContain("return 'TOOLS'")
    expect(renderer).toContain("if (['rephrase', 'expand', 'vivid'].includes(templateId)) return 'CREATIVE'")
    expect(renderer).toContain("if (templateId === 'expand') return 'Develop idea into fuller prose'")
  })

  it('creates editor inline suggestion preview after AI completes', () => {
    const renderer = readFileSync(join(process.cwd(), 'src/renderer/main.ts'), 'utf8')
    const editor = readFileSync(join(process.cwd(), 'src/renderer/editor/editor.ts'), 'utf8')

    expect(renderer).toContain('const selectionSnapshot = getSelectedTextSnapshot()')
    expect(renderer).toContain('createAiSuggestionFromSnapshot(result.text, selectionSnapshot)')
    expect(renderer).toContain('hideAiPaletteForBackgroundRun()')
    expect(renderer).not.toContain('aiPaletteResultText = result.text')
    expect(editor).toContain('function createAiSuggestionPlugin(): Plugin')
    expect(editor).toContain('export function createAiSuggestionFromSelection')
    expect(editor).toContain('export function getSelectedTextSnapshot')
    expect(editor).toContain('export function createAiSuggestionFromSnapshot')
    expect(editor).toContain('currentText !== snapshot.text')
    expect(editor).toContain('export function acceptAiSuggestion')
    expect(editor).toContain('export function rejectAiSuggestion')
    expect(editor).toContain('class: \'ai-suggestion-original\'')
    expect(editor).toContain('ai-suggestion-ghost')
  })

  it('routes toggleAgentPanel through openAiPalette (not old bottom/right panel toggle)', () => {
    const renderer = readFileSync(join(process.cwd(), 'src/renderer/main.ts'), 'utf8')

    // toggleAgentPanel is a shim that delegates to the palette
    expect(renderer).toMatch(/const toggleAgentPanel = \(\): void => \{\s*openAiPalette\(\)\s*\}/)
  })

  it('keeps a refined top-right AI palette button without the old sparkle cluster icon', () => {
    const html = readFileSync(join(process.cwd(), 'src/renderer/index.html'), 'utf8')
    const renderer = readFileSync(join(process.cwd(), 'src/renderer/main.ts'), 'utf8')

    expect(html).toContain('id="agent-toggle"')
    expect(html).toContain('aria-label="AI 精灵"')
    expect(html).toContain('title="AI 精灵 (Cmd/Ctrl+J)"')
    expect(html).not.toContain('M9 2.8l.78 2.1 2.1.78')
    expect(html).not.toContain('id="agent-dot"')
    expect(renderer).toContain("agentToggle?.addEventListener('click'")
  })

  it('restores a standalone breathing activity light in the upper-right corner', () => {
    const renderer = readFileSync(join(process.cwd(), 'src/renderer/main.ts'), 'utf8')
    const css = readFileSync(join(process.cwd(), 'src/renderer/themes/base.css'), 'utf8')
    const html = readFileSync(join(process.cwd(), 'src/renderer/index.html'), 'utf8')

    expect(html).toContain('id="agent-activity-dot"')
    expect(renderer).toContain('let documentStatsAiStatus')
    expect(renderer).toContain('agentActivityDot')
    expect(renderer).toContain('updateAgentActivityLight')
    expect(renderer).toContain('const updateDocumentStatsAiStatus')
    expect(renderer).toContain('updateDocumentStatsAiStatus(aiPaletteStatusText)')
    expect(renderer).toContain("updateDocumentStatsAiStatus('')")
    expect(renderer).toContain('document-stats-ai-status')
    expect(renderer).toContain('document-stats-count')
    expect(css).toContain('#agent-activity-dot')
    expect(css).toMatch(/#agent-activity-dot\s*\{[\s\S]*position:\s*fixed/)
    expect(css).toMatch(/#agent-activity-dot\s*\{[\s\S]*top:\s*26px/)
    expect(css).toMatch(/#agent-activity-dot\s*\{[\s\S]*right:\s*26px/)
    expect(css).toContain('@keyframes agent-activity-breathe')
    expect(css).toContain('.document-stats-ai-status')
  })

  it('links the palette provider footer to the integrations settings pane', () => {
    const renderer = readFileSync(join(process.cwd(), 'src/renderer/main.ts'), 'utf8')
    const settings = readFileSync(join(process.cwd(), 'src/renderer/settings-dialog.ts'), 'utf8')

    expect(renderer).toContain('aiPaletteProviderLink')
    expect(renderer).toContain("settingsDialog.openPane('integrations')")
    expect(settings).toContain('openPane: (pane: SettingsPaneId) => void')
    expect(settings).toContain('const openPane = (pane: SettingsPaneId): void => {')
  })

  it('does not show busy thinking text inside the centered palette chrome', () => {
    const renderer = readFileSync(join(process.cwd(), 'src/renderer/main.ts'), 'utf8')

    expect(renderer).toContain("const paletteStatusText = aiPaletteBusy ? ''")
    expect(renderer).toContain('aiPaletteStatus.textContent = paletteStatusText')
  })

  it('hides the centered palette immediately after launching a command', () => {
    const renderer = readFileSync(join(process.cwd(), 'src/renderer/main.ts'), 'utf8')

    expect(renderer).toContain('const hideAiPaletteForBackgroundRun = (): void => {')
    const runIdx = renderer.indexOf('const runAiPalettePrompt = async (): Promise<void> => {')
    const runBlock = renderer.slice(runIdx, runIdx + 700)
    expect(runBlock).toContain('startAiPaletteTimer()')
    expect(runBlock).toContain('hideAiPaletteForBackgroundRun()')
  })

  it('surfaces hidden palette failures in the bottom stats status', () => {
    const renderer = readFileSync(join(process.cwd(), 'src/renderer/main.ts'), 'utf8')

    expect(renderer).toContain('const showAiPaletteStatusNotice = (status: string): void => {')
    expect(renderer).toContain('updateDocumentStatsAiStatus(status)')
    expect(renderer).toContain("showAiPaletteStatusNotice(result.error ?? 'AI 请求失败。')")
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

  it('does not keep Cmd/Ctrl+Y as a direct rewrite shortcut', () => {
    const renderer = readFileSync(join(process.cwd(), 'src/renderer/main.ts'), 'utf8')

    expect(renderer).not.toContain('runAiHelperShortcutRewrite')
    expect(renderer).not.toContain("eventMatchesShortcut(event, 'CmdOrCtrl+Y')")
    expect(renderer).not.toContain('正在快捷改写选区')
    expect(renderer).not.toContain('已快捷改写选区')
  })

  it('exposes openAiPalette shortcut in the settings dialog shortcut list', () => {
    const html = readFileSync(join(process.cwd(), 'src/renderer/index.html'), 'utf8')

    expect(html).toContain('data-shortcut-action="openAiPalette"')
    expect(html).toContain('打开 AI 精灵')
  })

  it('does not inject new CJK template strings inside palette functions', () => {
    const renderer = readFileSync(join(process.cwd(), 'src/renderer/main.ts'), 'utf8')

    // Locate the block from openAiPalette to the next major renderer panel function.
    const paletteStart = renderer.indexOf('const openAiPalette = (): void => {')
    const paletteBlockEnd = renderer.indexOf('const setOutlinePanelOpen', paletteStart)

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
