import { markRule } from '@milkdown/kit/prose'
import { $inputRule, $markAttr, $markSchema } from '@milkdown/kit/utils'
import type { MilkdownPlugin } from '@milkdown/kit/ctx'
import { visit, SKIP } from 'unist-util-visit'

// ==text== 高亮语法（Typora / Obsidian 风格）

export const highlightAttr = $markAttr('highlight')

export const highlightSchema = $markSchema('highlight', (ctx) => ({
  parseDOM: [{ tag: 'mark' }],
  toDOM: (mark) => ['mark', ctx.get(highlightAttr.key)(mark)],
  parseMarkdown: {
    match: (node) => node.type === 'mark',
    runner: (state, node, markType) => {
      state.openMark(markType)
      state.next(node.children)
      state.closeMark(markType)
    },
  },
  toMarkdown: {
    match: (mark) => mark.type.name === 'highlight',
    runner: (state, mark) => {
      state.withMark(mark, 'mark')
    },
  },
}))

// 输入 ==text==（后跟空格）即时高亮文本
export const highlightInputRule = $inputRule((ctx) => {
  return markRule(/==([^=]+)==/, highlightSchema.type(ctx))
})

// $markSchema 的声明类型是元组+辅助器形状；运行时它是合法的
// MilkdownPlugin（与 preset-gfm 内部用法一致）
export const highlight = [highlightAttr, highlightSchema, highlightInputRule] as unknown as MilkdownPlugin[]

// ─── remark 侧 ──────────────────────────────────────────────────────────────

interface MdastNode {
  type: string
  value?: string
  children?: MdastNode[]
}

// 把字符串里的 ==text== 拆成普通文本与 'mark' 节点序列
export function splitHighlight(value: string): MdastNode[] {
  const parts: MdastNode[] = []
  let last = 0
  const re = /==([^=\n]+)==/g
  let m: RegExpExecArray | null
  while ((m = re.exec(value)) !== null) {
    if (m.index > last) parts.push({ type: 'text', value: value.slice(last, m.index) })
    parts.push({ type: 'mark', children: [{ type: 'text', value: m[1] }] })
    last = m.index + m[0].length
  }
  if (last < value.length) parts.push({ type: 'text', value: value.slice(last) })
  return parts
}

// 把文本节点内的 ==text== 拆成 mdast 'mark' 节点，
// 让包含该语法的文件打开时就渲染出高亮。
export function remarkHighlight(): (tree: unknown) => void {
  return (tree) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    visit(tree as any, 'text', (node: any, index: any, parent: any) => {
      if (!parent || index === undefined || index === null) return undefined
      const parts = splitHighlight(String(node.value ?? ''))
      // 没拆出任何 mark 时跳过（未找到 ==...==）
      if (!parts.some((p) => p.type === 'mark')) return undefined
      parent.children.splice(index, 1, ...parts)
      return [SKIP, index + parts.length]
    })
  }
}

// remark-stringify 处理器：把 'mark' 节点还原成 ==text== 输出，
// 而不是在遇到未知节点类型时抛错。
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function highlightStringifyHandler(node: any, _parent: any, state: any, info: any): string {
  const exit = state.enter('mark')
  const tracker = state.createTracker(info)
  let value = tracker.move('==')
  value += tracker.move(state.containerPhrasing(node, { before: value, after: '==', ...tracker.current() }))
  value += tracker.move('==')
  exit()
  return value
}
