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
    const editor = readFileSync(join(process.cwd(), 'src/renderer/editor/editor.ts'), 'utf8')
    const node = readFileSync(join(process.cwd(), 'src/renderer/editor/frontmatter-node.ts'), 'utf8')
    const css = readFileSync(join(process.cwd(), 'src/renderer/themes/base.css'), 'utf8')

    expect(editor).toContain('remarkFrontmatter')
    expect(editor).toContain('frontmatterSchema')
    expect(editor).toContain('frontmatterView')
    expect(node).toContain("$nodeSchema('frontmatter'")
    expect(node).toContain("type === 'yaml'")
    expect(node).toContain("state.addNode('yaml'")
    expect(node).toContain('frontmatter-card')
    expect(node).toContain('前置元数据')
    expect(css).toContain('#editor .ProseMirror .frontmatter-card')
    expect(css).not.toContain('#editor .ProseMirror > pre.frontmatter-card')
    expect(css).toMatch(/#editor \.ProseMirror \.frontmatter-card\s*\{[\s\S]*max-width:\s*780px/)
    expect(css).toMatch(/#editor \.ProseMirror \.frontmatter-card\s*\{[\s\S]*margin:\s*0 auto 1\.7em/)
    expect(css).toContain('.frontmatter-card.frontmatter-collapsed')
    expect(css).toContain('max-height: calc(1.55em * 3 + 18px)')
    expect(css).toContain('font-family: "SF Mono"')
  })
})

describe('programmatic content refresh regression', () => {
  it('keeps image node views enabled and avoids recreating editor state for every content sync', () => {
    const editor = readFileSync(join(process.cwd(), 'src/renderer/editor/editor.ts'), 'utf8')
    const imageNode = readFileSync(join(process.cwd(), 'src/renderer/editor/image-node.ts'), 'utf8')
    const css = readFileSync(join(process.cwd(), 'src/renderer/themes/base.css'), 'utf8')

    expect(editor).toContain('.use(imageView)')
    expect(editor).toContain('replaceAll(normalizedContent, !preserveHistory)')
    expect(editor).not.toContain('replaceAll(normalizedContent, true)')
    expect(imageNode).toContain('lyra-image-node-resize-handle')
    expect(css).toContain('.lyra-image-node.selected .lyra-image-node-resize-handle')
  })
})

describe('image asset workflow regression', () => {
  it('keeps explicit paste insertion and copy embedding hooks wired into the editor layer', () => {
    const editor = readFileSync(join(process.cwd(), 'src/renderer/editor/editor.ts'), 'utf8')
    const clipboard = readFileSync(join(process.cwd(), 'src/renderer/editor/clipboard.ts'), 'utf8')

    expect(editor).toContain('root.addEventListener(\'paste\'')
    expect(editor).toContain('export function insertImage(')
    expect(editor).toContain('replaceClipboardLocalImageSources')
    expect(clipboard).toContain('replaceClipboardLocalImageSources')
  })

  it('normalizes markdown image destinations with local-space paths before programmatic content sync', () => {
    const editor = readFileSync(join(process.cwd(), 'src/renderer/editor/editor.ts'), 'utf8')

    expect(editor).toContain('normalizeMarkdownImageDestinations(content)')
    expect(editor).toContain('replaceAll(normalizedContent, !preserveHistory)')
  })
})
