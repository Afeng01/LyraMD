import { describe, expect, it } from 'vitest'

import { createWindowOptions } from './window-platform'

describe('createWindowOptions', () => {
  it('keeps the hidden inset title bar on macOS', () => {
    const options = createWindowOptions({
      platform: 'darwin',
      preloadPath: '/app/dist/preload/index.js',
    })

    expect(options.titleBarStyle).toBe('hiddenInset')
    expect(options.trafficLightPosition).toEqual({ x: 14, y: 14 })
  })

  it('uses native window chrome on Windows', () => {
    const options = createWindowOptions({
      platform: 'win32',
      preloadPath: 'C:\\LyraMD\\dist\\preload\\index.js',
    })

    expect(options.titleBarStyle).toBeUndefined()
    expect(options.trafficLightPosition).toBeUndefined()
    expect(options.webPreferences?.preload).toBe('C:\\LyraMD\\dist\\preload\\index.js')
    expect(options.webPreferences?.contextIsolation).toBe(true)
    expect(options.webPreferences?.nodeIntegration).toBe(false)
  })
})
