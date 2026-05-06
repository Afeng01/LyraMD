import { describe, expect, it } from 'vitest'

import {
  createOutlineId,
  normalizeHeadingText,
  shouldIncludeHeadingLevel,
} from './outline'

describe('normalizeHeadingText', () => {
  it('trims and collapses heading whitespace', () => {
    expect(normalizeHeadingText('  背景   说明  ')).toBe('背景 说明')
  })

  it('falls back for empty headings', () => {
    expect(normalizeHeadingText('   ')).toBe('未命名标题')
  })
})

describe('shouldIncludeHeadingLevel', () => {
  it('includes all Markdown heading levels', () => {
    for (const level of [1, 2, 3, 4, 5, 6]) {
      expect(shouldIncludeHeadingLevel(level)).toBe(true)
    }

    expect(shouldIncludeHeadingLevel(0)).toBe(false)
    expect(shouldIncludeHeadingLevel(7)).toBe(false)
  })
})

describe('createOutlineId', () => {
  it('creates a stable id from position and index', () => {
    expect(createOutlineId(12, 3)).toBe('outline-12-3')
  })
})
