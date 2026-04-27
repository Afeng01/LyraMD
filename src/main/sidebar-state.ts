export const DEFAULT_MAX_RECENT_FILES = 10
export const DEFAULT_SIDEBAR_WIDTH = 296
export const MIN_SIDEBAR_WIDTH = 220
export const MAX_SIDEBAR_WIDTH = 460

export interface PersistedSidebarState {
  sidebarOpen: boolean
  sidebarWidth: number
  workdirExpanded: boolean
  recentFilesExpanded: boolean
  workdirPath: string | null
  recentFiles: string[]
}

export const DEFAULT_SIDEBAR_STATE: PersistedSidebarState = {
  sidebarOpen: false,
  sidebarWidth: DEFAULT_SIDEBAR_WIDTH,
  workdirExpanded: true,
  recentFilesExpanded: true,
  workdirPath: null,
  recentFiles: [],
}

export function clampSidebarWidth(width: number): number {
  if (!Number.isFinite(width)) return DEFAULT_SIDEBAR_WIDTH
  return Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, Math.round(width)))
}

export function pushRecentFile(
  recentFiles: string[],
  filePath: string,
  maxRecentFiles: number = DEFAULT_MAX_RECENT_FILES,
): string[] {
  if (recentFiles.includes(filePath)) return recentFiles.slice(0, maxRecentFiles)
  return [filePath, ...recentFiles].slice(0, maxRecentFiles)
}

export function filterMissingRecentFiles(
  recentFiles: string[],
  exists: (filePath: string) => boolean,
  maxRecentFiles: number = DEFAULT_MAX_RECENT_FILES,
): string[] {
  return recentFiles.filter((filePath) => exists(filePath)).slice(0, maxRecentFiles)
}

export function removeRecentFile(recentFiles: string[], filePath: string): string[] {
  return recentFiles.filter((entry) => entry !== filePath)
}

export function normalizeSidebarState(value: unknown): PersistedSidebarState {
  if (!value || typeof value !== 'object') return { ...DEFAULT_SIDEBAR_STATE }

  const candidate = value as Partial<PersistedSidebarState>

  return {
    sidebarOpen: candidate.sidebarOpen === true,
    sidebarWidth: clampSidebarWidth(typeof candidate.sidebarWidth === 'number' ? candidate.sidebarWidth : DEFAULT_SIDEBAR_WIDTH),
    workdirExpanded: candidate.workdirExpanded !== false,
    recentFilesExpanded: candidate.recentFilesExpanded !== false,
    workdirPath: typeof candidate.workdirPath === 'string' ? candidate.workdirPath : null,
    recentFiles: Array.isArray(candidate.recentFiles)
      ? candidate.recentFiles.filter((entry): entry is string => typeof entry === 'string').slice(0, DEFAULT_MAX_RECENT_FILES)
      : [],
  }
}
