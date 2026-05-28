import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('sidebar persistence regression', () => {
  const file = readFileSync(join(process.cwd(), 'src/main/index.ts'), 'utf8')

  it('awaits persistence after workspace changes before returning the next snapshot', () => {
    expect(file).toMatch(/ipcMain\.handle\('choose-workdir'[\s\S]*await refreshWorkdirEntries\(\)\n\s+await persistSidebarState\(\)[\s\S]*return createSidebarSnapshot\(win\)/)
    expect(file).toMatch(/ipcMain\.handle\('select-workspace'[\s\S]*sidebarState\.workspacePaths = addWorkspacePath[\s\S]*await refreshWorkdirEntries\(\)\n\s+await persistSidebarState\(\)[\s\S]*return createSidebarSnapshot\(win\)/)
    expect(file).toMatch(/ipcMain\.handle\('remove-workspace'[\s\S]*await refreshWorkdirEntries\(\)\n\s+await persistSidebarState\(\)[\s\S]*return createSidebarSnapshot\(win\)/)
    expect(file).toMatch(/ipcMain\.handle\('reorder-workspaces'[\s\S]*sidebarState\.workspacePaths = reorderWorkspacePaths[\s\S]*await persistSidebarState\(\)[\s\S]*return createSidebarSnapshot\(win\)/)
  })

  it('scans only the active workdir instead of merging all workspace trees', () => {
    expect(file).toContain('workdirEntries = await scanWorkdir(activeWorkdirPath)')
    expect(file).toContain('workdirTree = await scanWorkdirTree(activeWorkdirPath)')
    expect(file).not.toContain('existingWorkspacePaths.map(async (rootPath)')
    expect(file).not.toContain('createWorkspaceRootTreeNode(workspace.rootPath, workspace.tree)')
  })

  it('flushes queued sidebar persistence before quitting', () => {
    expect(file).toContain('let sidebarQuitFlushStarted = false')
    expect(file).toMatch(/app\.on\('before-quit', async \(event\) => \{[\s\S]*event\.preventDefault\(\)[\s\S]*await persistSidebarState\(\)[\s\S]*app\.quit\(\)/)
  })
})
