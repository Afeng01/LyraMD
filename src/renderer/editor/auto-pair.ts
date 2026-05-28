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
const CLOSING_TO_OPENING = new Map(
  Object.entries(OPENING_PAIRS).map(([opening, closing]) => [closing, opening]),
)

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

export interface AutoPairBackspaceInput {
  previousText: string
  nextText: string
  selectedText: string
  cursor: number
}

export interface AutoPairDeleteAction {
  deleteFrom: number
  deleteTo: number
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

export function resolveAutoPairBackspace(input: AutoPairBackspaceInput): AutoPairDeleteAction | null {
  if (input.selectedText) return null
  if (input.previousText.length !== 1 || input.nextText.length !== 1) return null
  const openingText = CLOSING_TO_OPENING.get(input.nextText)
  if (!openingText || openingText !== input.previousText) return null

  const nextCursor = input.cursor - input.previousText.length
  return {
    deleteFrom: nextCursor,
    deleteTo: input.cursor + input.nextText.length,
    selectionAnchor: nextCursor,
    selectionHead: nextCursor,
  }
}
