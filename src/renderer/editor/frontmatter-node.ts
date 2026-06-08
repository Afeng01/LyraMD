import type { Node as ProseNode } from '@milkdown/kit/prose/model'
import type { EditorView, NodeView, NodeViewConstructor } from '@milkdown/kit/prose/view'
import { $nodeSchema, $view } from '@milkdown/kit/utils'

export const frontmatterSchema = $nodeSchema('frontmatter', () => ({
  group: 'block',
  atom: true,
  selectable: false,
  isolating: true,
  attrs: {
    value: {
      default: '',
      validate: 'string',
    },
  },
  parseDOM: [
    {
      tag: 'section[data-type="frontmatter"]',
      getAttrs: (dom) => {
        if (!(dom instanceof HTMLElement)) return false
        return { value: dom.dataset.value ?? dom.textContent?.trim() ?? '' }
      },
    },
  ],
  toDOM: (node) => [
    'section',
    {
      'data-type': 'frontmatter',
      'data-value': String(node.attrs.value ?? ''),
      contenteditable: 'false',
    },
  ],
  parseMarkdown: {
    match: ({ type }) => type === 'yaml',
    runner: (state, node, type) => {
      state.addNode(type, { value: String(node.value ?? '') })
    },
  },
  toMarkdown: {
    match: (node) => node.type.name === 'frontmatter',
    runner: (state, node) => {
      state.addNode('yaml', undefined, String(node.attrs.value ?? ''))
    },
  },
}))

class FrontmatterCardView implements NodeView {
  dom: HTMLElement
  private body: HTMLPreElement
  private expanded = false

  constructor(node: ProseNode, view: EditorView) {
    this.dom = document.createElement('section')
    this.dom.className = 'frontmatter-card frontmatter-collapsed'
    this.dom.contentEditable = 'false'

    const header = document.createElement('button')
    header.type = 'button'
    header.className = 'frontmatter-card-header'
    header.setAttribute('aria-expanded', 'false')
    header.textContent = '前置元数据'
    header.addEventListener('mousedown', (event) => event.preventDefault())
    header.addEventListener('click', () => {
      this.expanded = !this.expanded
      this.dom.classList.toggle('frontmatter-expanded', this.expanded)
      this.dom.classList.toggle('frontmatter-collapsed', !this.expanded)
      header.setAttribute('aria-expanded', String(this.expanded))
      if (!this.expanded) view.focus()
    })

    this.body = document.createElement('pre')
    this.body.className = 'frontmatter-card-body'
    this.body.textContent = String(node.attrs.value ?? '')

    this.dom.append(header, this.body)
  }

  update(node: ProseNode): boolean {
    if (node.type.name !== 'frontmatter') return false
    const nextValue = String(node.attrs.value ?? '')
    if (this.body.textContent !== nextValue) this.body.textContent = nextValue
    return true
  }

  stopEvent(event: Event): boolean {
    return this.dom.contains(event.target as Node)
  }

  ignoreMutation(): boolean {
    return true
  }
}

export const frontmatterView = $view(frontmatterSchema.node, (): NodeViewConstructor => {
  return (node, view) => new FrontmatterCardView(node, view)
})
