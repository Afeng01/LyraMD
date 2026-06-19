import { describe, expect, it } from 'vitest'

import { resolveMarkdownImageSrc } from './markdown-media'
import { absolutePathToLocalMediaUrl } from '../../shared/local-media'

describe('resolveMarkdownImageSrc', () => {
  it('keeps web, data, and blob image sources unchanged while remapping local file urls', () => {
    expect(resolveMarkdownImageSrc('https://example.com/a.png', '/notes/doc.md')).toBe('https://example.com/a.png')
    expect(resolveMarkdownImageSrc('data:image/png;base64,abc', '/notes/doc.md')).toBe('data:image/png;base64,abc')
    expect(resolveMarkdownImageSrc('blob:local-id', '/notes/doc.md')).toBe('blob:local-id')
    expect(resolveMarkdownImageSrc('file:///Users/cherry/a.png', '/notes/doc.md')).toBe(
      absolutePathToLocalMediaUrl('/Users/cherry/a.png'),
    )
  })

  it('resolves relative image paths against the current markdown file', () => {
    expect(resolveMarkdownImageSrc('./images/a b.png', '/Users/cherry/notes/doc.md')).toBe(
      absolutePathToLocalMediaUrl('/Users/cherry/notes/images/a b.png'),
    )
    expect(resolveMarkdownImageSrc('../assets/a.png', '/Users/cherry/notes/drafts/doc.md')).toBe(
      absolutePathToLocalMediaUrl('/Users/cherry/notes/assets/a.png'),
    )
  })

  it('resolves absolute local image paths to app-local media urls', () => {
    expect(resolveMarkdownImageSrc('/Users/cherry/notes/a.png', '/Users/cherry/notes/doc.md')).toBe(
      absolutePathToLocalMediaUrl('/Users/cherry/notes/a.png'),
    )
    expect(resolveMarkdownImageSrc('C:\\Users\\Cherry\\Notes\\a b.png', 'C:\\Users\\Cherry\\Notes\\doc.md')).toBe(
      absolutePathToLocalMediaUrl('C:\\Users\\Cherry\\Notes\\a b.png'),
    )
  })

  it('leaves unresolved relative image paths unchanged without a markdown file path', () => {
    expect(resolveMarkdownImageSrc('./images/a.png', null)).toBe('./images/a.png')
  })
})
