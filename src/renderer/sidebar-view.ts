import type { SidebarState, SidebarTab } from '../preload/index'

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

export interface PinControl {
  title: string
  ariaLabel: string
  icon: 'pin' | 'pin-filled'
}

export interface RemoveControl {
  title: string
  ariaLabel: string
  icon: 'trash'
}

export function resolveWorkspaceLabel(workspacePath: string | null): string {
  if (!workspacePath) return '选择目录'
  return basename(workspacePath)
}

export function shouldScrollWorkspaces(workspacePaths: string[], threshold = 3): boolean {
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

export function resolveRemoveControl(title: string): RemoveControl {
  return {
    title: `删除 ${title}`,
    ariaLabel: `删除 ${title}`,
    icon: 'trash',
  }
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
