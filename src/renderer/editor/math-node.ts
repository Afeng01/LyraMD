import { $inputRule, $nodeAttr, $nodeSchema, $prose } from '@milkdown/kit/utils'
import type { MilkdownPlugin } from '@milkdown/kit/ctx'
import { Plugin, PluginKey } from '@milkdown/kit/prose/state'
import { InputRule } from '@milkdown/kit/prose/inputrules'

// KaTeX 数学公式（remark-math 语法：行内 $...$，块级 $$...$$）。
// 解析与序列化共用 remark processor：remarkPluginsCtx 里注册 remarkMath 后，
// parse 与 stringify 都认识 'inlineMath' / 'math' mdast 节点，
// schema 只负责 prose 节点与 mdast 节点之间的互转。

export const mathInlineAttr = $nodeAttr('math_inline')
export const mathBlockAttr = $nodeAttr('math_block')

export const mathInlineSchema = $nodeSchema('math_inline', () => ({
  group: 'inline',
  inline: true,
  atom: true,
  attrs: {
    value: {
      default: '',
      validate: 'string',
    },
  },
  parseDOM: [
    {
      tag: 'span[data-type="math-inline"]',
      getAttrs: (dom) => {
        if (!(dom instanceof HTMLElement)) return false
        return { value: dom.dataset.value ?? dom.textContent?.trim() ?? '' }
      },
    },
  ],
  toDOM: (node) => [
    'span',
    {
      'data-type': 'math-inline',
      'data-value': String(node.attrs.value ?? ''),
      contenteditable: 'false',
    },
  ],
  parseMarkdown: {
    match: ({ type }) => type === 'inlineMath',
    runner: (state, node, type) => {
      state.addNode(type, { value: String(node.value ?? '') })
    },
  },
  toMarkdown: {
    match: (node) => node.type.name === 'math_inline',
    runner: (state, node) => {
      state.addNode('inlineMath', undefined, undefined, { value: String(node.attrs.value ?? '') })
    },
  },
}))

export const mathBlockSchema = $nodeSchema('math_block', () => ({
  group: 'block',
  atom: true,
  defining: true,
  attrs: {
    value: {
      default: '',
      validate: 'string',
    },
  },
  parseDOM: [
    {
      tag: 'div[data-type="math-block"]',
      getAttrs: (dom) => {
        if (!(dom instanceof HTMLElement)) return false
        return { value: dom.dataset.value ?? dom.textContent?.trim() ?? '' }
      },
    },
  ],
  toDOM: (node) => [
    'div',
    {
      'data-type': 'math-block',
      'data-value': String(node.attrs.value ?? ''),
      contenteditable: 'false',
    },
  ],
  parseMarkdown: {
    match: ({ type }) => type === 'math',
    runner: (state, node, type) => {
      state.addNode(type, { value: String(node.value ?? '') })
    },
  },
  toMarkdown: {
    match: (node) => node.type.name === 'math_block',
    runner: (state, node) => {
      state.addNode('math', undefined, undefined, { value: String(node.attrs.value ?? '') })
    },
  },
}))

// 输入 $...$ 即转换为行内公式节点
export const mathInlineInputRule = $inputRule((ctx) => {
  const nodeType = mathInlineSchema.type(ctx)
  return new InputRule(/\$([^$\n]+)\$$/, (state, match, start, end) => {
    const value = String(match[1] ?? '')
    if (!value.trim()) return null
    return state.tr.replaceRangeWith(start, end, nodeType.create({ value }))
  })
})

// 空行输入 $$ 即转换为空块级公式节点
export const mathBlockInputRule = $inputRule((ctx) => {
  const nodeType = mathBlockSchema.type(ctx)
  return new InputRule(/^\$\$$/, (state, _match, start, end) => {
    return state.tr.replaceRangeWith(start, end, nodeType.create({ value: '' }))
  })
})

// 点击公式打开编辑弹窗。NodeView 不拦截事件，由这个 prose 插件统一接管。
export type MathActivateDetail = { pos: number; kind: 'inline' | 'block' }

let mathActivateHandler: ((detail: MathActivateDetail) => void) | null = null

export function setMathActivateHandler(handler: ((detail: MathActivateDetail) => void) | null): void {
  mathActivateHandler = handler
}

export const mathClickPlugin = $prose(() => new Plugin({
  key: new PluginKey('LYRAMD_MATH_CLICK'),
  props: {
    handleClick(view, pos) {
      const $pos = view.state.doc.resolve(pos)
      for (let d = $pos.depth; d >= 0; d--) {
        const node = $pos.node(d)
        if (node.type.name !== 'math_inline' && node.type.name !== 'math_block') continue
        // NodeView 渲染层可能吞掉精确位置，向上回溯到公式节点自身的起始位置
        mathActivateHandler?.({ pos: $pos.before(d), kind: node.type.name === 'math_block' ? 'block' : 'inline' })
        return true
      }
      return false
    },
  },
}))

// $nodeSchema / $inputRule 的声明类型是元组+辅助器形状；运行时它们都是合法的
// MilkdownPlugin（与 highlight.ts 内的用法一致）
export const math = [
  mathInlineAttr,
  mathInlineSchema,
  mathBlockAttr,
  mathBlockSchema,
  mathInlineInputRule,
  mathBlockInputRule,
  mathClickPlugin,
] as unknown as MilkdownPlugin[]
