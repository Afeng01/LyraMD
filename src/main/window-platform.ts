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
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  }

  if (platform === 'darwin') {
    return {
      ...options,
      titleBarStyle: 'hiddenInset',
      trafficLightPosition: { x: 14, y: 14 },
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
  preloadPath,
}: {
  preloadPath: string
}): BrowserWindowConstructorOptions {
  return {
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
    },
  }
}
