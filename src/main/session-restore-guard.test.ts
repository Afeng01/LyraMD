import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// 阶段 C 复核 warn 修复的哨兵：openFile 的「未 ready 直落活动 tab」兜底
// 在会话恢复进行中必须让路（退回空窗复用/新窗口），否则启动瞬间到达的
// openFile 会顶掉正在恢复的标签集合。守卫以 in-flight 窗口集合实现，
// 恢复函数入口 add、finally 中 delete，保证异常路径也能清除。
const source = readFileSync(join(__dirname, 'index.ts'), 'utf-8')

describe('session restore in-flight guard (phase C review warn)', () => {
  it('declares the in-flight window set next to window state', () => {
    expect(source).toMatch(/const sessionRestoreInFlightWindows = new Set<number>\(\)/)
  })

  it('restoreSessionTabsInWindow marks in-flight on entry and clears it in finally', () => {
    expect(source).toMatch(/sessionRestoreInFlightWindows\.add\(win\.id\)/)
    expect(source).toMatch(/finally \{[\s\S]*?sessionRestoreInFlightWindows\.delete\(win\.id\)[\s\S]*?\}/)
  })

  it('openFile pre-ready fallback yields to the empty-window path while restoring', () => {
    // 兜底分支必须在直写活动 tab 之前检查 in-flight 守卫
    expect(source).toMatch(/if \(!sessionRestoreInFlightWindows\.has\(hostWin\.id\)\) \{[\s\S]*?loadFileInWindow\(hostWin, filePath\)/)
  })
})
