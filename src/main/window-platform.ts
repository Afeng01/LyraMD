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
    minWidth: 560,
    minHeight: 400,
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

  return options
}
