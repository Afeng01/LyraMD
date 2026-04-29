export const DEFAULT_MAX_RECENT_FILES = 10
export const DEFAULT_SIDEBAR_WIDTH = 336
export const MIN_SIDEBAR_WIDTH = 220
export const MAX_SIDEBAR_WIDTH = 460

export interface PersistedSidebarState {
  sidebarOpen: boolean
  sidebarWidth: number
  draftsExpanded: boolean
  workdirExpanded: boolean
  recentFilesExpanded: boolean
  workdirPath: string | null
  draftDirectoryPath: string | null
  draftOnboardingCompleted: boolean
  draftEntries: DraftEntryRecord[]
  recentFiles: string[]
}

export interface DraftEntryRecord {
  id: string
  path: string
  createdAt: number
  updatedAt: number
  displayTitle: string
}

export const DEFAULT_SIDEBAR_STATE: PersistedSidebarState = {
  sidebarOpen: false,
  sidebarWidth: DEFAULT_SIDEBAR_WIDTH,
  draftsExpanded: true,
  workdirExpanded: true,
  recentFilesExpanded: true,
  workdirPath: null,
  draftDirectoryPath: null,
  draftOnboardingCompleted: false,
  draftEntries: [],
  recentFiles: [],
}

export function getSidebarOpenForWindow(
  persistedSidebarOpen: boolean,
  isDrawerMode: boolean,
  drawerSidebarOpen: boolean,
  desktopSidebarOpen: boolean = persistedSidebarOpen,
): boolean {
  return isDrawerMode ? drawerSidebarOpen : desktopSidebarOpen
}

export function normalizeDrawerSidebarOpen(
  previousDrawerMode: boolean,
  nextDrawerMode: boolean,
  drawerSidebarOpen: boolean,
): boolean {
  if (!nextDrawerMode) return false
  if (!previousDrawerMode) return false
  return drawerSidebarOpen
}

function isDraftEntryRecord(value: unknown): value is DraftEntryRecord {
  if (!value || typeof value !== 'object') return false

  const candidate = value as Partial<DraftEntryRecord>
  return typeof candidate.id === 'string'
    && typeof candidate.path === 'string'
    && typeof candidate.createdAt === 'number'
    && Number.isFinite(candidate.createdAt)
    && typeof candidate.updatedAt === 'number'
    && Number.isFinite(candidate.updatedAt)
    && typeof candidate.displayTitle === 'string'
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
    draftsExpanded: candidate.draftsExpanded !== false,
    workdirExpanded: candidate.workdirExpanded !== false,
    recentFilesExpanded: candidate.recentFilesExpanded !== false,
    workdirPath: typeof candidate.workdirPath === 'string' ? candidate.workdirPath : null,
    draftDirectoryPath: typeof candidate.draftDirectoryPath === 'string' ? candidate.draftDirectoryPath : null,
    draftOnboardingCompleted: candidate.draftOnboardingCompleted === true,
    draftEntries: Array.isArray(candidate.draftEntries)
      ? candidate.draftEntries.filter(isDraftEntryRecord)
      : [],
    recentFiles: Array.isArray(candidate.recentFiles)
      ? candidate.recentFiles.filter((entry): entry is string => typeof entry === 'string').slice(0, DEFAULT_MAX_RECENT_FILES)
      : [],
  }
}
