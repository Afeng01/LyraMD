import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('code block copy button', () => {
  const editor = readFileSync(join(process.cwd(), 'src/renderer/editor/editor.ts'), 'utf8')
  const baseCss = readFileSync(join(process.cwd(), 'src/renderer/themes/base.css'), 'utf8')

  it('mounts a single overlay button on the editor root, never inside ProseMirror DOM', () => {
    // 按钮挂在编辑器根节点上，而不是 <pre> 内部——ProseMirror 会重建自己
    // 管辖的 DOM，内部 UI 节点会被冲掉并曾触发无限重建循环。
    expect(editor).toContain("button.className = 'code-copy-btn'")
    expect(editor).toContain('root.appendChild(button)')
    expect(editor).toContain('function setupCodeBlockCopy(root: HTMLElement): void')
  })

  it('avoids MutationObserver to prevent self-triggering rebuild loops', () => {
    // 防回归红线：此模块不得用 MutationObserver 跟踪编辑器 DOM（上游曾因此 CPU 100%）
    expect(editor).not.toContain('new MutationObserver')
  })

  it('copies the hovered block code and shows feedback', () => {
    expect(editor).toContain("root.querySelector('pre:hover')")
    expect(editor).toContain("copyButtonPre.querySelector('code')?.textContent ?? ''")
    expect(editor).toContain("button.textContent = '已复制 ✓'")
    expect(editor).toContain("button.textContent = '复制失败'")
  })

  it('styles the overlay button from the editor root selector', () => {
    expect(baseCss).toContain('#editor > .code-copy-btn')
  })
})
