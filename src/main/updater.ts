import { app, BrowserWindow, dialog, shell } from 'electron'
import electronUpdater, { type AppUpdater } from 'electron-updater'
import type { ProgressInfo, UpdateDownloadedEvent, UpdateInfo } from 'electron-updater'
import { fetchLatestMacManualUpdate, type MacManualUpdateInfo } from './update-release'
import type { UpdateBannerPayload } from './update-notice'

const { autoUpdater } = electronUpdater as { autoUpdater: AppUpdater }

let configured = false
let checking = false
let downloaded = false
let latestVersion: string | null = null
let manualCheckRequested = false
let autoDownloadStarted = false
let pendingManualMacUpdate: MacManualUpdateInfo | null = null
// index.ts 在启动时注入「该版本是否被用户跳过」，横幅据此静默。
let isVersionSkipped: (version: string) => boolean = () => false

export function setUpdateVersionSkipChecker(checker: (version: string) => boolean): void {
  isVersionSkipped = checker
}

function broadcastUpdateBanner(payload: UpdateBannerPayload): void {
  if (payload.kind === 'available' && payload.version && isVersionSkipped(payload.version)) return
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('update-banner', payload)
  }
}

function getDialogParent(): BrowserWindow | undefined {
  return BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0] ?? undefined
}

function showMessage(type: 'info' | 'warning' | 'error', message: string, detail?: string): Promise<Electron.MessageBoxReturnValue> {
  return dialog.showMessageBox(getDialogParent(), {
    type,
    buttons: ['好'],
    defaultId: 0,
    message,
    detail,
  })
}

function formatUpdateDetail(info: UpdateInfo): string {
  const version = info.version ? `版本 ${info.version}` : '新版本'
  const releaseDate = info.releaseDate ? `\n发布时间：${new Date(info.releaseDate).toLocaleString()}` : ''
  return `${version} 已可下载。${releaseDate}`
}

function broadcastAutoUpdateAvailable(info: UpdateInfo): void {
  broadcastUpdateBanner({
    kind: 'available',
    mode: 'auto',
    version: info.version ?? null,
    detail: null,
    downloadUrl: null,
    releaseUrl: null,
  })
}

function broadcastManualMacUpdateAvailable(update: MacManualUpdateInfo): void {
  broadcastUpdateBanner({
    kind: 'available',
    mode: 'manual-mac',
    version: update.version,
    detail: '当前 macOS 构建未使用 Apple Developer ID 签名，需要手动下载安装。',
    downloadUrl: update.downloadUrl,
    releaseUrl: update.releaseUrl,
  })
}

function broadcastUpdateDownloaded(version: string | null): void {
  broadcastUpdateBanner({
    kind: 'downloaded',
    mode: pendingManualMacUpdate ? 'manual-mac' : 'auto',
    version,
    detail: null,
    downloadUrl: pendingManualMacUpdate?.downloadUrl ?? null,
    releaseUrl: pendingManualMacUpdate?.releaseUrl ?? null,
  })
}

async function promptInstallDownloadedUpdate(version: string | null): Promise<void> {
  const result = await dialog.showMessageBox(getDialogParent(), {
    type: 'info',
    buttons: ['重启并安装', '稍后'],
    defaultId: 0,
    cancelId: 1,
    message: 'LyraMD 更新已下载',
    detail: version ? `版本 ${version} 已准备好。重启后会完成安装。` : '更新已准备好。重启后会完成安装。',
  })

  if (result.response === 0) {
    autoUpdater.quitAndInstall()
  }
}

async function promptManualMacUpdate(version: string, downloadUrl: string | null, releaseUrl: string): Promise<void> {
  const buttons = downloadUrl
    ? ['下载 DMG', '打开 Release 页面', '稍后']
    : ['打开 Release 页面', '稍后']
  const cancelId = buttons.length - 1
  const result = await dialog.showMessageBox(getDialogParent(), {
    type: 'info',
    buttons,
    defaultId: 0,
    cancelId,
    message: '发现 LyraMD 新版本',
    detail: `版本 ${version} 已发布。当前 macOS 构建未使用 Apple Developer ID 签名，LyraMD 会打开下载链接，请手动安装覆盖当前版本。`,
  })

  if (downloadUrl && result.response === 0) {
    await shell.openExternal(downloadUrl)
    return
  }

  if (result.response === (downloadUrl ? 1 : 0)) {
    await shell.openExternal(releaseUrl)
  }
}

// feedback 控制菜单显式检查时的模态反馈；startup 自动路径用横幅代替模态。
async function checkForManualMacUpdate(showNoUpdateMessage: boolean, feedback: 'modal' | 'banner' = 'modal'): Promise<void> {
  if (checking) {
    if (showNoUpdateMessage) {
      await showMessage('info', '正在检查更新', 'LyraMD 正在连接 GitHub Releases，请稍候。')
    }
    return
  }

  checking = true
  try {
    const update = await fetchLatestMacManualUpdate(app.getVersion())
    if (!update) {
      if (showNoUpdateMessage) {
        await showMessage('info', 'LyraMD 已是最新版本', `当前版本：${app.getVersion()}`)
      }
      return
    }

    if (feedback === 'banner') {
      pendingManualMacUpdate = update
      latestVersion = update.version
      broadcastManualMacUpdateAvailable(update)
      return
    }

    await promptManualMacUpdate(update.version, update.downloadUrl, update.releaseUrl)
  } catch (error) {
    console.error('[updater] manual macOS update check failed', error)
    if (showNoUpdateMessage) {
      const message = error instanceof Error ? error.message : String(error)
      await showMessage('error', '检查更新失败', message)
    }
  } finally {
    checking = false
  }
}

// 渲染进程点「下载 DMG / 立即下载」：macOS 手动流程打开外部链接，
// 自动更新流程兜底触发一次下载（正常情况下 autoDownload 已经开始）。
export async function startUpdateDownload(): Promise<boolean> {
  if (pendingManualMacUpdate) {
    const target = pendingManualMacUpdate.downloadUrl ?? pendingManualMacUpdate.releaseUrl
    await shell.openExternal(target)
    return true
  }

  if (downloaded) {
    broadcastUpdateDownloaded(latestVersion)
    return true
  }

  if (!autoDownloadStarted || process.platform !== 'darwin') {
    try {
      await autoUpdater.downloadUpdate()
      autoDownloadStarted = true
      return true
    } catch (error) {
      console.error('[updater] manual download trigger failed', error)
      return false
    }
  }
  return true
}

// 渲染进程点「重启并安装」。没有已完成的更新时返回 false，让横幅保持原状。
export function installDownloadedUpdate(): boolean {
  if (!downloaded) return false
  autoUpdater.quitAndInstall()
  return true
}

function attachUpdaterEvents(): void {
  autoUpdater.on('checking-for-update', () => {
    checking = true
  })

  autoUpdater.on('update-available', (info) => {
    latestVersion = info.version
    if (manualCheckRequested) {
      // 菜单显式检查：保留模态反馈
      showMessage('info', '发现 LyraMD 新版本', formatUpdateDetail(info)).catch(() => {})
    } else {
      // 后台自动检查：非模态横幅，不打断写作
      broadcastAutoUpdateAvailable(info)
    }
  })

  autoUpdater.on('update-not-available', () => {
    checking = false
    if (manualCheckRequested) {
      showMessage('info', 'LyraMD 已是最新版本', `当前版本：${app.getVersion()}`).catch(() => {})
    }
    manualCheckRequested = false
  })

  autoUpdater.on('download-progress', (progress: ProgressInfo) => {
    const percent = Number.isFinite(progress.percent) ? progress.percent.toFixed(0) : '?'
    console.info(`[updater] downloading update: ${percent}%`)
  })

  autoUpdater.on('update-downloaded', (event: UpdateDownloadedEvent) => {
    checking = false
    downloaded = true
    latestVersion = event.version ?? latestVersion
    const wasManualCheck = manualCheckRequested
    manualCheckRequested = false
    if (wasManualCheck) {
      promptInstallDownloadedUpdate(latestVersion).catch(() => {})
    } else {
      broadcastUpdateDownloaded(latestVersion)
    }
  })

  autoUpdater.on('error', (error) => {
    checking = false
    console.error('[updater] update check failed', error)
    if (manualCheckRequested) {
      showMessage('error', '检查更新失败', error.message).catch(() => {})
    }
    manualCheckRequested = false
  })
}

export function configureAutoUpdates(): void {
  if (configured) return
  configured = true

  if (process.platform === 'darwin') {
    if (app.isPackaged) {
      setTimeout(() => {
        // 启动时的静默检查：有新版本走非模态横幅
        checkForManualMacUpdate(false, 'banner').catch((error: Error) => {
          console.error('[updater] startup manual update check failed', error)
        })
      }, 5000)
    }
    return
  }

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = false
  autoUpdater.allowPrerelease = false

  attachUpdaterEvents()

  if (app.isPackaged) {
    setTimeout(() => {
      autoUpdater.checkForUpdates().then((result) => {
        // 记录自动下载已触发，供手动「立即下载」兑底判断
        autoDownloadStarted = true
        return result
      }).catch((error: Error) => {
        console.error('[updater] startup update check failed', error)
      })
    }, 5000)
  }
}

export async function checkForUpdatesFromMenu(): Promise<void> {
  if (!app.isPackaged) {
    await showMessage('info', '开发模式不检查更新', '更新检查只在已安装的 LyraMD 构建中启用。')
    return
  }

  if (process.platform === 'darwin') {
    await checkForManualMacUpdate(true)
    return
  }

  if (downloaded) {
    await promptInstallDownloadedUpdate(latestVersion)
    return
  }

  if (checking) {
    await showMessage('info', '正在检查更新', 'LyraMD 正在连接发布服务器，请稍候。')
    return
  }

  manualCheckRequested = true
  await autoUpdater.checkForUpdates()
}
