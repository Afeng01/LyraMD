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

  it('collapses timed-out external update hints without discarding rollback state', () => {
    const main = readFileSync(join(process.cwd(), 'src/renderer/main.ts'), 'utf8')

    expect(main).toContain('collapseAgentChangePanel()')
    expect(main).not.toContain('createAgentChangeAutoDismiss(() => {\n    clearAgentChangePanel()')
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

  it('keeps the external change recovery panel wired for destructive overwrite fallout', () => {
    const html = readFileSync(join(process.cwd(), 'src/renderer/index.html'), 'utf8')
    const main = readFileSync(join(process.cwd(), 'src/renderer/main.ts'), 'utf8')

    expect(html).toContain('id="external-change-recovery-panel"')
    expect(html).toContain('id="external-change-recovery-restore"')
    expect(main).toContain('refreshExternalChangeRecoveryPanel')
    expect(main).toContain("externalChangeRecoveryRestore?.addEventListener('click'")
    expect(main).toContain('api.restoreExternalChangeRecovery?.()')
  })

  it('ships a visible recent revisions entry point for local backups', () => {
    const html = readFileSync(join(process.cwd(), 'src/renderer/index.html'), 'utf8')
    const main = readFileSync(join(process.cwd(), 'src/renderer/main.ts'), 'utf8')

    expect(html).toContain('id="revision-history-panel"')
    expect(html).toContain('id="revision-history-toggle"')
    expect(html).toContain('id="safety-toggle"')
    expect(main).toContain('renderDocumentRevisionPanel')
    expect(main).toContain('openDocumentSafetyPanel')
    expect(main).toContain("revisionHistoryToggle?.addEventListener('click'")
    expect(main).toContain('api.restoreDocumentRevision?.(')
  })

  it('opens the first external update summary as an inline onboarding hint', () => {
    const main = readFileSync(join(process.cwd(), 'src/renderer/main.ts'), 'utf8')

    expect(main).toContain('hasShownAgentChangeHint')
    expect(main).toContain('agentChangeExpanded = options.agentChangePayload.risk.isDestructive || !hasShownAgentChangeHint')
  })

  it('treats destructive external updates as document safety incidents', () => {
    const main = readFileSync(join(process.cwd(), 'src/renderer/main.ts'), 'utf8')

    expect(main).toContain('options.agentChangePayload.risk.isDestructive')
    expect(main).toContain('openDocumentSafetyPanel()')
    expect(main).toContain('agentChangeAutoDismiss.clear()')
    expect(main).toContain('refreshExternalChangeRecoveryPanel()')
  })

  it('tells the user when a destructive overwrite was blocked before applying', () => {
    const main = readFileSync(join(process.cwd(), 'src/renderer/main.ts'), 'utf8')

    expect(main).toContain('session.applyBlocked')
    expect(main).toContain('已阻止覆盖：外部更新试图清空文稿')
  })

  it('documents Agent collaboration behavior in Settings', () => {
    const html = readFileSync(join(process.cwd(), 'src/renderer/index.html'), 'utf8')

    expect(html).toContain('Agent 协作')
    expect(html).toContain('外部更新提示会显示新增、删除和修改行数')
    expect(html).toContain('撤回这次更新')
  })
})
