import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('search panel regression', () => {
  it('ships context preview markup in the renderer shell', () => {
    const html = readFileSync(join(process.cwd(), 'src/renderer/index.html'), 'utf8')

    expect(html).toContain('id="search-context"')
    expect(html).toContain('id="search-context-prev"')
    expect(html).toContain('id="search-context-current"')
    expect(html).toContain('id="search-context-next"')
  })

  it('anchors the search panel with a scroll-aware floating top offset', () => {
    const css = readFileSync(join(process.cwd(), 'src/renderer/themes/base.css'), 'utf8')
    const main = readFileSync(join(process.cwd(), 'src/renderer/main.ts'), 'utf8')

    expect(css).toContain('top: var(--search-panel-top, 18px);')
    expect(main).toContain("searchPanel.style.setProperty('--search-panel-top'")
  })

  it('renders contextual preview content from editor-owned search state', () => {
    const main = readFileSync(join(process.cwd(), 'src/renderer/main.ts'), 'utf8')

    expect(main).toContain('resolveSearchPanelPreview(')
    expect(main).toContain('search-context-current-match')
  })
})
