import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('Milkdown dependency regression', () => {
  it('does not mix direct @milkdown/core imports with @milkdown/kit core contexts', () => {
    const packageJson = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8'))
    const packageLock = JSON.parse(readFileSync(join(process.cwd(), 'package-lock.json'), 'utf8'))
    const editor = readFileSync(join(process.cwd(), 'src/renderer/editor/editor.ts'), 'utf8')

    expect(packageJson.dependencies['@milkdown/kit']).toBe('^7.19.2')
    expect(packageJson.dependencies['@milkdown/core']).toBeUndefined()
    expect(packageLock.packages[''].dependencies['@milkdown/core']).toBeUndefined()
    expect(packageLock.packages['node_modules/@milkdown/kit'].version).toBe('7.19.2')
    expect(editor).not.toContain("from '@milkdown/core'")
    expect(editor).toContain("from '@milkdown/kit/core'")
  })
})
