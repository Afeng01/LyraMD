import { describe, expect, it } from 'vitest'

import { resolveMarkdownImageSrc } from './markdown-media'

describe('resolveMarkdownImageSrc', () => {
  it('keeps web, data, blob, and file image sources unchanged', () => {
    expect(resolveMarkdownImageSrc('https://example.com/a.png', '/notes/doc.md')).toBe('https://example.com/a.png')
    expect(resolveMarkdownImageSrc('data:image/png;base64,abc', '/notes/doc.md')).toBe('data:image/png;base64,abc')
    expect(resolveMarkdownImageSrc('blob:local-id', '/notes/doc.md')).toBe('blob:local-id')
    expect(resolveMarkdownImageSrc('file:///Users/cherry/a.png', '/notes/doc.md')).toBe('file:///Users/cherry/a.png')
  })

  it('resolves relative image paths against the current markdown file', () => {
    expect(resolveMarkdownImageSrc('./images/a b.png', '/Users/cherry/notes/doc.md')).toBe('file:///Users/cherry/notes/images/a%20b.png')
    expect(resolveMarkdownImageSrc('../assets/a.png', '/Users/cherry/notes/drafts/doc.md')).toBe('file:///Users/cherry/notes/assets/a.png')
  })

  it('resolves absolute local image paths to file urls', () => {
    expect(resolveMarkdownImageSrc('/Users/cherry/notes/a.png', '/Users/cherry/notes/doc.md')).toBe('file:///Users/cherry/notes/a.png')
    expect(resolveMarkdownImageSrc('C:\\Users\\Cherry\\Notes\\a b.png', 'C:\\Users\\Cherry\\Notes\\doc.md')).toBe('file:///C:/Users/Cherry/Notes/a%20b.png')
  })

  it('leaves unresolved relative image paths unchanged without a markdown file path', () => {
    expect(resolveMarkdownImageSrc('./images/a.png', null)).toBe('./images/a.png')
  })
})
