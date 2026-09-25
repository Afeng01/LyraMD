import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const main = readFileSync(join(process.cwd(), 'src/main/index.ts'), 'utf8')
const windowTabs = readFileSync(join(process.cwd(), 'src/main/window-tabs.ts'), 'utf8')
const preload = readFileSync(join(process.cwd(), 'src/preload/index.ts'), 'utf8')
const renderer = readFileSync(join(process.cwd(), 'src/renderer/main.ts'), 'utf8')
const closeFlowStart = main.indexOf('async function closeTabInWindow(')
const closeFlowEnd = main.indexOf('// 阶段 A 会话恢复', closeFlowStart)
const closeFlow = closeFlowStart >= 0 && closeFlowEnd > closeFlowStart
  ? main.slice(closeFlowStart, closeFlowEnd)
  : ''

describe('tab close IPC regression (phase C follow-up)', () => {
  it('wires the visible close action through flush → closeTab IPC → main handler', () => {
    expect(renderer).toContain('onClose: (tabId) => {')
    expect(renderer).toContain('.then(() => api.closeTab(tabId, getMarkdown()))')
    expect(preload).toContain("closeTab: (tabId: string, content: string) => ipcRenderer.invoke('tabs-close', tabId, content)")
    expect(main).toContain("ipcMain.handle('tabs-close'")
    expect(main).toContain('return closeTabInWindow(win, tabId, typeof content === \'string\' ? content : undefined)')
  })

  it('asks before discarding a dirty tab and leaves it open when cancelled', () => {
    expect(closeFlow).toContain('if (target.unsavedContent !== null)')
    expect(closeFlow).toContain("buttons: ['取消', '丢弃并关闭']")
    expect(closeFlow).toContain('if (response !== 1)')
    expect(closeFlow.indexOf('if (target.unsavedContent !== null)')).toBeLessThan(closeFlow.indexOf('closeTabFromCollection(state.tabs, tabId)'))
  })

  it('switches active tabs safely and replaces the final tab with a blank tab', () => {
    expect(closeFlow).toContain('activateTabInWindow(win, nextTab.id)')
    expect(closeFlow).toContain('if (result.replacedLastTab)')
    expect(closeFlow).toContain("deliverFileOpenedPayload(win, { path: null, content: '' })")
    expect(windowTabs).toContain('export function closeTabFromCollection(collection: TabCollection, tabId: string)')
  })
})
