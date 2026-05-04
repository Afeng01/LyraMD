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
})
