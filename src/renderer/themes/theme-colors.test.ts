import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// 集成断言：主题对比度契约脚本必须真实跑通，
// 同时锁住 elegant 的 AA 校准值不被回退。
describe('theme color contract', () => {
  it('runs scripts/check-theme-colors.mjs successfully', () => {
    expect(() => {
      execSync('node scripts/check-theme-colors.mjs', { cwd: process.cwd(), stdio: 'pipe' })
    }).not.toThrow()
  })

  it('keeps the WCAG AA calibrated elegant tokens in base.css and standalone files', () => {
    const base = readFileSync(join(process.cwd(), 'src/renderer/themes/base.css'), 'utf8')
    const elegant = readFileSync(join(process.cwd(), 'themes/elegant.css'), 'utf8')

    // 旧值 #777 / #c44b2b 对 #f0edea 只有 3.84 / 4.10，不达 AA
    expect(base).not.toContain('--text-muted: #777;')
    expect(base).toContain('--text-muted: #6c6c6c;')
    expect(base).toContain('--link-color: #bc4424;')
    expect(elegant).toContain('--text-muted: #6c6c6c;')
    expect(elegant).toContain('--link-color: #bc4424;')
  })

  it('ships exactly the four built-in standalone theme files', () => {
    for (const name of ['light.css', 'dark.css', 'elegant.css', 'newsprint.css']) {
      expect(() => readFileSync(join(process.cwd(), 'themes', name), 'utf8')).not.toThrow()
      expect(readFileSync(join(process.cwd(), 'themes', name), 'utf8')).toMatch(/:root\s*\{/)
    }
  })
})
