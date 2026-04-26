import { describe, expect, it } from 'vitest'

import { filterMissingRecentFiles, pushRecentFile } from './sidebar-state'

describe('pushRecentFile', () => {
  it('moves reopened files to the front and removes duplicates', () => {
    const recentFiles = pushRecentFile(
      ['b.md', 'a.md', 'c.md'],
      'a.md',
      5,
    )

    expect(recentFiles).toEqual(['a.md', 'b.md', 'c.md'])
  })

  it('trims the list to the configured max length', () => {
    const recentFiles = pushRecentFile(
      ['d.md', 'c.md', 'b.md'],
      'a.md',
      3,
    )

    expect(recentFiles).toEqual(['a.md', 'd.md', 'c.md'])
  })
})

describe('filterMissingRecentFiles', () => {
  it('drops paths that no longer exist and preserves order', () => {
    const recentFiles = filterMissingRecentFiles(
      ['a.md', 'b.md', 'c.md'],
      (filePath) => filePath !== 'b.md',
      5,
    )

    expect(recentFiles).toEqual(['a.md', 'c.md'])
  })
})
