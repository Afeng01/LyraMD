import { describe, expect, it } from 'vitest'

import {
  buildSearchMatchPreview,
  createSearchState,
  getNearbySearchMatchPreviews,
  normalizeSearchQuery,
  resolveSearchPanelPreview,
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

describe('normalizeSearchQuery', () => {
  it('normalizes multi-line input into a single-line search query', () => {
    expect(normalizeSearchQuery('  alpha\n\n beta \n gamma  ')).toBe('alpha beta gamma')
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

describe('resolveSearchPanelPreview', () => {
  it('returns an idle preview when the query is empty', () => {
    const state = createSearchState('alpha line\nbeta line', '')

    expect(resolveSearchPanelPreview(state)).toEqual({
      status: 'idle',
      previousLine: '',
      currentLine: '输入关键词开始搜索',
      nextLine: '',
    })
  })

  it('returns an empty preview when a query has no matches', () => {
    const state = createSearchState('alpha line\nbeta line', 'target')

    expect(resolveSearchPanelPreview(state)).toEqual({
      status: 'empty',
      previousLine: '',
      currentLine: '未找到匹配内容',
      nextLine: '',
    })
  })

  it('returns the previous, current, and next line for the active match', () => {
    const state = createSearchState(
      'alpha line\nbeta target line\ngamma line',
      'target',
    )

    expect(resolveSearchPanelPreview(state)).toEqual({
      status: 'ready',
      previousLine: 'alpha line',
      currentLineBefore: 'beta',
      currentLineMatch: 'target',
      currentLineAfter: 'line',
      nextLine: 'gamma line',
    })
  })
})
