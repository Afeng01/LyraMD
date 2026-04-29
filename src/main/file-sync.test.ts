import { describe, expect, it } from 'vitest'

import {
  consumeIgnoredWatchedContent,
  reconcileWatchedContent,
  recordIgnoredWatchedContent,
} from './file-sync'

describe('ignored watched content queue', () => {
  it('consumes one ignored internal write at a time', () => {
    const ignoredWatchedContents = new Map<string, number>()
    recordIgnoredWatchedContent(ignoredWatchedContents, 'draft a')
    recordIgnoredWatchedContent(ignoredWatchedContents, 'draft a')

    expect(consumeIgnoredWatchedContent(ignoredWatchedContents, 'draft a')).toBe(true)
    expect(ignoredWatchedContents.get('draft a')).toBe(1)
    expect(consumeIgnoredWatchedContent(ignoredWatchedContents, 'draft a')).toBe(true)
    expect(ignoredWatchedContents.has('draft a')).toBe(false)
  })

  it('does not consume unrelated watched content', () => {
    const ignoredWatchedContents = new Map<string, number>()
    recordIgnoredWatchedContent(ignoredWatchedContents, 'draft a')

    expect(consumeIgnoredWatchedContent(ignoredWatchedContents, 'draft b')).toBe(false)
    expect(ignoredWatchedContents.get('draft a')).toBe(1)
  })
})

describe('reconcileWatchedContent', () => {
  it('ignores watched file content that matches the already-synced content', () => {
    expect(reconcileWatchedContent('draft a', 'draft a')).toEqual({
      nextSyncedContent: 'draft a',
      shouldPropagate: false,
    })
  })

  it('propagates genuinely new watched file content', () => {
    expect(reconcileWatchedContent('draft a', 'draft ab')).toEqual({
      nextSyncedContent: 'draft ab',
      shouldPropagate: true,
    })
  })

  it('treats the first watched content as syncable baseline', () => {
    expect(reconcileWatchedContent(null, 'loaded file')).toEqual({
      nextSyncedContent: 'loaded file',
      shouldPropagate: true,
    })
  })
})
