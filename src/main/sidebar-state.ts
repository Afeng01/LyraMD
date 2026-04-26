export const DEFAULT_MAX_RECENT_FILES = 20

export interface PersistedSidebarState {
  sidebarOpen: boolean
  workdirExpanded: boolean
  workdirPath: string | null
  recentFiles: string[]
}

export const DEFAULT_SIDEBAR_STATE: PersistedSidebarState = {
  sidebarOpen: false,
  workdirExpanded: true,
  workdirPath: null,
  recentFiles: [],
}

export function pushRecentFile(
  recentFiles: string[],
  filePath: string,
  maxRecentFiles: number = DEFAULT_MAX_RECENT_FILES,
): string[] {
  return [filePath, ...recentFiles.filter((entry) => entry !== filePath)].slice(0, maxRecentFiles)
}

export function filterMissingRecentFiles(
  recentFiles: string[],
  exists: (filePath: string) => boolean,
  maxRecentFiles: number = DEFAULT_MAX_RECENT_FILES,
): string[] {
  return recentFiles.filter((filePath) => exists(filePath)).slice(0, maxRecentFiles)
}

export function normalizeSidebarState(value: unknown): PersistedSidebarState {
  if (!value || typeof value !== 'object') return { ...DEFAULT_SIDEBAR_STATE }

  const candidate = value as Partial<PersistedSidebarState>

  return {
    sidebarOpen: candidate.sidebarOpen === true,
    workdirExpanded: candidate.workdirExpanded !== false,
    workdirPath: typeof candidate.workdirPath === 'string' ? candidate.workdirPath : null,
    recentFiles: Array.isArray(candidate.recentFiles)
      ? candidate.recentFiles.filter((entry): entry is string => typeof entry === 'string')
      : [],
  }
}
