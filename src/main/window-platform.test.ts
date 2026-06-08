import { describe, expect, it } from 'vitest'

import { createSettingsWindowOptions, createWindowOptions } from './window-platform'

describe('createWindowOptions', () => {
  it('keeps the hidden inset title bar on macOS', () => {
    const options = createWindowOptions({
      platform: 'darwin',
      preloadPath: '/app/dist/preload/index.js',
    })

    expect(options.titleBarStyle).toBe('hiddenInset')
    expect(options.trafficLightPosition).toEqual({ x: 14, y: 14 })
  })

  it('uses custom window chrome on Windows', () => {
    const options = createWindowOptions({
      platform: 'win32',
      preloadPath: 'C:\\LyraMD\\dist\\preload\\index.js',
    })

    expect(options.frame).toBe(false)
    expect(options.titleBarStyle).toBeUndefined()
    expect(options.trafficLightPosition).toBeUndefined()
    expect(options.webPreferences?.preload).toBe('C:\\LyraMD\\dist\\preload\\index.js')
    expect(options.webPreferences?.contextIsolation).toBe(true)
    expect(options.webPreferences?.nodeIntegration).toBe(false)
  })

  it('allows compact drawer windows without squeezing core controls', () => {
    const options = createWindowOptions({
      platform: 'darwin',
      preloadPath: '/app/dist/preload/index.js',
    })

    expect(options.minWidth).toBe(360)
    expect(options.minHeight).toBe(300)
    expect(options.minWidth).toBeLessThan(960)
    expect(options.minWidth).toBeGreaterThanOrEqual(280 + 44)
    expect(options.minWidth).toBeGreaterThanOrEqual(168 + 32)
    expect(options.minHeight).toBeGreaterThanOrEqual(52 + 42 + 120)
  })

  it('uses a detached resizable native window for settings', () => {
    const options = createSettingsWindowOptions({
      platform: 'darwin',
      preloadPath: '/app/dist/preload/index.js',
    })

    expect(options.width).toBe(760)
    expect(options.height).toBe(620)
    expect(options.minWidth).toBe(560)
    expect(options.minHeight).toBe(420)
    expect(options.resizable).toBe(true)
    expect(options.modal).toBeUndefined()
    expect(options.parent).toBeUndefined()
    expect(options.titleBarStyle).toBe('hiddenInset')
    expect(options.trafficLightPosition).toEqual({ x: 14, y: 14 })
    expect(options.title).toBe('设置 — LyraMD')
    expect(options.webPreferences?.preload).toBe('/app/dist/preload/index.js')
  })
})
