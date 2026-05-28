import type { SidebarState, SidebarTab, WorkdirTreeNode } from '../preload/index'

export interface DraftSidebarItem {
  kind: 'draft'
  id: string
  title: string
  active: boolean
  pinned: boolean
}

export interface FileSidebarItem {
  kind: 'file'
  filePath: string
  title: string
  active: boolean
  pinned: boolean
  source: 'recent' | 'pinned' | 'workdir'
}

export type SidebarItem = DraftSidebarItem | FileSidebarItem

export type WorkdirTreeRow =
  | {
    kind: 'directory'
    absolutePath: string
    depth: number
    expanded: boolean
    name: string
    relativePath: string
  }
  | (FileSidebarItem & {
    depth: number
    relativePath: string
  })

export interface PinControl {
  title: string
  ariaLabel: string
  icon: 'pin' | 'pin-filled'
}

export interface RemoveControl {
  title: string
  ariaLabel: string
  icon: 'trash' | 'check'
  tone: 'normal' | 'danger'
}

export type RemoveActionPlan =
  | { kind: 'draft'; draftId: string; flushAutosaveFirst: false }
  | { kind: 'recent'; filePath: string; flushAutosaveFirst: false }
  | { kind: 'workdir'; filePath: string; flushAutosaveFirst: true }

export type SidebarInlineTitleEditTarget =
  | { kind: 'draft'; draftId: string }
  | { kind: 'file'; filePath: string; source: FileSidebarItem['source'] }

export type SidebarInlineTitleCommitAction =
  | { kind: 'update-draft-title'; draftId: string }
  | { kind: 'rename-file-title'; filePath: string }

export function resolveWorkspaceLabel(workspacePath: string | null): string {
  if (!workspacePath) return '选择目录'
  return basename(workspacePath)
}

export function shouldScrollWorkspaces(workspacePaths: string[], threshold = 2): boolean {
  return workspacePaths.length > threshold
}

export function isPinnedDraft(state: SidebarState, draftId: string): boolean {
  return state.pinnedItems.some((item) => item.kind === 'draft' && item.draftId === draftId)
}

export function isPinnedFile(state: SidebarState, filePath: string): boolean {
  return state.pinnedItems.some((item) => item.kind === 'file' && item.filePath === filePath)
}

export function resolvePinControl(pinned: boolean, title: string): PinControl {
  const action = pinned ? '取消置顶' : '置顶'
  return {
    title: `${action} ${title}`,
    ariaLabel: `${action} ${title}`,
    icon: pinned ? 'pin-filled' : 'pin',
  }
}

export function resolveRemoveControl(title: string, confirming = false): RemoveControl {
  const action = confirming ? '确认删除' : '删除'
  return {
    title: `${action} ${title}`,
    ariaLabel: `${action} ${title}`,
    icon: confirming ? 'check' : 'trash',
    tone: confirming ? 'danger' : 'normal',
  }
}

export function resolveRemoveActionPlan(item: SidebarItem): RemoveActionPlan | null {
  if (item.kind === 'draft') {
    return { kind: 'draft', draftId: item.id, flushAutosaveFirst: false }
  }

  if (item.source === 'recent') {
    return { kind: 'recent', filePath: item.filePath, flushAutosaveFirst: false }
  }

  if (item.source === 'workdir') {
    return { kind: 'workdir', filePath: item.filePath, flushAutosaveFirst: true }
  }

  return null
}

export function resolveRemoveActionKey(plan: RemoveActionPlan): string {
  if (plan.kind === 'draft') return `draft:${plan.draftId}`
  return `${plan.kind}:${plan.filePath}`
}

export function resolveSidebarInlineTitleCommitAction(
  target: SidebarInlineTitleEditTarget,
): SidebarInlineTitleCommitAction {
  if (target.kind === 'draft') {
    return { kind: 'update-draft-title', draftId: target.draftId }
  }

  return { kind: 'rename-file-title', filePath: target.filePath }
}

export function resolvePinnedItems(state: SidebarState): SidebarItem[] {
  return state.pinnedItems.flatMap((item): SidebarItem[] => {
    if (item.kind === 'draft') {
      const draft = state.draftEntries.find((entry) => entry.id === item.draftId)
      if (!draft) return []
      return [createDraftItem(state, draft.id, draft.displayTitle)]
    }

    return [createFileItem(state, item.filePath, 'pinned')]
  })
}

export function resolveVisibleTabItems(state: SidebarState, tab: SidebarTab = state.activeSidebarTab): SidebarItem[] {
  if (tab === 'recent') {
    return state.recentFiles.map((filePath) => createFileItem(state, filePath, 'recent'))
  }
  if (tab === 'workdir') {
    return state.workdirEntries.map((entry) => createFileItem(state, entry.absolutePath, 'workdir'))
  }

  return state.draftEntries.map((draft) => createDraftItem(state, draft.id, draft.displayTitle))
}

export function resolveVisibleWorkdirTreeRows(
  state: SidebarState,
  expandedFolderPaths: ReadonlySet<string> = new Set(),
  collapsedFolderPaths: ReadonlySet<string> = new Set(),
): WorkdirTreeRow[] {
  const rows: WorkdirTreeRow[] = []

  function isExpanded(node: WorkdirTreeNode, depth: number): boolean {
    if (collapsedFolderPaths.has(node.absolutePath)) return false
    if (expandedFolderPaths.has(node.absolutePath)) return true
    return depth === 0
  }

  function walk(nodes: WorkdirTreeNode[], depth: number): void {
    for (const node of nodes) {
      if (node.kind === 'directory') {
        const expanded = isExpanded(node, depth)
        rows.push({
          kind: 'directory',
          absolutePath: node.absolutePath,
          depth,
          expanded,
          name: node.name,
          relativePath: node.relativePath,
        })
        if (expanded) walk(node.children ?? [], depth + 1)
        continue
      }

      rows.push({
        ...createFileItem(state, node.absolutePath, 'workdir'),
        depth,
        relativePath: node.relativePath,
      })
    }
  }

  walk(state.workdirTree, 0)
  return rows
}

export function createWorkspaceRootTreeNode(
  rootPath: string,
  children: WorkdirTreeNode[],
): WorkdirTreeNode {
  const name = basename(rootPath)
  return {
    absolutePath: rootPath,
    children,
    kind: 'directory',
    name,
    relativePath: name,
  }
}

function createDraftItem(state: SidebarState, draftId: string, title: string): DraftSidebarItem {
  return {
    kind: 'draft',
    id: draftId,
    title,
    active: state.currentDraftId === draftId,
    pinned: isPinnedDraft(state, draftId),
  }
}

function createFileItem(state: SidebarState, filePath: string, source: FileSidebarItem['source']): FileSidebarItem {
  return {
    kind: 'file',
    filePath,
    title: state.fileTitleOverrides[filePath] ?? basename(filePath),
    active: state.currentFilePath === filePath,
    pinned: isPinnedFile(state, filePath),
    source,
  }
}

function basename(filePath: string): string {
  const normalized = filePath.replaceAll('\\', '/')
  return normalized.slice(normalized.lastIndexOf('/') + 1)
}
