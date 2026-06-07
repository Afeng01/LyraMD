import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('editor search migration regression', () => {
  it('does not keep legacy search-state bootstrap calls that break renderer init at runtime', () => {
    const file = readFileSync(join(process.cwd(), 'src/renderer/editor/editor.ts'), 'utf8')

    expect(file).not.toContain('createSearchState(getCurrentSearchSourceText()')
    expect(file).not.toContain('getCurrentSearchSourceText(')
  })
})

describe('frontmatter card regression', () => {
  it('renders leading metadata as a collapsible 前置元数据 card', () => {
    const renderer = readFileSync(join(process.cwd(), 'src/renderer/main.ts'), 'utf8')
    const css = readFileSync(join(process.cwd(), 'src/renderer/themes/base.css'), 'utf8')

    expect(renderer).toContain('syncFrontmatterCards')
    expect(renderer).toContain('frontmatter-card')
    expect(renderer).toContain('前置元数据')
    expect(renderer).toContain('frontmatterExpanded')
    expect(css).toContain('#editor .ProseMirror > pre.frontmatter-card')
    expect(css).toContain('.frontmatter-card.frontmatter-collapsed')
    expect(css).toContain('max-height: calc(1.55em * 3 + 18px)')
    expect(css).toContain('font-family: "SF Mono"')
  })
})
