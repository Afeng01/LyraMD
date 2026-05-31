import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('application menu shortcut regression', () => {
  it('uses persisted shortcuts for customizable menu accelerators', () => {
    const main = readFileSync(join(process.cwd(), 'src/main/index.ts'), 'utf8')

    expect(main).toContain("shortcutFor('save')")
    expect(main).toContain("shortcutFor('saveAs')")
    expect(main).toContain("shortcutFor('settings')")
    expect(main).toContain("shortcutFor('search')")
    expect(main).toContain("shortcutFor('toggleSidebar')")
    expect(main).toContain("shortcutFor('toggleOutline')")
    expect(main).toContain("shortcutFor('cleanCjkTypography')")
  })

  it('rebuilds the menu after settings shortcuts change', () => {
    const main = readFileSync(join(process.cwd(), 'src/main/index.ts'), 'utf8')

    expect(main).toContain('buildMenu()')
    expect(main).toContain('appSettings = await updateAppSettings')
  })

  it('keeps document creation and window creation on separate shortcuts', () => {
    const main = readFileSync(join(process.cwd(), 'src/main/index.ts'), 'utf8')

    expect(main).toContain("label: '新建'")
    expect(main).toContain("accelerator: 'CmdOrCtrl+N'")
    expect(main).toContain("sendToFocused('menu-new-file-in-window')")
    expect(main).toContain("label: '新建窗口'")
    expect(main).toContain("accelerator: 'CmdOrCtrl+Shift+N'")
    expect(main).toContain('click: () => { createWindowMatchingSize(getFocusedWindow()) }')
  })

  it('sizes a new window from the window that requested it', () => {
    const main = readFileSync(join(process.cwd(), 'src/main/index.ts'), 'utf8')

    expect(main).toContain('function createWindowMatchingSize(sourceWin: BrowserWindow | null): BrowserWindow')
    expect(main).toContain('const { width, height } = sourceWin.getBounds()')
    expect(main).toContain('nextWin.setSize(width, height)')
    expect(main).toContain("ipcMain.handle('create-new-window', async (event) => {")
    expect(main).toContain('createWindowMatchingSize(getWinFromEvent(event))')
  })

  it('does not let an installed packaged app swallow development preview launches', () => {
    const main = readFileSync(join(process.cwd(), 'src/main/index.ts'), 'utf8')

    expect(main).toContain('const hasSingleInstanceLock = app.isPackaged ? app.requestSingleInstanceLock() : true')
  })

  it('uses Chinese top-level menu labels', () => {
    const main = readFileSync(join(process.cwd(), 'src/main/index.ts'), 'utf8')

    expect(main).toContain("label: '文件'")
    expect(main).toContain("label: '编辑'")
    expect(main).toContain("label: '查看'")
    expect(main).toContain("label: '格式'")
    expect(main).toContain("label: '帮助'")
  })

  it('wires CJK through shortcutFor cleanCjkTypography in menu', () => {
    const main = readFileSync(join(process.cwd(), 'src/main/index.ts'), 'utf8')

    expect(main).toContain("shortcutFor('cleanCjkTypography')")
  })

  it('wires AI palette through shortcutFor openAiPalette and sends menu-open-ai-palette event', () => {
    const main = readFileSync(join(process.cwd(), 'src/main/index.ts'), 'utf8')

    expect(main).toContain("shortcutFor('openAiPalette')")
    expect(main).toContain('menu-open-ai-palette')
  })

  it('renderer registers onMenuOpenAiPalette callback so native menu item is not dead', () => {
    const renderer = readFileSync(join(process.cwd(), 'src/renderer/main.ts'), 'utf8')

    expect(renderer).toContain('api.onMenuOpenAiPalette')
    expect(renderer).toContain('openAiPalette()')
  })

  it('exposes a pull-based current document snapshot for launch-opened files', () => {
    const main = readFileSync(join(process.cwd(), 'src/main/index.ts'), 'utf8')
    const preload = readFileSync(join(process.cwd(), 'src/preload/index.ts'), 'utf8')
    const renderer = readFileSync(join(process.cwd(), 'src/renderer/main.ts'), 'utf8')

    expect(main).toContain("ipcMain.handle('get-current-document'")
    expect(preload).toContain('getCurrentDocument: () => ipcRenderer.invoke(\'get-current-document\')')
    expect(renderer).toContain("typeof api.getCurrentDocument === 'function'")
    expect(renderer).toContain('api.getCurrentDocument().catch(() => null)')
    expect(renderer).toContain('applyOpenedDocument(startupDocument)')
  })

  it('exposes AI helper connection testing through main and preload', () => {
    const main = readFileSync(join(process.cwd(), 'src/main/index.ts'), 'utf8')
    const preload = readFileSync(join(process.cwd(), 'src/preload/index.ts'), 'utf8')

    expect(main).toContain("ipcMain.handle('test-ai-helper-connection'")
    expect(preload).toContain('testAiHelperConnection: () => ipcRenderer.invoke(\'test-ai-helper-connection\')')
  })
})
