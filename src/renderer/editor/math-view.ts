import { $view } from '@milkdown/kit/utils'
import type { NodeViewConstructor } from '@milkdown/kit/prose/view'
import { mathBlockSchema, mathInlineSchema } from './math-node'

// katex 只允许通过动态 import 进入懒加载 chunk：主包（首屏）零 katex 代码，
// 首次渲染公式时才下载。CSS 与字体跟随同一个懒加载 chunk。
let katexPromise: Promise<typeof import('katex')> | null = null

export function loadKatex(): Promise<typeof import('katex')> {
  katexPromise ??= Promise.all([
    import('katex'),
    // 样式与 JS 走同一个懒加载 chunk；第三方 css 没有类型声明，构建时由 vite 处理
    // @ts-expect-error vite 支持的资产导入，运行时是无副作用的模块对象
    import('katex/dist/katex.min.css'),
  ]).then(([katex]) => katex)
  return katexPromise
}

type MathKind = 'inline' | 'block'

function createMathViewConstructor(kind: MathKind): NodeViewConstructor {
  return (initialNode) => {
    let currentNode = initialNode

    const dom = document.createElement(kind === 'inline' ? 'span' : 'div')
    dom.className = kind === 'inline' ? 'math-inline' : 'math-block'
    dom.dataset.type = `math-${kind}`
    dom.dataset.value = String(currentNode.attrs.value ?? '')

    const render = document.createElement(kind === 'inline' ? 'span' : 'div')
    if (kind === 'block') render.className = 'math-render'
    dom.appendChild(render)

    let renderToken = 0

    const renderFormula = (value: string): void => {
      const token = ++renderToken
      dom.dataset.value = value
      if (!value.trim()) {
        render.textContent = kind === 'inline' ? '(空公式)' : '空公式：点击编辑'
        return
      }
      loadKatex()
        .then((katex) => {
          if (token !== renderToken) return
          try {
            // throwOnError=false 时非法 LaTeX 会渲染成红色错误片段而不是抛错
            render.innerHTML = katex.renderToString(value, {
              throwOnError: false,
              displayMode: kind === 'block',
            })
          } catch {
            render.textContent = value
          }
        })
        .catch(() => {
          if (token === renderToken) render.textContent = value
        })
    }

    renderFormula(String(currentNode.attrs.value ?? ''))

    return {
      dom,
      update(nextNode) {
        if (nextNode.type !== currentNode.type) return false
        currentNode = nextNode
        const nextValue = String(nextNode.attrs.value ?? '')
        if (dom.dataset.value !== nextValue) renderFormula(nextValue)
        return true
      },
      destroy() {
        renderToken++
      },
    }
  }
}

export const mathInlineView = $view(mathInlineSchema.node, () => createMathViewConstructor('inline'))
export const mathBlockView = $view(mathBlockSchema.node, () => createMathViewConstructor('block'))
