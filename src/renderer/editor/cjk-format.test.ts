import { describe, expect, it } from 'vitest'

import { formatCjkTypography } from './cjk-format'

describe('formatCjkTypography', () => {
  it('adds spacing between CJK text and latin words or numbers', () => {
    expect(formatCjkTypography('这是AI写作v2版本，支持Markdown格式。')).toBe(
      '这是 AI 写作 v2 版本，支持 Markdown 格式。',
    )
  })

  it('normalizes full-width latin letters and digits without changing Chinese punctuation', () => {
    expect(formatCjkTypography('使用ＡＩ生成２０２６版内容。')).toBe(
      '使用 AI 生成 2026 版内容。',
    )
  })

  it('trims trailing whitespace and collapses excessive blank lines', () => {
    expect(formatCjkTypography('第一行  \n\n\n\n第二行\t\n')).toBe('第一行\n\n第二行')
  })

  it('does not format fenced code blocks', () => {
    expect(formatCjkTypography([
      '正文AI测试',
      '```ts',
      'const message = "中文AI";  ',
      '```',
      '收尾Markdown格式',
    ].join('\n'))).toBe([
      '正文 AI 测试',
      '```ts',
      'const message = "中文AI";  ',
      '```',
      '收尾 Markdown 格式',
    ].join('\n'))
  })

  it('keeps blank lines inside fenced code blocks', () => {
    expect(formatCjkTypography([
      '```md',
      '第一行',
      '',
      '',
      '第二行',
      '```',
    ].join('\n'))).toBe([
      '```md',
      '第一行',
      '',
      '',
      '第二行',
      '```',
    ].join('\n'))
  })
})
