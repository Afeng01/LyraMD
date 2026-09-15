import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { parseChangelog, splitLeadingBold } from './changelog'

describe('changelog parser', () => {
  it('splits 「**标题**：描述」 into bold title and rest', () => {
    expect(splitLeadingBold('**数学公式**：直接打 $$…$$')).toEqual({ bold: '数学公式', rest: '直接打 $$…$$' })
    expect(splitLeadingBold('普通条目')).toEqual({ bold: null, rest: '普通条目' })
  })

  it('parses release headings with full-width parenthetical notes', () => {
    const releases = parseChangelog('## 未发布（开发中，尚未发布）\n\n### 新功能\n\n- 一\n\n## 1.3.8（2026-07-10）\n\n正文段落。\n')
    expect(releases).toHaveLength(2)
    expect(releases[0].version).toBe('未发布')
    expect(releases[0].note).toBe('开发中，尚未发布')
    expect(releases[0].blocks[0]).toEqual({ kind: 'group', title: '新功能', lines: ['一'] })
    expect(releases[1].version).toBe('1.3.8')
    expect(releases[1].blocks[0].kind).toBe('paragraphs')
  })

  it('skips preamble before the first release heading', () => {
    const releases = parseChangelog('# 更新日志\n\n格式参考 Keep a Changelog。\n\n## 1.3.8（2026-07-10）\n\n- 内容\n')
    expect(releases).toHaveLength(1)
    expect(releases[0].version).toBe('1.3.8')
  })

  it('parses the real repo CHANGELOG.md into renderable releases', () => {
    const raw = readFileSync(join(process.cwd(), 'CHANGELOG.md'), 'utf8')
    const releases = parseChangelog(raw)
    expect(releases.length).toBeGreaterThanOrEqual(2)
    expect(releases[0].version).toBe('未发布')
    expect(releases[0].blocks.some((block) => block.kind === 'group' && block.title === '文稿安全（2026-09-15，P0 整改第二批）')).toBe(true)
    const latestPublished = releases[1]
    expect(latestPublished.version).toMatch(/^\d+\.\d+\.\d+$/)
    expect(latestPublished.blocks.length).toBeGreaterThan(0)
  })
})
