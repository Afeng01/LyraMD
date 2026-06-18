import { describe, expect, it } from 'vitest'

import { formatDocumentStats, resolveDocumentStats } from './document-stats'

describe('document stats', () => {
  it('counts CJK characters, Latin words, number groups, visible characters, and lines', () => {
    expect(resolveDocumentStats('今天 write notes 2026\n第二行')).toEqual({
      characters: 19,
      lines: 2,
      words: 8,
    })
  })

  it('ignores markdown image payloads when counting words and characters', () => {
    expect(resolveDocumentStats('开头\n![](data:image/png;base64,abcdefghijklmnopqrstuvwxyz)\n结尾')).toEqual({
      characters: 4,
      lines: 3,
      words: 4,
    })
  })

  it('formats the stats as a compact writing status label', () => {
    expect(formatDocumentStats({
      characters: 19,
      lines: 2,
      words: 8,
    })).toBe('8 字 · 19 字符 · 2 行')
  })
})
