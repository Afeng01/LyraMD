import { describe, expect, it } from 'vitest'

import {
  normalizeClipboardPlainText,
  replaceClipboardLocalImageSources,
  sanitizeClipboardHtml,
} from './clipboard'

describe('normalizeClipboardPlainText', () => {
  it('normalizes line endings, trims blank edges, and collapses large blank gaps', () => {
    expect(normalizeClipboardPlainText('\r\nhello\r\n\r\n\r\nworld\r\n')).toBe('hello\n\nworld')
  })
})

describe('sanitizeClipboardHtml', () => {
  it('removes leading/trailing breaks and trailing ProseMirror artifacts', () => {
    const html = ' <br><p>Hello</p><br class="ProseMirror-trailingBreak"> '
    expect(sanitizeClipboardHtml(html)).toBe('<p>Hello</p>')
  })
})

describe('replaceClipboardLocalImageSources', () => {
  it('replaces resolved local file urls with embedded data urls for external paste targets', () => {
    const html = '<p>封面</p><img src="file:///Users/cherry/Notes/note.assets/pasted-image.png" alt="cover">'

    expect(replaceClipboardLocalImageSources(html, new Map([
      ['file:///Users/cherry/Notes/note.assets/pasted-image.png', 'data:image/png;base64,abc123'],
    ]))).toContain('src="data:image/png;base64,abc123"')
  })

  it('keeps remote images unchanged when no local replacement is available', () => {
    const html = '<img src="https://example.com/cover.png" alt="cover">'

    expect(replaceClipboardLocalImageSources(html, new Map())).toContain('https://example.com/cover.png')
  })
})
