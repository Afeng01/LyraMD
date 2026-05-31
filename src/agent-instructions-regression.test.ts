import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('project agent instructions regression', () => {
  it('keeps AGENTS.md on the current 1.x Electron and Milkdown baseline', () => {
    const agentsPath = join(process.cwd(), 'AGENTS.md')

    expect(existsSync(agentsPath)).toBe(true)

    const agents = readFileSync(agentsPath, 'utf8')

    expect(agents).toContain('当前工作基线')
    expect(agents).toContain('LyraMD 1.x')
    expect(agents).toContain('Electron + Milkdown')
    expect(agents).toContain('不要更换技术栈')
    expect(agents).toContain('VMark 只作为交互参考')
    expect(agents).not.toContain('当前优先目标是 LyraMD 2.0')
    expect(agents).not.toContain('不要默认继续在 1.x 上加功能')
  })

  it('keeps CLAUDE.md aligned with the same current baseline', () => {
    const claude = readFileSync(join(process.cwd(), 'CLAUDE.md'), 'utf8')

    expect(claude).toContain('当前工作基线')
    expect(claude).toContain('LyraMD 1.x')
    expect(claude).toContain('Electron + Milkdown')
    expect(claude).toContain('不要更换技术栈')
    expect(claude).not.toContain('不要侧边栏')
    expect(claude).not.toContain('界面只有：标题栏')
  })
})
