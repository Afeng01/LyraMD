import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('editor placeholder regression', () => {
  it('re-syncs placeholder layout when the editor shell resizes, such as after sidebar toggles', () => {
    const file = readFileSync(join(process.cwd(), 'src/renderer/main.ts'), 'utf8')

    expect(file).toContain('new ResizeObserver(')
    expect(file).toContain('placeholderLayoutObserver.observe(editorShell)')
  })
})
