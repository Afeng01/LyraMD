import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('Milkdown dependency regression', () => {
  it('keeps direct @milkdown/core aligned with @milkdown/kit', () => {
    const packageJson = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8'))
    const packageLock = JSON.parse(readFileSync(join(process.cwd(), 'package-lock.json'), 'utf8'))

    expect(packageJson.dependencies['@milkdown/core']).toBe('7.19.2')
    expect(packageJson.dependencies['@milkdown/kit']).toBe('^7.19.2')
    expect(packageLock.packages[''].dependencies['@milkdown/core']).toBe('7.19.2')
    expect(packageLock.packages['node_modules/@milkdown/core'].version).toBe('7.19.2')
    expect(packageLock.packages['node_modules/@milkdown/kit'].version).toBe('7.19.2')
  })
})
