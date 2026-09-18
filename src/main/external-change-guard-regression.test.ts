import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('destructive external change guard regression', () => {
  it('keeps destructive external writes from replacing the live editor payload', () => {
    const main = readFileSync(join(process.cwd(), 'src/main/index.ts'), 'utf8')

    expect(main).toContain('const blockedDestructiveApply = (changeRisk.isDestructive || options.forceDecision === true) && previousContent.length > 0')
    expect(main).toContain("win.webContents.send('file-changed', blockedDestructiveApply ? previousContent : data)")
    expect(main).toContain('if (blockedDestructiveApply) {')
    expect(main).toContain('tab.lastSyncedContent = syncDecision.nextSyncedContent')
  })

  it('tab 重新激活后补读磁盘并复用 watcher 同一条外部变更对账路径（门槛五）', () => {
    const main = readFileSync(join(process.cwd(), 'src/main/index.ts'), 'utf8')
    const fileSync = readFileSync(join(process.cwd(), 'src/main/file-sync.ts'), 'utf8')

    // watcher 事件与重新激活补读都收敛到同一个处理函数
    expect(main).toContain('handleExternalFileContent(win, state, watchedTab, data)')
    expect(main).toContain('reactivatedTab.unsavedContent !== null\n            ? { forceDecision: true, suppressContentApply: true }')
    // 补读先过纯模型决策（消费自身写入凭证 + reconcileWatchedContent 同语义）
    expect(main).toContain('decideReactivatedTabSync(')
    expect(fileSync).toContain('export function decideReactivatedTabSync(')
  })
})
