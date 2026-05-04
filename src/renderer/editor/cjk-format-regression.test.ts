import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('CJK typography cleanup integration', () => {
  it('ships an Edit menu command through preload to the renderer', () => {
    const mainProcess = readFileSync(join(process.cwd(), 'src/main/index.ts'), 'utf8')
    const preload = readFileSync(join(process.cwd(), 'src/preload/index.ts'), 'utf8')
    const renderer = readFileSync(join(process.cwd(), 'src/renderer/main.ts'), 'utf8')

    expect(mainProcess).toContain('Clean CJK Typography')
    expect(mainProcess).toContain("sendToFocused('menu-clean-cjk-typography')")
    expect(preload).toContain('onMenuCleanCjkTypography')
    expect(renderer).toContain('formatCjkTypography(')
    expect(renderer).toContain('api.onMenuCleanCjkTypography')
  })
})
