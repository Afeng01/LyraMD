import type { Node as ProseNode } from '@milkdown/kit/prose/model'
import type { EditorView, NodeView, NodeViewConstructor } from '@milkdown/kit/prose/view'
import { $view } from '@milkdown/kit/utils'
import { imageSchema } from '@milkdown/preset-commonmark'

import {
  decodeImageTitleMetadata,
  encodeImageTitleMetadata,
} from './image-title-metadata'

class ResizableImageView implements NodeView {
  dom: HTMLSpanElement
  private readonly image: HTMLImageElement
  private readonly resizeHandle: HTMLSpanElement
  private readonly view: EditorView
  private readonly getPos: () => number | undefined
  private node: ProseNode
  private pointerState: { maxWidth: number; startWidth: number; startX: number } | null = null
  private readonly handlePointerMove = (event: PointerEvent) => {
    if (!this.pointerState) return
    event.preventDefault()

    const nextWidth = clampImageWidth(
      this.pointerState.startWidth + (event.clientX - this.pointerState.startX),
      this.pointerState.maxWidth,
    )
    this.applyWidth(nextWidth)
  }
  private readonly handlePointerUp = () => {
    const state = this.pointerState
    this.pointerState = null
    window.removeEventListener('pointermove', this.handlePointerMove)
    window.removeEventListener('pointerup', this.handlePointerUp)
    window.removeEventListener('pointercancel', this.handlePointerUp)
    window.removeEventListener('blur', this.handlePointerUp)
    if (!state) return

    const currentWidth = Math.round(this.image.getBoundingClientRect().width)
    const storedWidth = currentWidth >= state.maxWidth - 4 ? null : currentWidth
    const titleMeta = decodeImageTitleMetadata(String(this.node.attrs.title ?? ''))
    const pos = this.getPos()
    if (pos === undefined) return

    const nextTitle = encodeImageTitleMetadata(titleMeta.displayTitle, storedWidth)
    if (nextTitle === String(this.node.attrs.title ?? '')) {
      this.applyWidth(storedWidth)
      return
    }

    this.view.dispatch(this.view.state.tr.setNodeMarkup(pos, undefined, {
      ...this.node.attrs,
      title: nextTitle,
    }))
  }

  constructor(node: ProseNode, view: EditorView, getPos: () => number | undefined) {
    this.node = node
    this.view = view
    this.getPos = getPos

    this.dom = document.createElement('span')
    this.dom.className = 'lyra-image-node'
    this.dom.contentEditable = 'false'

    this.image = document.createElement('img')
    this.image.className = 'lyra-image-node-image'
    this.image.draggable = false

    this.resizeHandle = document.createElement('span')
    this.resizeHandle.className = 'lyra-image-node-resize-handle'
    this.resizeHandle.title = '拖拽调整图片宽度'
    this.resizeHandle.setAttribute('aria-hidden', 'true')
    this.resizeHandle.addEventListener('mousedown', (event) => event.preventDefault())
    this.resizeHandle.addEventListener('pointerdown', (event) => {
      if (!this.view.editable) return
      event.preventDefault()
      event.stopPropagation()
      const maxWidth = resolveImageMaxWidth(this.dom)
      this.pointerState = {
        maxWidth,
        startWidth: Math.min(this.image.getBoundingClientRect().width || maxWidth, maxWidth),
        startX: event.clientX,
      }
      window.addEventListener('pointermove', this.handlePointerMove)
      window.addEventListener('pointerup', this.handlePointerUp)
      window.addEventListener('pointercancel', this.handlePointerUp)
      window.addEventListener('blur', this.handlePointerUp)
    })

    this.dom.append(this.image, this.resizeHandle)
    this.sync(node)
  }

  update(node: ProseNode): boolean {
    if (node.type !== this.node.type) return false
    this.node = node
    this.sync(node)
    return true
  }

  selectNode(): void {
    this.dom.classList.add('selected')
  }

  deselectNode(): void {
    this.dom.classList.remove('selected')
  }

  stopEvent(event: Event): boolean {
    return this.resizeHandle.contains(event.target as Node)
  }

  ignoreMutation(): boolean {
    return true
  }

  destroy(): void {
    this.handlePointerUp()
  }

  private sync(node: ProseNode): void {
    const src = String(node.attrs.src ?? '')
    const alt = String(node.attrs.alt ?? '')
    const titleMeta = decodeImageTitleMetadata(String(node.attrs.title ?? ''))
    this.image.dataset.markdownSrc = src
    this.image.setAttribute('src', src)
    this.image.setAttribute('alt', alt)
    this.image.title = titleMeta.displayTitle
    this.applyWidth(titleMeta.width)
  }

  private applyWidth(width: number | null): void {
    if (width === null) {
      this.dom.style.removeProperty('--lyra-image-width')
      this.image.style.removeProperty('width')
      return
    }

    const widthValue = `${width}px`
    this.dom.style.setProperty('--lyra-image-width', widthValue)
    this.image.style.width = widthValue
  }
}

function clampImageWidth(width: number, maxWidth: number): number {
  return Math.round(Math.min(Math.max(width, 120), maxWidth))
}

function resolveImageMaxWidth(node: HTMLElement): number {
  const proseMirror = node.closest('.ProseMirror')
  const bounds = proseMirror?.getBoundingClientRect()
  return Math.max(120, Math.round(bounds?.width ?? node.getBoundingClientRect().width ?? 780))
}

export const imageView = $view(imageSchema.node, (): NodeViewConstructor => {
  return (node, view, getPos) => new ResizableImageView(node, view, getPos)
})
