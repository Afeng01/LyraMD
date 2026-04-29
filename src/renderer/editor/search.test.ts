import { describe, expect, it } from 'vitest'

import {
  buildSearchMatchPreview,
  createSearchState,
  getNearbySearchMatchPreviews,
} from './search'

describe('buildSearchMatchPreview', () => {
  it('captures the previous, current, and next line around a match', () => {
    const text = 'alpha line\nbeta target line\ngamma line'
    const match = { index: 0, from: 16, to: 22 }

    expect(buildSearchMatchPreview(text, match)).toEqual({
      ...match,
      previousLine: 'alpha line',
      before: 'beta',
      match: 'target',
      after: 'line',
      nextLine: 'gamma line',
    })
  })
})

describe('getNearbySearchMatchPreviews', () => {
  it('returns only the active match and its immediate neighbors', () => {
    const state = createSearchState(
      'one target\nsecond target\nthird target\nfourth target',
      'target',
      { previousActiveIndex: 2 },
    )

    expect(getNearbySearchMatchPreviews(state).map((match) => match.index)).toEqual([1, 2, 3])
  })
})
