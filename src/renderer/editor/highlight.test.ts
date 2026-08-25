import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { remarkHighlight, splitHighlight, highlightStringifyHandler } from './highlight'

describe('==highlight== syntax', () => {
  it('splits text nodes on ==mark== spans', () => {
    expect(splitHighlight('a ==b== c')).toEqual([
      { type: 'text', value: 'a ' },
      { type: 'mark', children: [{ type: 'text', value: 'b' }] },
      { type: 'text', value: ' c' },
    ])
  })

  it('keeps plain text untouched when no ==...== is present', () => {
    expect(splitHighlight('plain text')).toEqual([{ type: 'text', value: 'plain text' }])
  })

  it('does not highlight across newlines', () => {
    const parts = splitHighlight('==a\nb==')
    expect(parts).toEqual([{ type: 'text', value: '==a\nb==' }])
  })

  it('remark plugin rewrites mdast text nodes containing ==...==', () => {
    const tree = { type: 'root', children: [{ type: 'paragraph', children: [{ type: 'text', value: 'x ==y== z' }] }] }
    remarkHighlight()(tree)
    const paragraph = (tree as { children: Array<{ children: Array<{ type: string; value?: string }> }> }).children[0]
    expect(paragraph.children).toEqual([
      { type: 'text', value: 'x ' },
      { type: 'mark', children: [{ type: 'text', value: 'y' }] },
      { type: 'text', value: ' z' },
    ])
  })

  it('stringify handler emits ==text== for mark nodes', () => {
    const calls: string[] = []
    const state = {
      enter(type: string) {
        calls.push(`enter:${type}`)
        return () => calls.push(`exit:${type}`)
      },
      containerPhrasing(node: { children: Array<{ value: string }> }) {
        return node.children.map((child) => child.value).join('')
      },
      createTracker() {
        let buffer = ''
        return {
          move(text: string) {
            buffer += text
            return text
          },
          current: () => ({ before: buffer, after: '' }),
        }
      },
    }
    const output = highlightStringifyHandler(
      { type: 'mark', children: [{ type: 'text', value: 'hi' }] },
      null,
      state,
      undefined,
    )
    expect(output).toBe('==hi==')
    expect(calls).toContain('enter:mark')
    expect(calls).toContain('exit:mark')
  })
})

describe('task list checkbox toggle wiring', () => {
  const editor = readFileSync(join(process.cwd(), 'src/renderer/editor/editor.ts'), 'utf8')
  const baseCss = readFileSync(join(process.cwd(), 'src/renderer/themes/base.css'), 'utf8')

  // 可点 checkbox 必须用 v1.7.1 的坐标定位实现：posAtDOM(li, 0) 落在 li 内部
  // 第一个子节点上而不是 list_item 本身，切换会静默失效。
  it('locates the task item via posAtCoords and walks up the tree', () => {
    expect(editor).toContain("e.target.closest('li[data-item-type=\"task\"]')")
    expect(editor).toContain('view.posAtCoords({ left: e.clientX, top: e.clientY })')
    expect(editor).toContain("node.type.name === 'list_item' && node.attrs.checked != null")
    expect(editor).toContain('$pos.before(d)')
  })

  it('toggles with Cmd/Ctrl+Enter as well as clicking the checkbox', () => {
    expect(editor).toContain("if (!(e.metaKey || e.ctrlKey) || e.key !== 'Enter') return")
  })

  it('renders custom checkboxes and highlight marks per theme', () => {
    expect(baseCss).toContain('#editor .ProseMirror li[data-item-type="task"]')
    expect(baseCss).toContain('[data-checked="true"]::before')
    expect(baseCss).toContain('#editor .ProseMirror mark')
    for (const theme of ['theme-light', 'theme-dark', 'theme-elegant', 'theme-newsprint']) {
      const themeBlock = baseCss.slice(baseCss.indexOf(`body.${theme}`))
      expect(themeBlock).toContain('--highlight-bg:')
    }
  })
})
