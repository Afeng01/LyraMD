import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import type { SidebarState } from '../preload/index'
import {
  isDraftWorkspaceRoot,
  isPinnedDraft,
  isPinnedFile,
  resolvePinControl,
  resolveRemoveActionKey,
  resolveRemoveControl,
  resolveRemoveActionPlan,
  resolveSidebarInlineTitleCommitAction,
  resolveVisibleWorkdirTreeRows,
} from './sidebar-view'

function createSidebarState(patch: Partial<SidebarState> = {}): SidebarState {
  return {
    sidebarOpen: true,
    sidebarWidth: 336,
    workdirPath: null,
    workspacePaths: [],
    expandedWorkspacePaths: [],
    workspaceTrees: [],
    pinnedItems: [],
    activeSidebarTab: 'workdir',
    draftDirectoryPath: null,
    draftOnboardingCompleted: true,
    draftEntries: [],
    recentFiles: [],
    currentDocumentKind: 'blank',
    currentFilePath: null,
    currentDraftId: null,
    currentDisplayTitle: '未命名文档',
    isDrawerMode: false,
    fileTitleOverrides: {},
    ...patch,
  }
}

describe('draft workspace roots', () => {
  it('protects configured and legacy draft directories from workspace removal', () => {
    const state = createSidebarState({
      draftDirectoryPath: '/drafts',
      draftEntries: [
        { id: 'legacy', path: 'C:\\Notes\\Drafts\\one.md', createdAt: 1, updatedAt: 2, displayTitle: '旧草稿' },
      ],
    })

    expect(isDraftWorkspaceRoot(state, '/drafts')).toBe(true)
    expect(isDraftWorkspaceRoot(state, 'C:\\Notes\\Drafts')).toBe(true)
    expect(isDraftWorkspaceRoot(state, '/workspace')).toBe(false)
  })
})

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
    })).toEqual({
      kind: 'rename-file-title',
      filePath: '/workspace/a.md',
    })
  })

  it('keeps draft pins attached to draft rows inside the workspace tree', () => {
    const state = createSidebarState({
      currentDraftId: 'd1',
      pinnedItems: [{ kind: 'draft', draftId: 'd1' }],
      draftEntries: [
        { id: 'd1', path: '/drafts/d1.md', createdAt: 1, updatedAt: 2, displayTitle: '草稿一' },
      ],
    })
    const tree = [{
      absolutePath: '/drafts/d1.md',
      kind: 'file' as const,
      name: 'd1.md',
      relativePath: 'd1.md',
    }]

    expect(resolveVisibleWorkdirTreeRows(state, tree)).toEqual([
      {
        kind: 'draft',
        id: 'd1',
        title: '草稿一',
        active: true,
        pinned: true,
        depth: 0,
        relativePath: 'd1.md',
      },
    ])
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



describe('workdir tree helpers', () => {
  it('flattens tree rows with active files and collapsed folders', () => {
    const tree = [
      {
        absolutePath: '/workspace/a.md',
        kind: 'file' as const,
        name: 'a.md',
        relativePath: 'a.md',
      },
      {
        absolutePath: '/workspace/notes',
        children: [
          {
            absolutePath: '/workspace/notes/b.md',
            kind: 'file' as const,
            name: 'b.md',
            relativePath: 'notes/b.md',
          },
          {
            absolutePath: '/workspace/notes/nested',
            children: [
              {
                absolutePath: '/workspace/notes/nested/c.md',
                kind: 'file' as const,
                name: 'c.md',
                relativePath: 'notes/nested/c.md',
              },
            ],
            kind: 'directory' as const,
            name: 'nested',
            relativePath: 'notes/nested',
          },
        ],
        kind: 'directory' as const,
        name: 'notes',
        relativePath: 'notes',
      },
    ]
    const state = createSidebarState({ currentFilePath: '/workspace/notes/nested/c.md' })

    expect(resolveVisibleWorkdirTreeRows(state, tree, new Set(['/workspace/notes/nested']))).toMatchObject([
      { kind: 'file', filePath: '/workspace/a.md', depth: 0, active: false },
      { kind: 'directory', absolutePath: '/workspace/notes', depth: 0, expanded: true },
      { kind: 'file', filePath: '/workspace/notes/b.md', depth: 1, active: false },
      { kind: 'directory', absolutePath: '/workspace/notes/nested', depth: 1, expanded: true },
      { kind: 'file', filePath: '/workspace/notes/nested/c.md', depth: 2, active: true },
    ])

    expect(resolveVisibleWorkdirTreeRows(state, tree, new Set(), new Set(['/workspace/notes']))).toMatchObject([
      { kind: 'file', filePath: '/workspace/a.md', depth: 0 },
      { kind: 'directory', absolutePath: '/workspace/notes', depth: 0, expanded: false },
    ])
  })
})

describe('library create action regression', () => {
  it('switches the sidebar between workdir and outline without a drafts tab or titlebar outline control', () => {
    const html = readFileSync(join(process.cwd(), 'src/renderer/index.html'), 'utf8')
    const renderer = readFileSync(join(process.cwd(), 'src/renderer/main.ts'), 'utf8')

    expect(html).toContain('id="workdir-tab"')
    expect(html).toContain('id="outline-tab"')
    expect(html).not.toContain('id="drafts-tab"')
    expect(html).not.toContain('id="outline-toggle"')
    expect(renderer).toContain("selectSidebarTab('outline')")
    expect(renderer).toContain('workspaceTrees.find')
  })

  it('routes the workdir actions menu through workspace selection and file creation IPC', () => {
    const renderer = readFileSync(join(process.cwd(), 'src/renderer/main.ts'), 'utf8')
    const preload = readFileSync(join(process.cwd(), 'src/preload/index.ts'), 'utf8')
    const main = readFileSync(join(process.cwd(), 'src/main/index.ts'), 'utf8')

    expect(renderer).toContain('workspaceMenuToggle?.addEventListener')
    expect(renderer).toContain('api.chooseWorkdir()')
    expect(renderer).toContain('api.createWorkdirFile()')
    expect(renderer).toContain('api.selectWorkspace(workspacePath)')
    expect(renderer).toContain('api.removeWorkspace(workspacePath)')
    expect(renderer).toContain('data-remove-workspace-path')
    expect(renderer).toContain('isDraftWorkspaceRoot(sidebarState, rootPath)')
    expect(preload).toContain("createWorkdirFile: () => ipcRenderer.invoke('create-workdir-file')")
    expect(preload).toContain("toggleWorkspaceExpanded: (path: string) => ipcRenderer.invoke('toggle-workspace-expanded', path)")
    expect(preload).toContain("removeWorkspace: (path: string) => ipcRenderer.invoke('remove-workspace', path)")
    expect(main).toContain("ipcMain.handle('create-workdir-file'")
    expect(main).toContain("ipcMain.handle('toggle-workspace-expanded'")
    expect(main).toContain("ipcMain.handle('remove-workspace'")
    expect(main).toContain('workspacePath === sidebarState.draftDirectoryPath')
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

  it('renders a named workdir menu instead of a generic sidebar plus', () => {
    const html = readFileSync(join(process.cwd(), 'src/renderer/index.html'), 'utf8')
    const css = readFileSync(join(process.cwd(), 'src/renderer/themes/base.css'), 'utf8')

    expect(html).toContain('id="library-create-menu"')
    expect(html).toContain('id="library-select-workdir"')
    expect(html).toContain('id="library-create-file"')
    expect(html).toContain('id="library-create-folder"')
    expect(html).not.toContain('id="current-file-new"')
    expect(html).toContain('id="workspace-menu-toggle"')
    expect(html).not.toContain('id="draft-new"')
    expect(html.indexOf('id="workdir-tab"')).toBeLessThan(html.indexOf('id="outline-tab"'))
    expect(css).toContain('grid-template-columns: repeat(2, minmax(0, 1fr))')
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

describe('workspace removal confirmation regression', () => {
  it('handles the second workspace-removal click before clearing pending confirmation', () => {
    const renderer = readFileSync(join(process.cwd(), 'src/renderer/main.ts'), 'utf8')
    const clickStart = renderer.indexOf("document.addEventListener('click', (event) => {")
    const clickEnd = renderer.indexOf("\n  document.addEventListener('dblclick'", clickStart)
    const clickHandler = renderer.slice(clickStart, clickEnd)
    const removeBranch = clickHandler.indexOf("const removeWorkspaceButton = target?.closest('[data-remove-workspace-path]')")
    const pendingReset = clickHandler.indexOf('if (pendingRemoveActionKey) {')

    expect(removeBranch).toBeGreaterThanOrEqual(0)
    expect(pendingReset).toBeGreaterThanOrEqual(0)
    expect(removeBranch).toBeLessThan(pendingReset)
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

  it('uses a quiet, borderless active state for the sidebar view switcher', () => {
    const css = readFileSync(join(process.cwd(), 'src/renderer/themes/base.css'), 'utf8')
    const activeRule = css.match(/\.sidebar-tabs button\.active\s*\{[^}]*\}/)?.[0] ?? ''

    expect(activeRule).toContain('selection-bg) 34%')
    expect(activeRule).not.toContain('box-shadow')
  })

  it('removes outer borders and separators from the workspace panel', () => {
    const css = readFileSync(join(process.cwd(), 'src/renderer/themes/base.css'), 'utf8')
    const sectionRule = css.match(/#library-section\s*\{[^}]*\}/)?.[0] ?? ''
    const headerRule = css.match(/\.sidebar-library-header\s*\{[^}]*\}/)?.[0] ?? ''

    expect(sectionRule).not.toContain('border:')
    expect(sectionRule).not.toContain('background:')
    expect(headerRule).not.toContain('border-bottom:')
    expect(css).toContain('margin-bottom: 10px')
  })
})
