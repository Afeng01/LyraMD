import type { EditorView } from '@milkdown/kit/prose/view'

// 公式编辑弹窗：插入模式（target 为空，光标处插入新公式）
// 与编辑模式（target 指向已有公式节点）共用一个中文 UI。

export interface MathModalTarget {
  pos: number
  kind: 'inline' | 'block'
}

export function openMathModal(view: EditorView, target: MathModalTarget | null): void {
  // 已有弹窗先关闭，避免叠层
  document.querySelector('.math-modal-overlay')?.remove()

  const editing = target !== null

  const overlay = document.createElement('div')
  overlay.className = 'math-modal-overlay'

  const dialog = document.createElement('div')
  dialog.className = 'math-modal'
  dialog.setAttribute('role', 'dialog')
  dialog.setAttribute('aria-modal', 'true')
  dialog.setAttribute('aria-label', editing ? '编辑公式' : '插入公式')

  const title = document.createElement('h3')
  title.textContent = editing ? '编辑公式' : '插入公式'

  const input = document.createElement('textarea')
  input.className = 'math-modal-input'
  input.rows = 4
  input.spellcheck = false
  input.placeholder = '输入 LaTeX 公式，例如 \\frac{a}{b}'

  let blockCheckbox: HTMLInputElement | null = null
  const options = document.createElement('div')
  options.className = 'math-modal-options'
  if (!editing) {
    // 插入模式才允许选择行内/块级；编辑模式跟随被点击的公式类型
    const blockLabel = document.createElement('label')
    blockCheckbox = document.createElement('input')
    blockCheckbox.type = 'checkbox'
    blockLabel.append(blockCheckbox, document.createTextNode('作为块级公式插入'))
    options.appendChild(blockLabel)
    dialog.append(title, input, options)
  } else {
    dialog.append(title, input)
  }

  const footer = document.createElement('div')
  footer.className = 'math-modal-footer'

  const cancelButton = document.createElement('button')
  cancelButton.type = 'button'
  cancelButton.className = 'math-modal-btn cancel'
  cancelButton.textContent = '取消'

  const saveButton = document.createElement('button')
  saveButton.type = 'button'
  saveButton.className = 'math-modal-btn save'
  saveButton.textContent = editing ? '保存' : '插入'

  footer.append(cancelButton, saveButton)

  const cleanupHandlers: Array<() => void> = []

  const close = (): void => {
    for (const cleanup of cleanupHandlers) cleanup()
    overlay.remove()
    view.focus()
  }

  const onOverlayMousedown = (event: MouseEvent): void => {
    if (event.target === overlay) close()
  }

  const onKeydown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      event.preventDefault()
      close()
      return
    }
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault()
      save()
    }
  }

  const save = (): void => {
    const value = input.value.trim()

    if (target) {
      const node = view.state.doc.nodeAt(target.pos)
      const expectedType = target.kind === 'block' ? 'math_block' : 'math_inline'
      if (!node || node.type.name !== expectedType) {
        close()
        return
      }
      view.dispatch(
        view.state.tr.setNodeMarkup(target.pos, undefined, { value }).scrollIntoView(),
      )
    } else {
      const { from, to } = view.state.selection
      const nodeTypeName = blockCheckbox?.checked ? 'math_block' : 'math_inline'
      const nodeType = view.state.schema.nodes[nodeTypeName]
      if (!nodeType) {
        close()
        return
      }
      view.dispatch(
        view.state.tr.replaceRangeWith(from, to, nodeType.create({ value })).scrollIntoView(),
      )
    }

    close()
  }

  overlay.addEventListener('mousedown', onOverlayMousedown)
  document.addEventListener('keydown', onKeydown)
  cancelButton.addEventListener('click', () => close())
  saveButton.addEventListener('click', () => save())

  cleanupHandlers.push(() => {
    overlay.removeEventListener('mousedown', onOverlayMousedown)
    document.removeEventListener('keydown', onKeydown)
  })

  if (editing && target) {
    const node = view.state.doc.nodeAt(target.pos)
    input.value = String(node?.attrs.value ?? '')
  } else {
    const { from, to } = view.state.selection
    // 插入模式预填当前选区文本，方便把已写的表达式直接转成公式
    input.value = from === to ? '' : view.state.doc.textBetween(from, to, '\n\n', '\n')
  }

  dialog.appendChild(footer)
  overlay.appendChild(dialog)
  document.body.appendChild(overlay)
  input.focus()
}
