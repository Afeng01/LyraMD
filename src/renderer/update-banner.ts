// 更新横幅：非模态浮层，后台检查发现新版本时提示，不阻塞写作。
// 决策逻辑抽成纯函数便于测试；DOM 部分只在编辑器窗口挂载。
import type { ElectronAPI } from '../preload/index'
import type { UpdateBannerPayload } from '../main/update-notice'

export type UpdateBannerButtonAction = 'download' | 'install' | 'open-release-url'

export interface PlannedBannerButton {
  label: string
  action: UpdateBannerButtonAction
}

export interface PlannedUpdateBanner {
  title: string
  meta: string | null
  primary: PlannedBannerButton | null
  secondary: PlannedBannerButton | null
  showSkip: boolean
}

export function planUpdateBanner(payload: UpdateBannerPayload): PlannedUpdateBanner {
  const versionLabel = payload.version ? `版本 ${payload.version}` : '新版本'

  if (payload.kind === 'downloaded') {
    return {
      title: 'LyraMD 更新已就绪',
      meta: `${versionLabel} 已下载完成，重启后完成安装。`,
      primary: { label: '重启并安装', action: 'install' },
      secondary: null,
      showSkip: false,
    }
  }

  const title = `发现 LyraMD 新版本（${versionLabel}）`

  if (payload.mode === 'manual-mac') {
    return {
      title,
      meta: payload.detail ?? '当前 macOS 构建需要手动下载安装。',
      primary: payload.downloadUrl ? { label: '下载 DMG', action: 'download' } : null,
      secondary: payload.releaseUrl ? { label: '打开发布页', action: 'open-release-url' } : null,
      showSkip: true,
    }
  }

  return {
    title,
    meta: payload.detail ?? '更新正在后台下载，完成后可以一键安装。',
    primary: null,
    secondary: null,
    showSkip: true,
  }
}

export interface UpdateBannerApi
  extends Pick<
    ElectronAPI,
    'onUpdateAvailable' | 'onUpdateDownloaded' | 'downloadUpdate' | 'installUpdate' | 'skipUpdateVersion' | 'openExternal'
  > {}

export interface UpdateBannerController {
  hide: () => void
  show: (payload: UpdateBannerPayload) => void
}

const NOOP_CONTROLLER: UpdateBannerController = {
  hide: () => {},
  show: () => {},
}

function requiresBannerSurface(): boolean {
  // 设置窗口共用同一份 index.html，但更新横幅只应出现在写作窗口。
  return !document.body.classList.contains('settings-window-mode')
}

export function createUpdateBannerController(api: UpdateBannerApi): UpdateBannerController {
  if (!requiresBannerSurface()) return NOOP_CONTROLLER

  const root = document.getElementById('update-banner') as HTMLDivElement | null
  const titleEl = document.getElementById('update-banner-title') as HTMLSpanElement | null
  const metaEl = document.getElementById('update-banner-meta') as HTMLSpanElement | null
  const primaryButton = document.getElementById('update-banner-primary') as HTMLButtonElement | null
  const secondaryButton = document.getElementById('update-banner-secondary') as HTMLButtonElement | null
  const skipButton = document.getElementById('update-banner-skip') as HTMLButtonElement | null
  const closeButton = document.getElementById('update-banner-close') as HTMLButtonElement | null
  if (!root || !titleEl || !metaEl || !primaryButton || !secondaryButton || !skipButton || !closeButton) {
    return NOOP_CONTROLLER
  }

  let currentPayload: UpdateBannerPayload | null = null
  let currentPlan: PlannedUpdateBanner | null = null

  const applyButton = (button: HTMLButtonElement, planned: PlannedBannerButton | null) => {
    button.hidden = planned === null
    if (planned) button.textContent = planned.label
  }

  const runPrimary = (): void => {
    const action = currentPlan?.primary?.action
    if (!action) return
    if (action === 'download') {
      void api.downloadUpdate().catch(() => {})
    } else if (action === 'install') {
      void api.installUpdate().then((installed) => {
        if (!installed) hide()
      }).catch(() => {})
    }
  }

  const runSecondary = (): void => {
    const action = currentPlan?.secondary?.action
    if (action !== 'open-release-url') return
    const releaseUrl = currentPayload?.releaseUrl
    if (releaseUrl) api.openExternal(releaseUrl)
  }

  primaryButton.addEventListener('click', () => runPrimary())
  secondaryButton.addEventListener('click', () => runSecondary())
  closeButton.addEventListener('click', () => hide())
  skipButton.addEventListener('click', () => {
    const version = currentPayload?.version
    if (version) void api.skipUpdateVersion(version).catch(() => {})
    hide()
  })

  function render(payload: UpdateBannerPayload): void {
    const plan = planUpdateBanner(payload)
    currentPayload = payload
    currentPlan = plan
    titleEl.textContent = plan.title
    metaEl.textContent = plan.meta ?? ''
    metaEl.hidden = !plan.meta
    applyButton(primaryButton, plan.primary)
    applyButton(secondaryButton, plan.secondary)
    skipButton.hidden = !plan.showSkip || !payload.version
    root.hidden = false
    root.dataset.bannerKind = payload.kind
  }

  function hide(): void {
    root.hidden = true
    currentPayload = null
    currentPlan = null
  }

  api.onUpdateAvailable((payload) => render(payload))
  api.onUpdateDownloaded((payload) => render(payload))

  return { hide, show: render }
}
