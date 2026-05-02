import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('search panel regression', () => {
  it('ships context preview markup in the renderer shell', () => {
    const html = readFileSync(join(process.cwd(), 'src/renderer/index.html'), 'utf8')

    expect(html).toContain('id="search-panel-anchor"')
    expect(html).toContain('id="search-context"')
    expect(html).toContain('id="search-context-prev"')
    expect(html).toContain('id="search-context-current"')
    expect(html).toContain('id="search-context-next"')
  })

  it('anchors the search panel with a sticky floating wrapper instead of scroll-synced top updates', () => {
    const css = readFileSync(join(process.cwd(), 'src/renderer/themes/base.css'), 'utf8')
    const main = readFileSync(join(process.cwd(), 'src/renderer/main.ts'), 'utf8')

    expect(css).toContain('#search-panel-anchor {')
    expect(css).toContain('position: sticky;')
    expect(main).not.toContain("searchPanel.style.setProperty('--search-panel-top'")
  })

  it('renders contextual preview content from editor-owned search state and distinguishes modifier navigation', () => {
    const main = readFileSync(join(process.cwd(), 'src/renderer/main.ts'), 'utf8')

    expect(main).toContain('resolveSearchPanelPreview(')
    expect(main).toContain('resolveSearchNavigationFocusMode(')
    expect(main).toContain('search-context-current-match')
  })

  it('does not restore the stale editor selection before advancing search navigation', () => {
    const main = readFileSync(join(process.cwd(), 'src/renderer/main.ts'), 'utf8')
    const navigateStart = main.indexOf("const navigateSearchMatches = (direction: 'next' | 'previous'): void => {")
    const navigateEnd = main.indexOf('\n  }\n\n  const openSearchPanel', navigateStart)
    const navigateBody = main.slice(navigateStart, navigateEnd)

    expect(navigateBody).not.toContain('focusEditorAtLastSelection()')
  })

  it('ships visible in-editor highlight styles for normal and active search matches', () => {
    const css = readFileSync(join(process.cwd(), 'src/renderer/themes/base.css'), 'utf8')

    expect(css).toContain('.ProseMirror-search-match')
    expect(css).toContain('.ProseMirror-active-search-match')
  })

  it('syncs empty-editor placeholder typography from the live editor anchor instead of only copying box offsets', () => {
    const main = readFileSync(join(process.cwd(), 'src/renderer/main.ts'), 'utf8')

    expect(main).toContain('const anchorStyle = window.getComputedStyle(anchor)')
    expect(main).toContain('editorPlaceholder.style.fontFamily = anchorStyle.fontFamily')
    expect(main).toContain('editorPlaceholder.style.fontSize = anchorStyle.fontSize')
    expect(main).toContain('editorPlaceholder.style.lineHeight = anchorStyle.lineHeight')
    expect(main).toContain('editorPlaceholder.style.letterSpacing = anchorStyle.letterSpacing')
  })
})
