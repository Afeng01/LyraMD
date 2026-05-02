import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('editor search migration regression', () => {
  it('does not keep legacy search-state bootstrap calls that break renderer init at runtime', () => {
    const file = readFileSync(join(process.cwd(), 'src/renderer/editor/editor.ts'), 'utf8')

    expect(file).not.toContain('createSearchState(getCurrentSearchSourceText()')
    expect(file).not.toContain('getCurrentSearchSourceText(')
  })
})
