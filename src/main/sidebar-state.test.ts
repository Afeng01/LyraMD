import { describe, expect, it } from 'vitest'

import {
  DEFAULT_SIDEBAR_STATE,
  DEFAULT_SIDEBAR_WIDTH,
  clampSidebarWidth,
  filterMissingRecentFiles,
  getSidebarOpenForWindow,
  normalizeDrawerSidebarOpen,
  normalizeSidebarState,
  pushRecentFile,
  removeRecentFile,
} from './sidebar-state'

describe('sidebar defaults', () => {
  it('uses a compact default width for fresh sessions', () => {
    expect(DEFAULT_SIDEBAR_WIDTH).toBe(280)
    expect(DEFAULT_SIDEBAR_STATE.sidebarWidth).toBe(280)
  })

  it('keeps twenty recent files by default', () => {
    expect(DEFAULT_SIDEBAR_STATE.recentFiles).toHaveLength(0)
    expect(pushRecentFile(
      Array.from({ length: 20 }, (_, index) => `${index}.md`),
      'new.md',
    )).toHaveLength(20)
  })
})

describe('pushRecentFile', () => {
  it('keeps the original order when reopening an already listed file', () => {
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
      sidebarWidth: 280,
      draftsExpanded: true,
      workdirExpanded: true,
      pinnedExpanded: true,
      recentFilesExpanded: true,
      workdirPath: null,
      workspacePaths: [],
      pinnedItems: [],
      activeSidebarTab: 'drafts',
      draftDirectoryPath: null,
      draftOnboardingCompleted: false,
      draftEntries: [],
      recentFiles: ['a.md'],
      fileTitleOverrides: {},
    })
  })

  it('trims persisted recent files to the supported maximum', () => {
    expect(normalizeSidebarState({
      recentFiles: Array.from({ length: 24 }, (_, index) => `${index}.md`),
    }).recentFiles).toHaveLength(20)
  })

  it('sanitizes invalid draft persistence fields', () => {
      expect(normalizeSidebarState({
        draftsExpanded: false,
        pinnedExpanded: false,
        draftDirectoryPath: 123,
        draftOnboardingCompleted: 'yes',
        workdirPath: '/active',
        workspacePaths: ['/a', 123, '/active'],
        activeSidebarTab: 'workdir',
        pinnedItems: [
          { kind: 'draft', draftId: 'draft-a' },
          { kind: 'file', filePath: '/tmp/a.md' },
          { kind: 'workspace', path: '/tmp' },
        ],
        draftEntries: [
          { id: 'ok', path: '/tmp/a.md', createdAt: 1, updatedAt: 2, displayTitle: 'OK' },
          { id: 'missing-path', createdAt: 1, updatedAt: 2, displayTitle: 'Missing' },
          'bad-entry',
      ],
      fileTitleOverrides: {
        '/tmp/a.md': 'A',
        '/tmp/b.md': 123,
      },
    })).toEqual({
      sidebarOpen: false,
        sidebarWidth: 280,
        draftsExpanded: false,
        workdirExpanded: true,
        pinnedExpanded: false,
        recentFilesExpanded: true,
        workdirPath: '/active',
        workspacePaths: ['/a', '/active'],
        pinnedItems: [
          { kind: 'draft', draftId: 'draft-a' },
          { kind: 'file', filePath: '/tmp/a.md' },
        ],
        activeSidebarTab: 'workdir',
        draftDirectoryPath: null,
        draftOnboardingCompleted: false,
        draftEntries: [
          { id: 'ok', path: '/tmp/a.md', createdAt: 1, updatedAt: 2, displayTitle: 'OK' },
        ],
      recentFiles: [],
      fileTitleOverrides: {
        '/tmp/a.md': 'A',
      },
    })
  })
})

describe('clampSidebarWidth', () => {
  it('keeps sidebar width within the supported range', () => {
    expect(clampSidebarWidth(120)).toBe(220)
    expect(clampSidebarWidth(320)).toBe(320)
    expect(clampSidebarWidth(560)).toBe(460)
    expect(clampSidebarWidth(Number.NaN)).toBe(280)
  })

  it('migrates the old roomy default to the compact workbench width', () => {
    expect(normalizeSidebarState({ sidebarWidth: 336 }).sidebarWidth).toBe(280)
    expect(normalizeSidebarState({ sidebarWidth: 275 }).sidebarWidth).toBe(275)
  })
})

describe('drawer sidebar visibility', () => {
  it('keeps drawer mode editor-first even when desktop sidebar was open', () => {
    expect(getSidebarOpenForWindow(true, true, false)).toBe(false)
  })

  it('still respects the persisted sidebar state on desktop widths', () => {
    expect(getSidebarOpenForWindow(true, false, false)).toBe(true)
    expect(getSidebarOpenForWindow(false, false, true)).toBe(false)
  })

  it('prefers the current window desktop sidebar state over the persisted default', () => {
    expect(getSidebarOpenForWindow(true, false, false, false)).toBe(false)
    expect(getSidebarOpenForWindow(false, false, true, true)).toBe(true)
  })

  it('resets drawer visibility when entering or leaving drawer mode', () => {
    expect(normalizeDrawerSidebarOpen(false, true, true)).toBe(false)
    expect(normalizeDrawerSidebarOpen(true, false, true)).toBe(false)
    expect(normalizeDrawerSidebarOpen(true, true, true)).toBe(true)
  })
})
