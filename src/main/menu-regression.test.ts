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

    expect(main).toContain("label: 'New'")
    expect(main).toContain("accelerator: 'CmdOrCtrl+N'")
    expect(main).toContain("sendToFocused('menu-new-file-in-window')")
    expect(main).toContain("label: 'New Window'")
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
})
