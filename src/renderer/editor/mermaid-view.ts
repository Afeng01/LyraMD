import { codeBlockSchema } from '@milkdown/kit/preset/commonmark'
import { $view } from '@milkdown/kit/utils'
import type { NodeViewConstructor } from '@milkdown/kit/prose/view'
import { TextSelection } from '@milkdown/kit/prose/state'
import { renderMermaid } from './mermaid-bridge'

const RENDER_DEBOUNCE_MS = 400

function isMermaid(node: { attrs: { language?: string } }): boolean {
  return String(node.attrs.language ?? '').trim().toLowerCase() === 'mermaid'
}

const mermaidViewConstructor: NodeViewConstructor = (node, view, getPos) => {
  const dom = document.createElement('div')
  dom.className = 'lyramd-mermaid-block'

  const diagram = document.createElement('div')
  diagram.className = 'mermaid-diagram'
  diagram.hidden = true

  const pre = document.createElement('pre')
  const code = document.createElement('code')
  pre.appendChild(code)

  const error = document.createElement('div')
  error.className = 'mermaid-error'
  error.hidden = true

  dom.append(diagram, pre, error)

  let renderToken = 0
  let currentNode = node
  let editing = false
  let debounceTimer: ReturnType<typeof setTimeout> | null = null

  const showSource = (): void => {
    diagram.hidden = true
    pre.hidden = false
    error.hidden = true
  }

  const renderNow = (target: typeof node): void => {
    const token = ++renderToken
    // 重渲染期间保留旧 SVG（避免布局跳动）；首帧在 SVG 到达前先显示源码。
    renderMermaid(target.textContent)
      .then((svg) => {
        if (token !== renderToken || editing) return
        diagram.innerHTML = svg
        diagram.hidden = false
        pre.hidden = true
        error.hidden = true
      })
      .catch((reason: Error) => {
        if (token !== renderToken || editing) return
        diagram.hidden = true
        pre.hidden = false
        error.textContent = `Mermaid 渲染失败：${reason.message}`
        error.hidden = false
      })
  }

  const scheduleRender = (): void => {
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
      debounceTimer = null
      if (editing || !isMermaid(currentNode)) return
      if (!currentNode.textContent.trim()) {
        showSource()
        return
      }
      renderNow(currentNode)
    }, RENDER_DEBOUNCE_MS)
  }

  const exitEditMode = (): void => {
    if (!editing) return
    editing = false
    view?.dom.removeEventListener('mousedown', onOutsideMousedown, true)
    scheduleRender()
  }

  // 编辑模式在任何块外 mousedown 时结束——覆盖编辑器内其他位置的普通点击，
  // 这类点击不会触发 deselectNode（它只在真正的 NodeSelection 移走时触发）。
  const onOutsideMousedown = (event: MouseEvent): void => {
    if (dom.contains(event.target as Node)) return
    exitEditMode()
  }

  const enterEditMode = (): void => {
    if (editing) return
    editing = true
    if (debounceTimer) {
      clearTimeout(debounceTimer)
      debounceTimer = null
    }
    renderToken++
    showSource()
    view?.dom.addEventListener('mousedown', onOutsideMousedown, true)
    const pos = typeof getPos === 'function' ? getPos() : undefined
    if (view && pos != null) {
      // 把光标移进源码里，输入立即作用于内容而不是替换整个节点
      // （NodeSelection 的已知坑）。
      view.dispatch(view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(pos + 1))).scrollIntoView())
      view.focus()
    }
  }

  // 点击渲染图回到源码编辑。
  diagram.addEventListener('mousedown', (event) => {
    event.preventDefault()
    event.stopPropagation()
    enterEditMode()
  })

  queueMicrotask(() => {
    if (isMermaid(currentNode)) scheduleRender()
  })

  return {
    dom,
    contentDOM: code,
    update(nextNode) {
      if (nextNode.type !== currentNode.type) return false
      currentNode = nextNode
      if (editing) return true
      if (!isMermaid(nextNode)) {
        if (debounceTimer) {
          clearTimeout(debounceTimer)
          debounceTimer = null
        }
        renderToken++
        showSource()
        return true
      }
      scheduleRender()
      return true
    },
    selectNode: enterEditMode,
    deselectNode: exitEditMode,
    stopEvent: () => false,
    // 只有 contentDOM 内的 mutation 才是编辑器内容。其余（diagram 区的 SVG
    // 替换、错误文案）都是视图内部状态——让 ProseMirror 看见会导致它重建
    // node view，进而重新触发渲染，无限循环（即 v1.7.4 CPU 风暴的机制）。
    ignoreMutation: (mutation) => mutation.target !== code && !code.contains(mutation.target),
    destroy() {
      if (debounceTimer) clearTimeout(debounceTimer)
      renderToken++
      view?.dom.removeEventListener('mousedown', onOutsideMousedown, true)
    },
  }
}

// 普通代码块保持可编辑的 pre/code 节点，只有 mermaid 块在渲染成功后
// 才被替换为沙箱产出的 SVG。
export const mermaidView = $view(codeBlockSchema.node, () => mermaidViewConstructor)
