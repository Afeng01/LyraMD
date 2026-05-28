const OPENING_PAIRS: Record<string, string> = {
  '(': ')',
  '（': '）',
  '[': ']',
  '【': '】',
  '{': '}',
  '"': '"',
  "'": "'",
  '“': '”',
  '‘': '’',
}

const CLOSING_CHARS = new Set(Object.values(OPENING_PAIRS))

export interface AutoPairInput {
  text: string
  selectedText: string
  nextText: string
  cursor: number
}

export interface AutoPairAction {
  insertText: string
  selectionAnchor: number
  selectionHead: number
}

export function resolveAutoPairTextInput(input: AutoPairInput): AutoPairAction | null {
  if (input.text.length !== 1) return null

  if (!input.selectedText && CLOSING_CHARS.has(input.text) && input.nextText === input.text) {
    const nextCursor = input.cursor + input.text.length
    return {
      insertText: '',
      selectionAnchor: nextCursor,
      selectionHead: nextCursor,
    }
  }

  if (input.selectedText) return null

  const closingText = OPENING_PAIRS[input.text]
  if (!closingText) return null

  const nextCursor = input.cursor + input.text.length
  return {
    insertText: `${input.text}${closingText}`,
    selectionAnchor: nextCursor,
    selectionHead: nextCursor,
  }
}
