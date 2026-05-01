import type { Slice } from '@milkdown/kit/prose/model'

const LEADING_OR_TRAILING_BR_PATTERN = /^(?:\s|<br\b[^>]*\/?>)+|(?:\s|<br\b[^>]*\/?>)+$/gi
const PROSEMIRROR_TRAILING_BREAK_PATTERN = /<br\b[^>]*class=(["'])[^"']*\bProseMirror-trailingBreak\b[^"']*\1[^>]*\/?>/gi

export function normalizeClipboardPlainText(text: string): string {
  return text
    .replaceAll('\r\n', '\n')
    .replace(/^\n+|\n+$/g, '')
    .replace(/\n{3,}/g, '\n\n')
}

export function serializeClipboardPlainText(content: Slice): string {
  return normalizeClipboardPlainText(content.content.textBetween(0, content.content.size, '\n'))
}

export function sanitizeClipboardHtml(html: string): string {
  return html
    .replace(PROSEMIRROR_TRAILING_BREAK_PATTERN, '')
    .replace(LEADING_OR_TRAILING_BR_PATTERN, '')
    .trim()
}
