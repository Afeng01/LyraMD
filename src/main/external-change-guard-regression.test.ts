import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('destructive external change guard regression', () => {
  it('keeps destructive external writes from replacing the live editor payload', () => {
    const main = readFileSync(join(process.cwd(), 'src/main/index.ts'), 'utf8')

    expect(main).toContain('const blockedDestructiveApply = changeRisk.isDestructive && previousContent.length > 0')
    expect(main).toContain("win.webContents.send('file-changed', blockedDestructiveApply ? previousContent : data)")
    expect(main).toContain('if (blockedDestructiveApply) {')
    expect(main).toContain('state.lastSyncedContent = syncDecision.nextSyncedContent')
  })
})
