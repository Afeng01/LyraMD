import type { BrowserWindowConstructorOptions } from 'electron'

export function createWindowOptions({
  platform,
  preloadPath,
}: {
  platform: NodeJS.Platform
  preloadPath: string
}): BrowserWindowConstructorOptions {
  const options: BrowserWindowConstructorOptions = {
    width: 1120,
    height: 720,
    minWidth: 360,
    minHeight: 300,
    // 与默认主题（雅陶）底色一致：渲染层首帧前窗口不闪白，也不再露出无样式骨架
    backgroundColor: '#f0edea',
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      // No spellcheck UI in LyraMD — avoid red squiggles in the editor (upstream issue #7)
      spellcheck: false,
    },
  }

  if (platform === 'darwin') {
    return {
      ...options,
      titleBarStyle: 'hiddenInset',
      // 红绿灯垂直中心对齐标签行内容中心（顶距 6px + 标签 32px → 22px）：y = 22 - 6
      trafficLightPosition: { x: 14, y: 16 },
    }
  }

  if (platform === 'win32') {
    return {
      ...options,
      frame: false,
    }
  }

  return options
}

export function createSettingsWindowOptions({
  platform,
  preloadPath,
}: {
  platform: NodeJS.Platform
  preloadPath: string
}): BrowserWindowConstructorOptions {
  const options: BrowserWindowConstructorOptions = {
    width: 760,
    height: 620,
    minWidth: 560,
    minHeight: 420,
    resizable: true,
    title: '设置 — LyraMD',
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
    },
  }

  if (platform === 'darwin') {
    return {
      ...options,
      titleBarStyle: 'hiddenInset',
      trafficLightPosition: { x: 14, y: 14 },
    }
  }

  return options
}
