import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('agent change panel regression', () => {
  it('restarts auto-dismiss when the user opens the change summary', () => {
    const main = readFileSync(join(process.cwd(), 'src/renderer/main.ts'), 'utf8')
    const toggleStart = main.indexOf("agentChangeToggle?.addEventListener('click', () => {")
    const toggleEnd = main.indexOf('\n  })', toggleStart)
    const toggleBody = main.slice(toggleStart, toggleEnd)

    expect(toggleBody).toContain('agentChangeAutoDismiss.schedule()')
  })

  it('ships a one-click rollback button for external updates', () => {
    const html = readFileSync(join(process.cwd(), 'src/renderer/index.html'), 'utf8')
    const main = readFileSync(join(process.cwd(), 'src/renderer/main.ts'), 'utf8')

    expect(html).toContain('id="agent-change-restore"')
    expect(main).toContain("agentChangeRestore?.addEventListener('click'")
    expect(main).toContain('restoreAgentChangeSession()')
  })

  it('keeps the crash recovery panel wired for renderer restart fallout', () => {
    const html = readFileSync(join(process.cwd(), 'src/renderer/index.html'), 'utf8')
    const main = readFileSync(join(process.cwd(), 'src/renderer/main.ts'), 'utf8')

    expect(html).toContain('id="crash-recovery-panel"')
    expect(html).toContain('id="crash-recovery-restore"')
    expect(main).toContain('refreshCrashRecoveryPanel')
    expect(main).toContain("crashRecoveryRestore?.addEventListener('click'")
    expect(main).toContain('api.restoreCrashRecovery?.()')
  })

  it('opens the first external update summary as an inline onboarding hint', () => {
    const main = readFileSync(join(process.cwd(), 'src/renderer/main.ts'), 'utf8')

    expect(main).toContain('hasShownAgentChangeHint')
    expect(main).toContain('agentChangeExpanded = !hasShownAgentChangeHint')
  })

  it('documents Agent collaboration behavior in Settings', () => {
    const html = readFileSync(join(process.cwd(), 'src/renderer/index.html'), 'utf8')

    expect(html).toContain('Agent 协作')
    expect(html).toContain('外部更新提示会显示新增、删除和修改行数')
    expect(html).toContain('撤回这次更新')
  })
})
