import { app, BrowserWindow, dialog } from 'electron'
import electronUpdater, { type AppUpdater } from 'electron-updater'
import type { ProgressInfo, UpdateDownloadedEvent, UpdateInfo } from 'electron-updater'

const { autoUpdater } = electronUpdater as { autoUpdater: AppUpdater }

let configured = false
let checking = false
let downloaded = false
let latestVersion: string | null = null
let manualCheckRequested = false

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

function attachUpdaterEvents(): void {
  autoUpdater.on('checking-for-update', () => {
    checking = true
  })

  autoUpdater.on('update-available', (info) => {
    latestVersion = info.version
    showMessage('info', '发现 LyraMD 新版本', formatUpdateDetail(info)).catch(() => {})
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
    manualCheckRequested = false
    promptInstallDownloadedUpdate(latestVersion).catch(() => {})
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

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = false
  autoUpdater.allowPrerelease = false

  attachUpdaterEvents()

  if (app.isPackaged) {
    setTimeout(() => {
      autoUpdater.checkForUpdates().catch((error: Error) => {
        console.error('[updater] startup update check failed', error)
      })
    }, 5000)
  }
}

export async function checkForUpdatesFromMenu(): Promise<void> {
  if (!app.isPackaged) {
    await showMessage('info', '开发模式不检查更新', '自动更新只在已安装的 LyraMD 构建中启用。')
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
