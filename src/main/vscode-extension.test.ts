import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const extensionDir = join(process.cwd(), 'vscode-extension')

describe('vscode extension', () => {
  it('ships syntactically valid extension.js', () => {
    expect(() => execSync('node --check extension.js', { cwd: extensionDir, stdio: 'pipe' })).not.toThrow()
  })

  it('registers the lyramd command and configuration under the lyramd namespace', () => {
    const pkg = JSON.parse(readFileSync(join(extensionDir, 'package.json'), 'utf8'))
    const extension = readFileSync(join(extensionDir, 'extension.js'), 'utf8')

    expect(pkg.name).toBe('lyramd-open-in-lyramd')
    expect(pkg.main).toBe('./extension.js')
    expect(pkg.contributes.commands[0].command).toBe('lyramd.openCurrentMarkdown')
    expect(Object.keys(pkg.contributes.configuration.properties)).toEqual(['lyramd.executablePath'])
    expect(extension).toContain("registerCommand('lyramd.openCurrentMarkdown'")
    expect(extension).toContain("getConfiguration('lyramd')")
  })

  it('uses platform-specific LyraMD launch defaults', () => {
    const extension = readFileSync(join(extensionDir, 'extension.js'), 'utf8')

    expect(extension).toContain("'open'")
    expect(extension).toContain("'-a'")
    expect(extension).toContain("'LyraMD'")
    expect(extension).toContain("'LyraMD.exe'")
    expect(extension).toContain("'lyramd'")
  })
})
