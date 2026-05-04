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
})
