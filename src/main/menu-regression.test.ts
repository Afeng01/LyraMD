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

  it('opens the built-in Markdown cheatsheet from the help menu', () => {
    const main = readFileSync(join(process.cwd(), 'src/main/index.ts'), 'utf8')

    expect(main).toContain("label: 'Markdown 语法速查'")
    expect(main).toContain("accelerator: 'CmdOrCtrl+Shift+/'")
    expect(main).toContain('click: () => openCheatsheet()')
    // 速查窗口用内存内容打开：无文件、无 watcher、不进最近列表
    expect(main).toContain("win.webContents.send('file-opened', { path: null, content: initialContent })")
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

  it('exposes manual update checks through native and Windows menus', () => {
    const main = readFileSync(join(process.cwd(), 'src/main/index.ts'), 'utf8')
    const preload = readFileSync(join(process.cwd(), 'src/preload/index.ts'), 'utf8')
    const renderer = readFileSync(join(process.cwd(), 'src/renderer/main.ts'), 'utf8')
    const html = readFileSync(join(process.cwd(), 'src/renderer/index.html'), 'utf8')

    expect(main).toContain("label: '检查更新…'")
    expect(main).toContain("ipcMain.handle('check-for-updates'")
    expect(preload).toContain('checkForUpdates: () => ipcRenderer.invoke(\'check-for-updates\')')
    expect(html).toContain('data-windows-action="check-updates"')
    expect(renderer).toContain('api.checkForUpdates?.()')
  })

  it('wires Word export through native menu, preload and renderer', () => {
    const main = readFileSync(join(process.cwd(), 'src/main/index.ts'), 'utf8')
    const preload = readFileSync(join(process.cwd(), 'src/preload/index.ts'), 'utf8')
    const renderer = readFileSync(join(process.cwd(), 'src/renderer/main.ts'), 'utf8')
    const html = readFileSync(join(process.cwd(), 'src/renderer/index.html'), 'utf8')

    expect(main).toContain("label: '导出 Word…'")
    expect(main).toContain("sendToFocused('menu-export-docx')")
    expect(main).toContain("ipcMain.handle('export-docx'")
    // 默认路径走 batch1 的目录锚定闸： beside current document
    expect(main).toContain('suggestSavePath(win, `${baseName}.docx`)')
    // 动态加载：docx 不进启动包
    expect(main).toContain("await import('./docx-export')")

    expect(preload).toContain("exportDocx: (content: string) => ipcRenderer.invoke('export-docx', content)")
    expect(preload).toContain('onMenuExportDocx')

    expect(renderer).toContain('api.onMenuExportDocx')
    expect(renderer).toContain('api.exportDocx(getMarkdown())')
    expect(html).toContain('data-windows-action="export-docx"')
  })
})
