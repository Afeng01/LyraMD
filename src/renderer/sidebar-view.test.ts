import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import type { SidebarState } from '../preload/index'
import {
  createWorkspaceRootTreeNode,
  isPinnedDraft,
  isPinnedFile,
  resolvePinControl,
  resolveRemoveActionKey,
  resolveRemoveControl,
  resolveRemoveActionPlan,
  resolveSidebarInlineTitleCommitAction,
  resolveVisibleTabItems,
  resolveVisibleWorkdirTreeRows,
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

describe('sidebar workbench layout', () => {
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

  it('removes the workspace list UI while keeping directory selection in the workdir plus menu', () => {
    const html = readFileSync(join(process.cwd(), 'src/renderer/index.html'), 'utf8')
    const renderer = readFileSync(join(process.cwd(), 'src/renderer/main.ts'), 'utf8')
    const main = readFileSync(join(process.cwd(), 'src/main/index.ts'), 'utf8')

    expect(html).not.toContain('id="workspaces-list"')
    expect(html).toContain('id="library-select-workdir"')
    expect(renderer).toContain('librarySelectWorkdir?.addEventListener')
    expect(renderer).toContain('api.chooseWorkdir()')
    expect(main).toContain("ipcMain.handle('choose-workdir'")
    expect(renderer).toContain('renderSidebarPreservingLibraryScroll')
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

  it('marks pinned items inside the normal tab lists instead of a separate pinned section', () => {
    const state = createSidebarState({
      currentDraftId: 'd1',
      pinnedItems: [
        { kind: 'draft', draftId: 'd1' },
        { kind: 'file', filePath: '/a.md' },
      ],
      recentFiles: ['/a.md'],
      draftEntries: [
        { id: 'd1', path: '/drafts/d1.md', createdAt: 1, updatedAt: 2, displayTitle: '草稿一' },
      ],
    })

    const tabItems = resolveVisibleTabItems(state, 'recent')
    expect(tabItems).toEqual([
      {
        kind: 'file',
        filePath: '/a.md',
        title: 'a.md',
        active: false,
        pinned: true,
        source: 'recent',
      },
    ])

    const html = readFileSync(join(process.cwd(), 'src/renderer/index.html'), 'utf8')
    const css = readFileSync(join(process.cwd(), 'src/renderer/themes/base.css'), 'utf8')
    const renderer = readFileSync(join(process.cwd(), 'src/renderer/main.ts'), 'utf8')

    expect(html).not.toContain('id="pinned-section"')
    expect(html).not.toContain('id="pinned-list"')
    expect(css).not.toContain('#pinned-list')
    expect(renderer).not.toContain('resolvePinnedItems')
    expect(renderer).toContain("source: 'recent' | 'workdir'")
  })

  it('renders an inline star mark on pinned rows in the tab lists', () => {
    const renderer = readFileSync(join(process.cwd(), 'src/renderer/main.ts'), 'utf8')
    const css = readFileSync(join(process.cwd(), 'src/renderer/themes/base.css'), 'utf8')

    expect(renderer).toContain("if (item.pinned) appendPinnedMark(draftRow)")
    expect(renderer).toContain("if (item.pinned) appendPinnedMark(fileRow)")
    expect(renderer).toContain("'sidebar-pinned-mark'")
    expect(css).toContain('.sidebar-pinned-mark')
    expect(css).toMatch(/\.sidebar-pinned-mark\s*\{[\s\S]*?color:\s*#e3a13b/)
    // 星标与标题同行：content 必须是 flex 容器，否则块级标题把星标挤到下一行
    expect(css).toMatch(/\.sidebar-item-content\s*\{[^}]*display:\s*flex[^}]*align-items:\s*center/)
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
  it('keeps only drafts and workdir tabs and removes workspace/recent sections', () => {
    const html = readFileSync(join(process.cwd(), 'src/renderer/index.html'), 'utf8')
    const renderer = readFileSync(join(process.cwd(), 'src/renderer/main.ts'), 'utf8')

    expect(html).toContain('id="drafts-tab"')
    expect(html).toContain('id="workdir-tab"')
    expect(html).not.toContain('id="recent-tab"')
    expect(html).not.toContain('id="workspaces-section"')
    expect(renderer).toContain('beginBlankDocumentFromSidebar()')
    expect(renderer).toContain('librarySelectWorkdir?.addEventListener')
  })

  it('routes the library plus button to workdir file creation on the workdir tab', () => {
    const renderer = readFileSync(join(process.cwd(), 'src/renderer/main.ts'), 'utf8')
    const preload = readFileSync(join(process.cwd(), 'src/preload/index.ts'), 'utf8')
    const main = readFileSync(join(process.cwd(), 'src/main/index.ts'), 'utf8')

    expect(renderer).toContain("sidebarState?.activeSidebarTab === 'workdir'")
    expect(renderer).toContain('openLibraryCreateMenu()')
    expect(renderer).toContain('api.chooseWorkdir()')
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
    expect(html).toContain('id="library-select-workdir"')
    expect(html).toContain('id="library-create-file"')
    expect(html).toContain('id="library-create-folder"')
    expect(html).not.toContain('id="current-file-new"')
    expect(html.indexOf('id="workdir-tab"')).toBeLessThan(html.indexOf('id="draft-new"'))
    expect(css).toContain('grid-template-columns: minmax(0, 1fr) minmax(0, 1.35fr) 28px')
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

  it('does not render the removed workspace panel or recent tab', () => {
    const html = readFileSync(join(process.cwd(), 'src/renderer/index.html'), 'utf8')

    expect(html).not.toContain('id="workspaces-section"')
    expect(html).not.toContain('id="recent-tab"')
  })

  it('no longer keeps a compact pinned scroll area after sidebar convergence', () => {
    const css = readFileSync(join(process.cwd(), 'src/renderer/themes/base.css'), 'utf8')

    expect(css).not.toContain('#pinned-section')
    expect(css).not.toContain('#pinned-list')
  })

  it('hides sidebar scroll thumbs until the scroll region is active', () => {
    const css = readFileSync(join(process.cwd(), 'src/renderer/themes/base.css'), 'utf8')

    expect(css).toContain('#sidebar #library-scroll-region::-webkit-scrollbar-thumb')
    expect(css).toContain('background: transparent')
    expect(css).toContain('#sidebar #library-scroll-region:hover::-webkit-scrollbar-thumb')
    expect(css).toContain('#sidebar #library-scroll-region:focus-within::-webkit-scrollbar-thumb')
  })

  it('adds left breathing room inside the sidebar without shifting the drawer shell', () => {
    const css = readFileSync(join(process.cwd(), 'src/renderer/themes/base.css'), 'utf8')
    const sidebarRule = css.match(/#sidebar\s*\{[\s\S]*?\}/)?.[0] ?? ''
    const drawerShellRule = css.match(/#sidebar-drawer-shell\s*\{[\s\S]*?\}/)?.[0] ?? ''
    const workspaceRule = css.match(/#workspace\s*\{[\s\S]*?\}/)?.[0] ?? ''

    expect(sidebarRule).toContain('padding: 14px 12px 16px 18px')
    expect(css).toMatch(/#app-shell:not\(\.sidebar-open\) #sidebar\s*\{[\s\S]*padding-left:\s*0/)
    expect(drawerShellRule).not.toContain('margin-left')
    expect(workspaceRule).not.toContain('padding-left')
  })

  it('prevents text selection while resizing the sidebar', () => {
    const renderer = readFileSync(join(process.cwd(), 'src/renderer/main.ts'), 'utf8')
    const css = readFileSync(join(process.cwd(), 'src/renderer/themes/base.css'), 'utf8')

    expect(renderer).toContain('document.body.classList.add(\'sidebar-resizing\')')
    expect(renderer).toContain('document.body.classList.remove(\'sidebar-resizing\')')
    expect(renderer).toContain('event.preventDefault()')
    expect(css).toContain('body.sidebar-resizing')
    expect(css).toContain('user-select: none !important')
  })

  it('uses distinct icons for folder and document rows in the sidebar', () => {
    const renderer = readFileSync(join(process.cwd(), 'src/renderer/main.ts'), 'utf8')
    const css = readFileSync(join(process.cwd(), 'src/renderer/themes/base.css'), 'utf8')

    expect(renderer).toContain('sidebar-file-icon')
    expect(renderer).toContain('sidebar-draft-icon')
    expect(renderer).toContain('workdir-folder-icon')
    expect(renderer).toContain('workdir-folder-chevron')
    expect(css).toContain('.sidebar-item-content')
    expect(css).toContain('.workdir-folder-icon')
    expect(css).toContain('.workdir-folder-item .sidebar-title')
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
