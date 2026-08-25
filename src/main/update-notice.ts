// 更新通知的纯逻辑：跳过某个版本的横幅、以及「每个版本只在首次启动时
// 打开一次更新日志」。文件读写留在 index.ts，这里只做可测试的判定与合并。

export interface ReleaseNoticeState {
  skippedVersion: string | null
  lastShownVersion: string | null
}

// 横幅载荷：main 广播给渲染进程的更新提示数据。
// mode 区分自动更新（GitHub Releases 下载）与 macOS 未签名构建的手动 DMG 流程。
export interface UpdateBannerPayload {
  kind: 'available' | 'downloaded'
  mode: 'auto' | 'manual-mac'
  version: string | null
  detail: string | null
  downloadUrl: string | null
  releaseUrl: string | null
}

export const EMPTY_RELEASE_NOTICE_STATE: ReleaseNoticeState = {
  skippedVersion: null,
  lastShownVersion: null,
}

function pickVersion(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null
}

export function parseReleaseNoticeState(raw: unknown): ReleaseNoticeState {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ...EMPTY_RELEASE_NOTICE_STATE }
  }
  const record = raw as Record<string, unknown>
  return {
    skippedVersion: pickVersion(record.skippedVersion),
    lastShownVersion: pickVersion(record.lastShownVersion),
  }
}

export function serializeReleaseNoticeState(state: ReleaseNoticeState): string {
  return `${JSON.stringify(state, null, 2)}\n`
}

// 用户在横幅上点过「跳过此版本」后，同一版本的横幅不再打扰。
export function isUpdateVersionSkipped(state: ReleaseNoticeState, candidateVersion: string): boolean {
  return state.skippedVersion !== null && state.skippedVersion === candidateVersion
}

export function withSkippedUpdateVersion(state: ReleaseNoticeState, version: string): ReleaseNoticeState {
  const trimmed = version.trim()
  if (!trimmed) return state
  // 只保留最近一次跳过的版本：新版本发布后横幅应重新出现。
  return { ...state, skippedVersion: trimmed }
}

export function shouldShowReleaseNoticeOnLaunch(state: ReleaseNoticeState, currentVersion: string): boolean {
  return state.lastShownVersion !== currentVersion
}

export function withReleaseNoticeShown(state: ReleaseNoticeState, currentVersion: string): ReleaseNoticeState {
  return { ...state, lastShownVersion: currentVersion }
}
