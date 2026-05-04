export type SidebarTab = 'drafts' | 'recent'

export type PinnedItem =
  | { kind: 'draft'; draftId: string }
  | { kind: 'file'; filePath: string }

export const DEFAULT_MAX_WORKSPACES = 8

export function normalizeSidebarTab(value: unknown): SidebarTab {
  return value === 'recent' ? 'recent' : 'drafts'
}

export function addWorkspacePath(
  paths: string[],
  nextPath: string,
  maxWorkspaces: number = DEFAULT_MAX_WORKSPACES,
): string[] {
  const trimmedPath = nextPath.trim()
  if (!trimmedPath) return paths.slice(0, maxWorkspaces)
  const existing = paths.filter((path) => path !== trimmedPath)
  return [trimmedPath, ...existing].slice(0, maxWorkspaces)
}

export function normalizeWorkspacePaths(
  value: unknown,
  activePath: string | null,
  maxWorkspaces: number = DEFAULT_MAX_WORKSPACES,
): string[] {
  const paths = Array.isArray(value)
    ? value.filter((path): path is string => typeof path === 'string' && path.trim().length > 0)
    : []

  const uniquePaths = paths.reduce<string[]>((result, path) => {
    const trimmedPath = path.trim()
    if (!result.includes(trimmedPath)) result.push(trimmedPath)
    return result
  }, [])

  return activePath
    ? addWorkspacePath(uniquePaths, activePath, maxWorkspaces)
    : uniquePaths.slice(0, maxWorkspaces)
}

export function normalizePinnedItems(value: unknown): PinnedItem[] {
  if (!Array.isArray(value)) return []

  const pinnedItems: PinnedItem[] = []

  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    const candidate = item as Partial<PinnedItem>

    if (candidate.kind === 'draft' && typeof candidate.draftId === 'string' && candidate.draftId.trim()) {
      const pinnedItem: PinnedItem = { kind: 'draft', draftId: candidate.draftId.trim() }
      if (!pinnedItems.some((existing) => samePinnedItem(existing, pinnedItem))) pinnedItems.push(pinnedItem)
      continue
    }

    if (candidate.kind === 'file' && typeof candidate.filePath === 'string' && candidate.filePath.trim()) {
      const pinnedItem: PinnedItem = { kind: 'file', filePath: candidate.filePath.trim() }
      if (!pinnedItems.some((existing) => samePinnedItem(existing, pinnedItem))) pinnedItems.push(pinnedItem)
    }
  }

  return pinnedItems
}

export function samePinnedItem(a: PinnedItem, b: PinnedItem): boolean {
  if (a.kind !== b.kind) return false
  return a.kind === 'draft'
    ? a.draftId === (b as { kind: 'draft'; draftId: string }).draftId
    : a.filePath === (b as { kind: 'file'; filePath: string }).filePath
}

export function togglePinnedItem(items: PinnedItem[], item: PinnedItem): PinnedItem[] {
  return items.some((candidate) => samePinnedItem(candidate, item))
    ? items.filter((candidate) => !samePinnedItem(candidate, item))
    : [item, ...items]
}

export function migratePinnedDraftToFile(
  items: PinnedItem[],
  draftId: string | null,
  filePath: string,
): PinnedItem[] {
  if (!draftId) return items

  const migrated = items.map((item): PinnedItem => (
    item.kind === 'draft' && item.draftId === draftId
      ? { kind: 'file', filePath }
      : item
  ))

  return normalizePinnedItems(migrated)
}
