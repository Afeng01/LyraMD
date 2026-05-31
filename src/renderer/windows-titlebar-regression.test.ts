import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('Windows custom titlebar regression', () => {
  it('ships a Windows-only integrated menu bar and window controls', () => {
    const html = readFileSync(join(process.cwd(), 'src/renderer/index.html'), 'utf8')
    const css = readFileSync(join(process.cwd(), 'src/renderer/themes/base.css'), 'utf8')
    const renderer = readFileSync(join(process.cwd(), 'src/renderer/main.ts'), 'utf8')

    expect(html).toContain('id="windows-titlebar"')
    expect(html).toContain('data-windows-menu="file"')
    expect(html).toContain('data-windows-action="new-window"')
    expect(html).toContain('id="window-minimize"')
    expect(html).toContain('id="window-maximize"')
    expect(html).toContain('id="window-close"')
    expect(css).toContain('body.platform-win32 #windows-titlebar')
    expect(css).toContain('body.platform-win32 #titlebar')
    expect(renderer).toContain("document.body.classList.toggle('platform-win32'")
    expect(renderer).toContain('handleWindowsMenuAction(action)')
  })

  it('has 格式 (Format) menu with clean-cjk action under Windows menu', () => {
    const html = readFileSync(join(process.cwd(), 'src/renderer/index.html'), 'utf8')
    const renderer = readFileSync(join(process.cwd(), 'src/renderer/main.ts'), 'utf8')

    expect(html).toContain('data-windows-menu="format"')
    expect(html).toContain('data-windows-panel="format"')
    expect(html).toContain('data-windows-action="clean-cjk"')
    expect(renderer).toContain("case 'clean-cjk':")
  })

  it('has 工具 (Tools) menu with open-ai-palette action under Windows menu', () => {
    const html = readFileSync(join(process.cwd(), 'src/renderer/index.html'), 'utf8')
    const renderer = readFileSync(join(process.cwd(), 'src/renderer/main.ts'), 'utf8')

    expect(html).toContain('data-windows-menu="tools"')
    expect(html).toContain('data-windows-panel="tools"')
    expect(html).toContain('data-windows-action="open-ai-palette"')
    expect(html).toContain('AI 精灵')
    expect(renderer).toContain("case 'open-ai-palette':")
  })

  it('exposes focused-window controls through preload and main IPC', () => {
    const preload = readFileSync(join(process.cwd(), 'src/preload/index.ts'), 'utf8')
    const main = readFileSync(join(process.cwd(), 'src/main/index.ts'), 'utf8')

    expect(preload).toContain('createNewWindow: () => ipcRenderer.invoke(\'create-new-window\')')
    expect(preload).toContain('minimizeWindow: () => ipcRenderer.invoke(\'window-minimize\')')
    expect(preload).toContain('toggleMaximizeWindow: () => ipcRenderer.invoke(\'window-toggle-maximize\')')
    expect(preload).toContain('closeWindow: () => ipcRenderer.invoke(\'window-close\')')
    expect(main).toContain("ipcMain.handle('create-new-window'")
    expect(main).toContain("ipcMain.handle('window-minimize'")
    expect(main).toContain("ipcMain.handle('window-toggle-maximize'")
    expect(main).toContain("ipcMain.handle('window-close'")
  })
})
