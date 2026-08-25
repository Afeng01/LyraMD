import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkStringify from 'remark-stringify'
import remarkMath from 'remark-math'

const read = (path: string): string => readFileSync(join(process.cwd(), path), 'utf8')

// 与编辑器一致的序列化链路：parse 与 stringify 共用注册了 remarkMath 的 processor
function createProcessor() {
  return unified().use(remarkParse).use(remarkMath).use(remarkStringify)
}

interface MdastChild {
  type: string
  value?: string
}

describe('math markdown round-trip', () => {
  it('parses $...$ into inlineMath nodes and serializes them back unchanged', () => {
    const source = '能量方程 $E=mc^2$ 很有名'
    const processor = createProcessor()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tree = processor.parse(source) as any
    processor.runSync(tree)
    const inlineMath = (tree.children[0].children as MdastChild[]).find(
      (child) => child.type === 'inlineMath',
    )
    expect(inlineMath?.value).toBe('E=mc^2')

    expect(String(processor.stringify(tree)).trim()).toBe(source.trim())
  })

  it('parses $$...$$ into block math nodes and serializes them back unchanged', () => {
    const source = '$$\na + b \\geq c\n$$'
    const processor = createProcessor()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tree = processor.parse(source) as any
    processor.runSync(tree)
    const blockMath = (tree.children as MdastChild[]).find((child) => child.type === 'math')
    expect(blockMath?.value).toBe('a + b \\geq c')

    expect(String(processor.stringify(tree)).trim()).toBe(source.trim())
  })

  it('keeps mixed inline and block formulas stable across a full cycle', () => {
    const source = '行内 $x_1$ 与块级：\n\n$$\n\\sum_{i=1}^n i\n$$\n'
    const processor = createProcessor()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tree = processor.parse(source) as any
    processor.runSync(tree)
    expect(String(processor.stringify(tree)).trim()).toBe(source.trim())
  })
})

describe('math schema regression', () => {
  const nodeSource = read('src/renderer/editor/math-node.ts')

  it('declares both inline and block math schemas bridging mdast math nodes', () => {
    // prose 节点与 remark-math 的 mdast 节点互转
    expect(nodeSource).toContain("$nodeSchema('math_inline'")
    expect(nodeSource).toContain("match: ({ type }) => type === 'inlineMath'")
    expect(nodeSource).toContain("state.addNode(type, { value: String(node.value ?? '') })")
    expect(nodeSource).toContain("$nodeSchema('math_block'")
    expect(nodeSource).toContain("match: ({ type }) => type === 'math'")
    // 序列化交还 remark-math 的节点类型，由它输出 $...$ / $$...$$
    expect(nodeSource).toContain("addNode('inlineMath'")
    expect(nodeSource).toContain("addNode('math'")
  })

  it('registers input rules and the click-to-edit prose plugin', () => {
    expect(nodeSource).toContain('mathInlineInputRule')
    expect(nodeSource).toContain('mathBlockInputRule')
    expect(nodeSource).toContain("new PluginKey('LYRAMD_MATH_CLICK')")
    expect(nodeSource).toContain('setMathActivateHandler')
  })

  it('keeps serialization on the shared remark processor inside the editor config', () => {
    const editor = read('src/renderer/editor/editor.ts')
    expect(editor).toContain('{ plugin: remarkMath, options: undefined }')
    expect(editor).toContain('.use(math)')
    expect(editor).toContain('.use(mathInlineView)')
    expect(editor).toContain('.use(mathBlockView)')
    expect(editor).toContain('export function showMathModal')
    // 菜单与弹窗链路依赖导出的视图获取器
    expect(editor).toContain('export function getEditorView')
  })
})

describe('katex lazy-loading regression', () => {
  const viewSource = read('src/renderer/editor/math-view.ts')
  const rendererFiles = [
    'src/renderer/editor/editor.ts',
    'src/renderer/editor/math-node.ts',
    'src/renderer/editor/math-modal.ts',
    'src/renderer/main.ts',
  ]

  it('loads katex only through dynamic import together with its stylesheet', () => {
    // 红线：katex 必须走动态 import（含样式），保证主 chunk 零 katex
    expect(viewSource).toContain("import('katex')")
    expect(viewSource).toContain("import('katex/dist/katex.min.css')")
    expect(viewSource).not.toMatch(/from 'katex'/)
  })

  it('never statically imports katex outside the view module', () => {
    for (const file of rendererFiles) {
      expect(read(file)).not.toMatch(/from 'katex'/)
    }
  })
})

describe('math styles regression', () => {
  const baseCss = read('src/renderer/themes/base.css')

  it('styles math nodes and the edit modal per theme variables', () => {
    expect(baseCss).toContain('#editor .ProseMirror .math-inline:hover')
    expect(baseCss).toContain('#editor .ProseMirror .math-block:hover')
    expect(baseCss).toContain('.math-modal-overlay')
    expect(baseCss).toContain('.math-modal-input:focus')
    expect(baseCss).toContain('.math-modal-btn.save')
  })
})
