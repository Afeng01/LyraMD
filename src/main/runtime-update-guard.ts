export interface InstalledBundleRefreshCheck {
  bundleMtimeMs: number | null
  currentLaunchTimeMs: number
  isPackaged: boolean
  toleranceMs?: number
}

const DEFAULT_TOLERANCE_MS = 5_000

export function shouldPromptForInstalledBundleRefresh(check: InstalledBundleRefreshCheck): boolean {
  if (!check.isPackaged) return false
  if (typeof check.bundleMtimeMs !== 'number' || !Number.isFinite(check.bundleMtimeMs)) return false

  const toleranceMs = check.toleranceMs ?? DEFAULT_TOLERANCE_MS
  return check.bundleMtimeMs > check.currentLaunchTimeMs + toleranceMs
}
