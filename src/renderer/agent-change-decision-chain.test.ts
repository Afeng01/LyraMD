import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { resolveIncomingContentDecision } from './editor/content-sync'

// 回归锁定：带未保存编辑的 tab 补读（suppressContentApply + forceDecision）被拦时，
// 决策面必须真正触达用户。此前 main 只发 agent-change-summary、跳过 file-changed，
// 而渲染层对该 summary 的唯一消费点是 onFileChanged → processIncomingDocumentContent，
// 导致决策面永远不可见。
describe('suppress 补读的决策面触达链路', () => {
  it('main 在 suppress + blockedDestructiveApply 时仍补发 file-changed（与非 suppress blocked 路径同形）', () => {
    const main = readFileSync(join(process.cwd(), 'src/main/index.ts'), 'utf8')

    expect(main).toContain('if (!win.isDestroyed() && (options.suppressContentApply !== true || blockedDestructiveApply)) {')
    expect(main).toContain("win.webContents.send('file-changed', blockedDestructiveApply ? previousContent : data)")
  })

  it('渲染层 file-changed 处理器消费 queued agent-change-summary 并进入决策面', () => {
    const renderer = readFileSync(join(process.cwd(), 'src/renderer/main.ts'), 'utf8')

    expect(renderer).toContain('queuedAgentChangePayload = payload')
    expect(renderer).toContain('const agentChangePayload = queuedAgentChangePayload')
    expect(renderer).toContain('processIncomingDocumentContent(content, currentScrollTop, { allowDefer: true, agentChangePayload })')
  })

  it('applyBlocked 载荷（previousContent + destructive risk）走 notify-only，不覆盖编辑器内容', () => {
    expect(resolveIncomingContentDecision({
      currentContent: 'local baseline',
      forceNotify: true,
      incomingContent: 'local baseline',
      hasPendingLocalSave: false,
      isKnownLocalEcho: false,
    })).toBe('notify-only')
  })
})
