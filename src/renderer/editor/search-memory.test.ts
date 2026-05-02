import { describe, expect, it } from 'vitest'

import {
  rememberQueryForDocument,
  resolveActiveMatchAfterRefresh,
  resolveRememberedQuery,
  resolveSearchCount,
  type SearchMemoryState,
  type SearchRangeLike,
} from './search-memory'

describe('rememberQueryForDocument', () => {
  it('stores a query for the current document without mutating other remembered queries', () => {
    const state: SearchMemoryState = {
      '/b.md': 'beta',
    }

    expect(rememberQueryForDocument(state, '/a.md', 'alpha')).toEqual({
      '/a.md': 'alpha',
      '/b.md': 'beta',
    })
  })

  it('stores the remembered query in its normalized single-line form', () => {
    expect(rememberQueryForDocument({}, '/a.md', 'alpha\n\n beta')).toEqual({
      '/a.md': 'alpha beta',
    })
  })

  it('removes the remembered query when the next query is empty', () => {
    const state: SearchMemoryState = {
      '/a.md': 'alpha',
    }

    expect(rememberQueryForDocument(state, '/a.md', '')).toEqual({})
  })

  it('ignores null document keys', () => {
    const state: SearchMemoryState = {
      '/a.md': 'alpha',
    }

    expect(rememberQueryForDocument(state, null, 'beta')).toBe(state)
  })
})

describe('resolveRememberedQuery', () => {
  it('returns the stored query for a document', () => {
    expect(resolveRememberedQuery({
      '/a.md': 'alpha',
      '/b.md': 'beta',
    }, '/a.md')).toBe('alpha')
  })

  it('falls back to an empty query when the document has no remembered entry', () => {
    expect(resolveRememberedQuery({}, '/missing.md')).toBe('')
  })
})

describe('resolveSearchCount', () => {
  it('returns zeroes for an empty query', () => {
    expect(resolveSearchCount('', 3, 1)).toEqual({
      activeNumber: 0,
      totalMatches: 0,
    })
  })

  it('returns the active match number for a non-empty query', () => {
    expect(resolveSearchCount('target', 3, 1)).toEqual({
      activeNumber: 2,
      totalMatches: 3,
    })
  })
})

describe('resolveActiveMatchAfterRefresh', () => {
  it('keeps the exact active match when it still exists after refresh', () => {
    const nextMatches: SearchRangeLike[] = [
      { index: 0, from: 5, to: 8 },
      { index: 1, from: 18, to: 21 },
      { index: 2, from: 28, to: 31 },
    ]

    expect(resolveActiveMatchAfterRefresh(18, nextMatches)).toBe(1)
  })

  it('prefers the nearest not-later successor when the original match disappears', () => {
    const nextMatches: SearchRangeLike[] = [
      { index: 0, from: 5, to: 8 },
      { index: 1, from: 18, to: 21 },
      { index: 2, from: 28, to: 31 },
    ]

    expect(resolveActiveMatchAfterRefresh(20, nextMatches)).toBe(2)
  })

  it('falls back to the nearest predecessor when no successor exists', () => {
    const nextMatches: SearchRangeLike[] = [
      { index: 0, from: 5, to: 8 },
      { index: 1, from: 18, to: 21 },
    ]

    expect(resolveActiveMatchAfterRefresh(40, nextMatches)).toBe(1)
  })

  it('clears the active match when no matches remain', () => {
    expect(resolveActiveMatchAfterRefresh(20, [])).toBe(-1)
  })
})
