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
      // No spellcheck UI in LyraMD — avoid red squiggles in the editor (upstream issue #7)
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
