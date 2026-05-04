import { describe, expect, it } from 'vitest'

import {
  addWorkspacePath,
  canTogglePinnedFile,
  migratePinnedDraftToFile,
  normalizePinnedItems,
  normalizeSidebarTab,
  normalizeWorkspacePaths,
  samePinnedItem,
  togglePinnedItem,
} from './workbench-state'

describe('normalizeSidebarTab', () => {
  it('defaults to drafts for unknown values', () => {
    expect(normalizeSidebarTab(undefined)).toBe('drafts')
    expect(normalizeSidebarTab('bad')).toBe('drafts')
  })

  it('preserves the recent tab when explicitly persisted', () => {
    expect(normalizeSidebarTab('recent')).toBe('recent')
  })
})

describe('workspace path helpers', () => {
  it('adds new workspaces to the front and trims to the supported maximum', () => {
    expect(addWorkspacePath(['/a', '/b'], '/c', 2)).toEqual(['/c', '/a'])
  })

  it('moves an existing workspace to the front without duplicating it', () => {
    expect(addWorkspacePath(['/a', '/b', '/c'], '/b', 5)).toEqual(['/b', '/a', '/c'])
  })

  it('normalizes persisted workspaces and includes the active legacy workdir', () => {
    expect(normalizeWorkspacePaths(['/a', 12, '/b'], '/active')).toEqual(['/active', '/a', '/b'])
  })
})

describe('pinned item helpers', () => {
  it('normalizes only supported pinned item records', () => {
    expect(normalizePinnedItems([
      { kind: 'draft', draftId: 'd1' },
      { kind: 'file', filePath: '/a.md' },
      { kind: 'draft', draftId: '' },
      { kind: 'file', filePath: '' },
      { kind: 'workspace', path: '/ignored' },
      null,
    ])).toEqual([
      { kind: 'draft', draftId: 'd1' },
      { kind: 'file', filePath: '/a.md' },
    ])
  })

  it('compares pinned items by kind and identity', () => {
    expect(samePinnedItem({ kind: 'draft', draftId: 'd1' }, { kind: 'draft', draftId: 'd1' })).toBe(true)
    expect(samePinnedItem({ kind: 'draft', draftId: 'd1' }, { kind: 'file', filePath: '/d1.md' })).toBe(false)
    expect(samePinnedItem({ kind: 'file', filePath: '/a.md' }, { kind: 'file', filePath: '/a.md' })).toBe(true)
  })

  it('toggles pinned items without duplicates', () => {
    expect(togglePinnedItem([], { kind: 'draft', draftId: 'd1' })).toEqual([
      { kind: 'draft', draftId: 'd1' },
    ])
    expect(togglePinnedItem([{ kind: 'draft', draftId: 'd1' }], { kind: 'draft', draftId: 'd1' })).toEqual([])
  })

  it('migrates a pinned draft to a pinned file after formal save', () => {
    expect(migratePinnedDraftToFile([
      { kind: 'draft', draftId: 'd1' },
      { kind: 'file', filePath: '/existing.md' },
    ], 'd1', '/final.md')).toEqual([
      { kind: 'file', filePath: '/final.md' },
      { kind: 'file', filePath: '/existing.md' },
    ])
  })

  it('allows a previously pinned file to be toggled even when it is no longer recent or in the active workspace', () => {
    expect(canTogglePinnedFile({
      filePath: '/pinned-only.md',
      fileExists: true,
      knownWorkdirFiles: [],
      recentFiles: [],
      currentFilePath: null,
      pinnedItems: [{ kind: 'file', filePath: '/pinned-only.md' }],
    })).toBe(true)
  })
})
