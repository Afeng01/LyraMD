import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('sidebar persistence regression', () => {
  const file = readFileSync(join(process.cwd(), 'src/main/index.ts'), 'utf8')

  it('awaits persistence after workspace changes before returning the next snapshot', () => {
    expect(file).toMatch(/ipcMain\.handle\('choose-workdir'[\s\S]*await refreshWorkdirEntries\(\)\n\s+await persistSidebarState\(\)[\s\S]*return createSidebarSnapshot\(win\)/)
    expect(file).toMatch(/ipcMain\.handle\('select-workspace'[\s\S]*sidebarState\.workspacePaths = addWorkspacePath[\s\S]*await refreshWorkdirEntries\(\)\n\s+await persistSidebarState\(\)[\s\S]*return createSidebarSnapshot\(win\)/)
    expect(file).toMatch(/ipcMain\.handle\('remove-workspace'[\s\S]*await refreshWorkdirEntries\(\)\n\s+await persistSidebarState\(\)[\s\S]*return createSidebarSnapshot\(win\)/)
    expect(file).not.toContain("ipcMain.handle('reorder-workspaces'")
  })

  it('scans expanded workspace roots only and keeps an independent tree per root', () => {
    expect(file).toContain('const expandedPaths = sidebarState.expandedWorkspacePaths')
    expect(file).toContain('Promise.all(expandedPaths.map(async (rootPath)')
    expect(file).toContain('return { rootPath, tree: await scanWorkdirTree(rootPath) }')
    expect(file).not.toContain('const tree = await scanWorkdirTree(activeWorkdirPath)')
  })

  it('dedupes concurrent per-window workdir refreshes (startup perf)', () => {
    // 启动期全局刷新与 did-finish-load 各触发一次，同一窗口必须复用 in-flight Promise
    expect(file).toContain('const workdirRefreshInFlight = new Map<number, Promise<void>>()')
    expect(file).toMatch(/function refreshWorkdirEntriesForWindow\(win: BrowserWindow\): Promise<void> \{[\s\S]*?workdirRefreshInFlight\.get\(win\.id\)[\s\S]*?doRefreshWorkdirEntriesForWindow\(win\)/)
  })

  it('flushes queued sidebar persistence before quitting', () => {
    expect(file).toContain('let sidebarQuitFlushStarted = false')
    expect(file).toMatch(/app\.on\('before-quit', async \(event\) => \{[\s\S]*event\.preventDefault\(\)[\s\S]*await persistSidebarState\(\)[\s\S]*app\.quit\(\)/)
  })

  it('does not block first-window creation on the workdir scan (startup perf)', () => {
    // loadSidebarState 不再在启动链路里等待工作目录扫描
    const loadSidebarStateBody = file.match(/async function loadSidebarState\(\): Promise<void> \{[\s\S]*?\n\}/)?.[0] ?? ''
    expect(loadSidebarStateBody).toContain('await persistSidebarState()')
    expect(loadSidebarStateBody).not.toContain('await refreshWorkdirEntries()')
    // 扫描改为首窗创建后的后台任务，完成后广播侧边栏刷新
    expect(file).toMatch(/void refreshWorkdirEntries\(\)\n\s*\.then\(\(\) => broadcastSidebarState\(\)\)/)
  })
})
