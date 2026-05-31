import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import type { SidebarState } from '../preload/index'
import {
  createWorkspaceRootTreeNode,
  isPinnedDraft,
  isPinnedFile,
  resolvePinnedItems,
  resolvePinControl,
  resolveRemoveActionKey,
  resolveRemoveControl,
  resolveRemoveActionPlan,
  resolveSidebarInlineTitleCommitAction,
  resolveVisibleTabItems,
  resolveVisibleWorkdirTreeRows,
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
    workdirTree: [],
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

  it('scrolls workspace history after two entries', () => {
    expect(shouldScrollWorkspaces(['/a', '/b'])).toBe(false)
    expect(shouldScrollWorkspaces(['/a', '/b', '/c'])).toBe(true)
  })

  it('lets the library list fill the remaining sidebar height', () => {
    const html = readFileSync(join(process.cwd(), 'src/renderer/index.html'), 'utf8')
    const css = readFileSync(join(process.cwd(), 'src/renderer/themes/base.css'), 'utf8')

    expect(html).toContain('<div id="library-scroll-region">')
    expect(css).toMatch(/#sidebar\s*\{[\s\S]*overflow:\s*hidden/)
    expect(css).toMatch(/#library-section\s*\{[\s\S]*flex:\s*1/)
    expect(css).toMatch(/#library-section\s*\{[\s\S]*max-height:\s*none/)
    expect(css).toMatch(/#library-scroll-region\s*\{[\s\S]*overflow-y:\s*auto/)
    expect(css).toMatch(/#library-scroll-region\s*\{[\s\S]*flex:\s*1/)
    expect(css).toMatch(/#library-scroll-region\s*\{[\s\S]*max-height:\s*none/)
    expect(css).toMatch(/#library-scroll-region\s*\{[\s\S]*overscroll-behavior:\s*contain/)
  })

  it('keeps workspace scrolling bounded to two visible workspaces', () => {
    const css = readFileSync(join(process.cwd(), 'src/renderer/themes/base.css'), 'utf8')

    expect(css).toMatch(/\.workspace-list\.scrollable\s*\{[\s\S]*max-height:\s*calc\(\(34px \+ 5px\) \* 2 - 5px\)/)
    expect(css).toMatch(/\.workspace-list\.scrollable\s*\{[\s\S]*overscroll-behavior:\s*contain/)
  })

  it('renders workspace remove controls and preserves library scroll when toggling folders', () => {
    const renderer = readFileSync(join(process.cwd(), 'src/renderer/main.ts'), 'utf8')
    const preload = readFileSync(join(process.cwd(), 'src/preload/index.ts'), 'utf8')
    const main = readFileSync(join(process.cwd(), 'src/main/index.ts'), 'utf8')

    expect(renderer).toContain('data-remove-workspace-path')
    expect(renderer).toContain('renderSidebarPreservingLibraryScroll')
    expect(readFileSync(join(process.cwd(), 'src/renderer/themes/base.css'), 'utf8')).toContain('.workspace-item.active + .workspace-row-actions')
    expect(preload).toContain("removeWorkspace: (path: string) => ipcRenderer.invoke('remove-workspace', path)")
    expect(main).toContain("ipcMain.handle('remove-workspace'")
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
      tone: 'normal',
    })
  })

  it('resolves confirmed remove controls as a dangerous check action', () => {
    expect(resolveRemoveControl('数字一的对话', true)).toEqual({
      title: '确认删除 数字一的对话',
      ariaLabel: '确认删除 数字一的对话',
      icon: 'check',
      tone: 'danger',
    })
  })

  it('requires autosave flush before removing a workdir file', () => {
    const plan = resolveRemoveActionPlan({
      kind: 'file',
      filePath: '/workspace/a.md',
      title: 'a.md',
      active: true,
      pinned: false,
      source: 'workdir',
    })

    expect(plan).toEqual({
      kind: 'workdir',
      filePath: '/workspace/a.md',
      flushAutosaveFirst: true,
    })
    expect(plan ? resolveRemoveActionKey(plan) : null).toBe('workdir:/workspace/a.md')
  })

  it('commits file list title edits as real file renames', () => {
    expect(resolveSidebarInlineTitleCommitAction({
      kind: 'file',
      filePath: '/workspace/a.md',
      source: 'workdir',
    })).toEqual({
      kind: 'rename-file-title',
      filePath: '/workspace/a.md',
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

  it('caps pinned rows at three items before vertical scrolling', () => {
    const css = readFileSync(join(process.cwd(), 'src/renderer/themes/base.css'), 'utf8')

    const pinnedRule = css.match(/#pinned-list\s*\{[\s\S]*?\}/)?.[0] ?? ''
    expect(pinnedRule).toContain('max-height: calc((34px + 4px) * 3 - 4px)')
    expect(pinnedRule).toContain('overflow-y: auto')
    expect(pinnedRule).toContain('overscroll-behavior: contain')
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

describe('workdir tree helpers', () => {
  it('wraps each workspace tree under its own root folder', () => {
    expect(createWorkspaceRootTreeNode('/Users/cherry/Notes', [
      {
        absolutePath: '/Users/cherry/Notes/a.md',
        kind: 'file',
        name: 'a.md',
        relativePath: 'a.md',
      },
    ])).toEqual({
      absolutePath: '/Users/cherry/Notes',
      children: [
        {
          absolutePath: '/Users/cherry/Notes/a.md',
          kind: 'file',
          name: 'a.md',
          relativePath: 'a.md',
        },
      ],
      kind: 'directory',
      name: 'Notes',
      relativePath: 'Notes',
    })
  })

  it('flattens tree rows with active files and collapsed folders', () => {
    const state = createSidebarState({
      currentFilePath: '/workspace/notes/nested/c.md',
      workdirTree: [
        {
          absolutePath: '/workspace/a.md',
          kind: 'file',
          name: 'a.md',
          relativePath: 'a.md',
        },
        {
          absolutePath: '/workspace/notes',
          children: [
            {
              absolutePath: '/workspace/notes/b.md',
              kind: 'file',
              name: 'b.md',
              relativePath: 'notes/b.md',
            },
            {
              absolutePath: '/workspace/notes/nested',
              children: [
                {
                  absolutePath: '/workspace/notes/nested/c.md',
                  kind: 'file',
                  name: 'c.md',
                  relativePath: 'notes/nested/c.md',
                },
              ],
              kind: 'directory',
              name: 'nested',
              relativePath: 'notes/nested',
            },
          ],
          kind: 'directory',
          name: 'notes',
          relativePath: 'notes',
        },
      ],
    })

    expect(resolveVisibleWorkdirTreeRows(state, new Set(['/workspace/notes/nested']))).toMatchObject([
      { kind: 'file', filePath: '/workspace/a.md', depth: 0, active: false },
      { kind: 'directory', absolutePath: '/workspace/notes', depth: 0, expanded: true },
      { kind: 'file', filePath: '/workspace/notes/b.md', depth: 1, active: false },
      { kind: 'directory', absolutePath: '/workspace/notes/nested', depth: 1, expanded: true },
      { kind: 'file', filePath: '/workspace/notes/nested/c.md', depth: 2, active: true },
    ])

    expect(resolveVisibleWorkdirTreeRows(state, new Set(), new Set(['/workspace/notes']))).toMatchObject([
      { kind: 'file', filePath: '/workspace/a.md', depth: 0 },
      { kind: 'directory', absolutePath: '/workspace/notes', depth: 0, expanded: false },
    ])
  })
})

describe('library create action regression', () => {
  it('renders a dedicated draft create button next to drafts and recent', () => {
    const html = readFileSync(join(process.cwd(), 'src/renderer/index.html'), 'utf8')
    const renderer = readFileSync(join(process.cwd(), 'src/renderer/main.ts'), 'utf8')

    expect(html).toContain('id="draft-new"')
    expect(renderer).toContain('draftNew?.addEventListener')
    expect(renderer).toContain('beginBlankDocumentFromSidebar()')
  })

  it('routes the library plus button to workdir file creation on the workdir tab', () => {
    const renderer = readFileSync(join(process.cwd(), 'src/renderer/main.ts'), 'utf8')
    const preload = readFileSync(join(process.cwd(), 'src/preload/index.ts'), 'utf8')
    const main = readFileSync(join(process.cwd(), 'src/main/index.ts'), 'utf8')

    expect(renderer).toContain("sidebarState?.activeSidebarTab !== 'workdir'")
    expect(renderer).toContain('openLibraryCreateMenu()')
    expect(renderer).toContain('api.createWorkdirFile()')
    expect(renderer).not.toContain("currentFileNew.hidden = activeTab !== 'workdir'")
    expect(preload).toContain("createWorkdirFile: () => ipcRenderer.invoke('create-workdir-file')")
    expect(main).toContain("ipcMain.handle('create-workdir-file'")
  })

  it('wires the workdir create folder action through preload and main IPC', () => {
    const renderer = readFileSync(join(process.cwd(), 'src/renderer/main.ts'), 'utf8')
    const preload = readFileSync(join(process.cwd(), 'src/preload/index.ts'), 'utf8')
    const main = readFileSync(join(process.cwd(), 'src/main/index.ts'), 'utf8')

    expect(renderer).not.toContain('data-create-workdir-folder')
    expect(renderer).toContain('api.createWorkdirFolder()')
    expect(preload).toContain("createWorkdirFolder: () => ipcRenderer.invoke('create-workdir-folder')")
    expect(main).toContain("ipcMain.handle('create-workdir-folder'")
  })

  it('renders one contextual library plus menu instead of a second workdir plus', () => {
    const html = readFileSync(join(process.cwd(), 'src/renderer/index.html'), 'utf8')
    const css = readFileSync(join(process.cwd(), 'src/renderer/themes/base.css'), 'utf8')

    expect(html).toContain('id="library-create-menu"')
    expect(html).toContain('id="library-create-file"')
    expect(html).toContain('id="library-create-folder"')
    expect(html).not.toContain('id="current-file-new"')
    expect(html.indexOf('id="workdir-tab"')).toBeLessThan(html.indexOf('id="draft-new"'))
    expect(css).toContain('grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1.35fr) 28px')
    expect(css).not.toContain('box-shadow: inset 2px 0 0 color-mix(in srgb, var(--link-color) 72%, transparent 28%);')
  })

  it('uses the same context-aware creation path for the Cmd/Ctrl+N menu event', () => {
    const renderer = readFileSync(join(process.cwd(), 'src/renderer/main.ts'), 'utf8')
    const menuEventStart = renderer.indexOf('api.onNewFileInWindow(() => {')
    const menuEventEnd = renderer.indexOf('\n  })', menuEventStart)
    const menuEventBody = renderer.slice(menuEventStart, menuEventEnd)

    expect(menuEventBody).toContain('beginLibraryDocumentFromSidebar()')
    expect(menuEventBody).not.toContain('beginBlankDocumentFromSidebar()')
  })
})

describe('sidebar polish regression', () => {
  it('sets title attributes on draft items for hover tooltip', () => {
    const renderer = readFileSync(join(process.cwd(), 'src/renderer/main.ts'), 'utf8')

    // Draft items should set item.title = title
    expect(renderer).toContain('item.title = title')
  })

  it('keeps active sidebar row titles on one line', () => {
    const css = readFileSync(join(process.cwd(), 'src/renderer/themes/base.css'), 'utf8')
    const activeTitleRule = css.match(/\.sidebar-list-item\.active \.sidebar-title\s*\{[\s\S]*?\}/)?.[0] ?? ''

    expect(activeTitleRule).toContain('white-space: nowrap')
    expect(activeTitleRule).toContain('text-overflow: ellipsis')
    expect(activeTitleRule).not.toContain('-webkit-line-clamp')
    expect(activeTitleRule).not.toContain('white-space: normal')
  })

  it('matches workspace surface color to the library area', () => {
    const css = readFileSync(join(process.cwd(), 'src/renderer/themes/base.css'), 'utf8')
    const workspaceRule = css.match(/#workspaces-section\s*\{[\s\S]*?\}/)?.[0] ?? ''
    const libraryRule = css.match(/#library-section\s*\{[\s\S]*?\}/)?.[0] ?? ''

    expect(workspaceRule).toContain('background: color-mix(in srgb, var(--bg-color) 96%, var(--border-color) 4%)')
    expect(workspaceRule).toContain('border: 1px solid color-mix(in srgb, var(--border-color) 58%, transparent 42%)')
    expect(libraryRule).toContain('background: color-mix(in srgb, var(--bg-color) 96%, var(--border-color) 4%)')
  })

  it('keeps pinned rows in a compact three-item scroll area', () => {
    const css = readFileSync(join(process.cwd(), 'src/renderer/themes/base.css'), 'utf8')
    const pinnedRule = css.match(/#pinned-list\s*\{[\s\S]*?\}/)?.[0] ?? ''

    expect(pinnedRule).toContain('max-height: calc((34px + 4px) * 3 - 4px)')
    expect(pinnedRule).toContain('overflow-y: auto')
  })

  it('hides sidebar scroll thumbs until the scroll region is active', () => {
    const css = readFileSync(join(process.cwd(), 'src/renderer/themes/base.css'), 'utf8')

    expect(css).toContain('#sidebar :is(#workspaces-list, #pinned-list, #library-scroll-region)::-webkit-scrollbar-thumb')
    expect(css).toContain('background: transparent')
    expect(css).toContain('#sidebar :is(#workspaces-list, #pinned-list, #library-scroll-region):hover::-webkit-scrollbar-thumb')
    expect(css).toContain('#sidebar :is(#workspaces-list, #pinned-list, #library-scroll-region):focus-within::-webkit-scrollbar-thumb')
  })

  it('uses a stronger tab active state with existing color variables', () => {
    const css = readFileSync(join(process.cwd(), 'src/renderer/themes/base.css'), 'utf8')

    // Active tab should have higher selection-bg mix and a subtle box-shadow
    expect(css).toMatch(/\.sidebar-tabs button\.active\s*\{[\s\S]*selection-bg\) 52%/)
    expect(css).toMatch(/\.sidebar-tabs button\.active\s*\{[\s\S]*box-shadow/)
  })

  it('adds a subtle separator below the tab row', () => {
    const css = readFileSync(join(process.cwd(), 'src/renderer/themes/base.css'), 'utf8')

    expect(css).toMatch(/\.sidebar-library-header\s*\{[\s\S]*border-bottom:\s*1px solid/)
    expect(css).toMatch(/\.sidebar-library-header\s*\{[\s\S]*margin-bottom:\s*10px/)
    expect(css).toMatch(/\.sidebar-library-header\s*\{[\s\S]*padding-bottom:\s*8px/)
  })
})
