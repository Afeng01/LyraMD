import { describe, expect, it } from 'vitest'

import {
  normalizeClipboardPlainText,
  sanitizeClipboardHtml,
} from './clipboard'

describe('normalizeClipboardPlainText', () => {
  it('preserves a real blank line between copied paragraphs', () => {
    expect(normalizeClipboardPlainText('First paragraph\n\nSecond paragraph')).toBe(
      'First paragraph\n\nSecond paragraph',
    )
  })

  it('trims stray leading and trailing newlines introduced by clipboard serializers', () => {
    expect(normalizeClipboardPlainText('\n\nAlpha\n\nBeta\n\n')).toBe('Alpha\n\nBeta')
  })

  it('preserves existing single-line breaks', () => {
    expect(normalizeClipboardPlainText('Line 1\nLine 2')).toBe('Line 1\nLine 2')
  })

  it('compresses obviously excessive empty runs down to a single intentional blank line', () => {
    expect(normalizeClipboardPlainText('Alpha\n\n\n\nBeta')).toBe('Alpha\n\nBeta')
  })
})

describe('sanitizeClipboardHtml', () => {
  it('removes leading and trailing br tags from copied html', () => {
    expect(sanitizeClipboardHtml('<br><p>Alpha</p><p>Beta</p><br>')).toBe(
      '<p>Alpha</p><p>Beta</p>',
    )
  })

  it('strips ProseMirror trailing break artifacts', () => {
    expect(
      sanitizeClipboardHtml(
        '<p>Alpha</p><p>Beta<br class="ProseMirror-trailingBreak"></p>',
      ),
    ).toBe('<p>Alpha</p><p>Beta</p>')
  })
})
