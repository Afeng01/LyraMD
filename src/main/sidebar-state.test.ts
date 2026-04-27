import { describe, expect, it } from 'vitest'

import { clampSidebarWidth, filterMissingRecentFiles, normalizeSidebarState, pushRecentFile, removeRecentFile } from './sidebar-state'

describe('pushRecentFile', () => {
  it('keeps existing order when a file is reopened', () => {
    const recentFiles = pushRecentFile(
      ['b.md', 'a.md', 'c.md'],
      'a.md',
      5,
    )

    expect(recentFiles).toEqual(['b.md', 'a.md', 'c.md'])
  })

  it('prepends newly opened files and trims the list to the configured max length', () => {
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

describe('removeRecentFile', () => {
  it('removes only the selected recent file', () => {
    expect(removeRecentFile(['a.md', 'b.md', 'c.md'], 'b.md')).toEqual(['a.md', 'c.md'])
  })
})

describe('normalizeSidebarState', () => {
  it('fills in defaults for new sidebar preferences', () => {
    expect(normalizeSidebarState({ recentFiles: ['a.md'] })).toEqual({
      sidebarOpen: false,
      sidebarWidth: 296,
      workdirExpanded: true,
      recentFilesExpanded: true,
      workdirPath: null,
      recentFiles: ['a.md'],
    })
  })

  it('trims persisted recent files to the supported maximum', () => {
    expect(normalizeSidebarState({
      recentFiles: Array.from({ length: 12 }, (_, index) => `${index}.md`),
    }).recentFiles).toHaveLength(10)
  })
})

describe('clampSidebarWidth', () => {
  it('keeps sidebar width within the supported range', () => {
    expect(clampSidebarWidth(120)).toBe(220)
    expect(clampSidebarWidth(320)).toBe(320)
    expect(clampSidebarWidth(560)).toBe(460)
    expect(clampSidebarWidth(Number.NaN)).toBe(296)
  })
})
