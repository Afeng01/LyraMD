import type { SidebarState, WorkdirTreeNode } from '../preload/index'

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
  | (DraftSidebarItem & {
    depth: number
    relativePath: string
  })
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
  | { kind: 'workdir'; filePath: string; flushAutosaveFirst: true }

export type SidebarInlineTitleEditTarget =
  | { kind: 'draft'; draftId: string }
  | { kind: 'file'; filePath: string }

export type SidebarInlineTitleCommitAction =
  | { kind: 'update-draft-title'; draftId: string }
  | { kind: 'rename-file-title'; filePath: string }

export function isPinnedDraft(state: SidebarState, draftId: string): boolean {
  return state.pinnedItems.some((item) => item.kind === 'draft' && item.draftId === draftId)
}

export function isPinnedFile(state: SidebarState, filePath: string): boolean {
  return state.pinnedItems.some((item) => item.kind === 'file' && item.filePath === filePath)
}

export function isDraftWorkspaceRoot(state: SidebarState, rootPath: string): boolean {
  const normalizePath = (value: string): string => value.replaceAll('\\', '/').replace(/\/+$/u, '') || '/'
  const normalizedRoot = normalizePath(rootPath)
  if (state.draftDirectoryPath && normalizePath(state.draftDirectoryPath) === normalizedRoot) return true
  return state.draftEntries.some((entry) => {
    const normalizedPath = normalizePath(entry.path)
    const parentPath = normalizedPath.slice(0, normalizedPath.lastIndexOf('/')) || '/'
    return parentPath === normalizedRoot
  })
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

  return { kind: 'workdir', filePath: item.filePath, flushAutosaveFirst: true }
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

export function resolveVisibleWorkdirTreeRows(
  state: SidebarState,
  tree: WorkdirTreeNode[],
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

      const draftEntry = state.draftEntries.find((entry) => entry.path === node.absolutePath)
      if (draftEntry) {
        rows.push({
          ...createDraftItem(state, draftEntry.id, draftEntry.displayTitle),
          depth,
          relativePath: node.relativePath,
        })
        continue
      }

      rows.push({
        ...createFileItem(state, node.absolutePath),
        depth,
        relativePath: node.relativePath,
      })
    }
  }

  walk(tree, 0)
  return rows
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

function createFileItem(state: SidebarState, filePath: string): FileSidebarItem {
  return {
    kind: 'file',
    filePath,
    title: state.fileTitleOverrides[filePath] ?? basename(filePath),
    active: state.currentFilePath === filePath,
    pinned: isPinnedFile(state, filePath),
  }
}

function basename(filePath: string): string {
  const normalized = filePath.replaceAll('\\', '/')
  return normalized.slice(normalized.lastIndexOf('/') + 1)
}
