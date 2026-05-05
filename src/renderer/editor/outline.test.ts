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
  it('includes only H1 and H2 for this release', () => {
    expect(shouldIncludeHeadingLevel(1)).toBe(true)
    expect(shouldIncludeHeadingLevel(2)).toBe(true)
    expect(shouldIncludeHeadingLevel(3)).toBe(false)
  })
})

describe('createOutlineId', () => {
  it('creates a stable id from position and index', () => {
    expect(createOutlineId(12, 3)).toBe('outline-12-3')
  })
})
