import { describe, expect, it } from 'vitest'

import type { SidebarState } from '../preload/index'
import {
  isPinnedDraft,
  isPinnedFile,
  resolvePinnedItems,
  resolvePinControl,
  resolveRemoveControl,
  resolveRemoveActionPlan,
  resolveVisibleTabItems,
  resolveWorkspaceLabel,
  shouldScrollWorkspaces,
} from './sidebar-view'

function createSidebarState(patch: Partial<SidebarState> = {}): SidebarState {
  return {
    sidebarOpen: true,
    sidebarWidth: 336,
    draftsExpanded: true,
    workdirExpanded: true,
    pinnedExpanded: true,
    recentFilesExpanded: true,
    workdirPath: null,
    workspacePaths: [],
    pinnedItems: [],
    activeSidebarTab: 'drafts',
    draftDirectoryPath: null,
    draftOnboardingCompleted: true,
    draftEntries: [],
    recentFiles: [],
    currentDocumentKind: 'blank',
    currentFilePath: null,
    currentDraftId: null,
    currentDisplayTitle: '未命名文档',
    isDrawerMode: false,
    workdirEntries: [],
    fileTitleOverrides: {},
    ...patch,
  }
}

describe('workspace view helpers', () => {
  it('uses 选择目录 when no workspace is selected', () => {
    expect(resolveWorkspaceLabel(null)).toBe('选择目录')
  })

  it('uses the folder basename for selected workspaces', () => {
    expect(resolveWorkspaceLabel('/Users/cherry/鹿鸣与小北')).toBe('鹿鸣与小北')
  })

  it('scrolls workspace history only after three entries', () => {
    expect(shouldScrollWorkspaces(['/a', '/b', '/c'])).toBe(false)
    expect(shouldScrollWorkspaces(['/a', '/b', '/c', '/d'])).toBe(true)
  })
})

describe('pinned view helpers', () => {
  it('checks pinned status for drafts and files', () => {
    const state = createSidebarState({
      pinnedItems: [
        { kind: 'draft', draftId: 'd1' },
        { kind: 'file', filePath: '/a.md' },
      ],
    })

    expect(isPinnedDraft(state, 'd1')).toBe(true)
    expect(isPinnedDraft(state, 'd2')).toBe(false)
    expect(isPinnedFile(state, '/a.md')).toBe(true)
    expect(isPinnedFile(state, '/b.md')).toBe(false)
  })

  it('resolves pin controls as icon-only actions', () => {
    expect(resolvePinControl(false, '数字一的对话')).toEqual({
      title: '置顶 数字一的对话',
      ariaLabel: '置顶 数字一的对话',
      icon: 'pin',
    })
    expect(resolvePinControl(true, '数字一的对话')).toEqual({
      title: '取消置顶 数字一的对话',
      ariaLabel: '取消置顶 数字一的对话',
      icon: 'pin-filled',
    })
  })

  it('resolves remove controls as icon-only actions', () => {
    expect(resolveRemoveControl('数字一的对话')).toEqual({
      title: '删除 数字一的对话',
      ariaLabel: '删除 数字一的对话',
      icon: 'trash',
    })
  })

  it('requires autosave flush before removing a workdir file', () => {
    expect(resolveRemoveActionPlan({
      kind: 'file',
      filePath: '/workspace/a.md',
      title: 'a.md',
      active: true,
      pinned: false,
      source: 'workdir',
    })).toEqual({
      kind: 'workdir',
      filePath: '/workspace/a.md',
      flushAutosaveFirst: true,
    })
  })

  it('resolves pinned drafts and files to visible sidebar items', () => {
    const state = createSidebarState({
      currentDraftId: 'd1',
      fileTitleOverrides: { '/a.md': '正式文稿' },
      pinnedItems: [
        { kind: 'draft', draftId: 'd1' },
        { kind: 'file', filePath: '/a.md' },
      ],
      draftEntries: [
        { id: 'd1', path: '/drafts/d1.md', createdAt: 1, updatedAt: 2, displayTitle: '草稿一' },
      ],
    })

    expect(resolvePinnedItems(state)).toEqual([
      {
        kind: 'draft',
        id: 'd1',
        title: '草稿一',
        active: true,
        pinned: true,
      },
      {
        kind: 'file',
        filePath: '/a.md',
        title: '正式文稿',
        active: false,
        pinned: true,
        source: 'pinned',
      },
    ])
  })
})

describe('tab view helpers', () => {
  it('shows draft entries in the drafts tab', () => {
    const state = createSidebarState({
      currentDraftId: 'd1',
      pinnedItems: [{ kind: 'draft', draftId: 'd1' }],
      draftEntries: [
        { id: 'd1', path: '/drafts/d1.md', createdAt: 1, updatedAt: 2, displayTitle: '草稿一' },
      ],
    })

    expect(resolveVisibleTabItems(state, 'drafts')).toEqual([
      {
        kind: 'draft',
        id: 'd1',
        title: '草稿一',
        active: true,
        pinned: true,
      },
    ])
  })

  it('shows formal files in the recent tab', () => {
    const state = createSidebarState({
      currentFilePath: '/a.md',
      pinnedItems: [{ kind: 'file', filePath: '/b.md' }],
      recentFiles: ['/a.md', '/b.md'],
      fileTitleOverrides: { '/b.md': 'B 文稿' },
    })

    expect(resolveVisibleTabItems(state, 'recent')).toEqual([
      {
        kind: 'file',
        filePath: '/a.md',
        title: 'a.md',
        active: true,
        pinned: false,
        source: 'recent',
      },
      {
        kind: 'file',
        filePath: '/b.md',
        title: 'B 文稿',
        active: false,
        pinned: true,
        source: 'recent',
      },
    ])
  })

  it('shows files from the active workdir tab', () => {
    const state = createSidebarState({
      currentFilePath: '/workspace/folder/b.md',
      activeSidebarTab: 'workdir',
      workdirEntries: [
        { absolutePath: '/workspace/a.md', relativePath: 'a.md' },
        { absolutePath: '/workspace/folder/b.md', relativePath: 'folder/b.md' },
      ],
      pinnedItems: [{ kind: 'file', filePath: '/workspace/a.md' }],
      fileTitleOverrides: { '/workspace/folder/b.md': 'B 文稿' },
    })

    expect(resolveVisibleTabItems(state, 'workdir')).toEqual([
      {
        kind: 'file',
        filePath: '/workspace/a.md',
        title: 'a.md',
        active: false,
        pinned: true,
        source: 'workdir',
      },
      {
        kind: 'file',
        filePath: '/workspace/folder/b.md',
        title: 'B 文稿',
        active: true,
        pinned: false,
        source: 'workdir',
      },
    ])
  })
})
