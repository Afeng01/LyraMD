import { describe, expect, it } from 'vitest'

import {
  collectFrontmatterSourceIndexes,
  normalizeFrontmatterRenderedText,
} from './frontmatter-display'

describe('frontmatter display helpers', () => {
  const metadata = [
    'title: 英语阅读日志\\',
    'summary: 鹿鸣的英文书籍阅读记录，供 Alice、Cola、Codex 等 Agent 共同写入；后续可迁移到飞书文档做统计。\\',
    'created: 2026-06-07\\',
    'updated: 2026-06-07\\',
    'source_wiki: /Users/cherry_xiao/.alice/wiki/学习/英语阅读日志与统计.md',
  ].join('\n')

  it('normalizes hard line break markers before matching rendered metadata', () => {
    expect(normalizeFrontmatterRenderedText(metadata)).not.toContain('\\')
    expect(normalizeFrontmatterRenderedText(metadata)).toContain('title: 英语阅读日志')
    expect(normalizeFrontmatterRenderedText(metadata)).toContain('created: 2026-06-07')
  })

  it('collects the rendered source block without swallowing the first real heading', () => {
    const indexes = collectFrontmatterSourceIndexes(metadata, [
      { tagName: 'hr', textContent: '' },
      {
        tagName: 'p',
        textContent:
          'title: 英语阅读日志 summary: 鹿鸣的英文书籍阅读记录，供 Alice、Cola、Codex 等 Agent 共同写入；后续可迁移到飞书文档做统计。 created: 2026-06-07 updated: 2026-06-07 source_wiki: /Users/cherry_xiao/.alice/wiki/学习/英语阅读日志与统计.md',
      },
      { tagName: 'hr', textContent: '' },
      { tagName: 'h1', textContent: '英语阅读日志' },
    ])

    expect(indexes).toEqual([0, 1, 2])
  })

  it('collects metadata split across multiple rendered paragraphs', () => {
    const indexes = collectFrontmatterSourceIndexes(metadata, [
      { tagName: 'hr', textContent: '' },
      { tagName: 'p', textContent: 'title: 英语阅读日志' },
      {
        tagName: 'p',
        textContent:
          'summary: 鹿鸣的英文书籍阅读记录，供 Alice、Cola、Codex 等 Agent 共同写入；后续可迁移到飞书文档做统计。 created: 2026-06-07 updated: 2026-06-07 source_wiki: /Users/cherry_xiao/.alice/wiki/学习/英语阅读日志与统计.md',
      },
      { tagName: 'hr', textContent: '' },
      { tagName: 'h1', textContent: '英语阅读日志' },
    ])

    expect(indexes).toEqual([0, 1, 2, 3])
  })

  it('collects metadata rendered as a YAML list without swallowing body content', () => {
    const listMetadata = [
      'title: Foo',
      'tags:',
      '  - ai-index/skills',
      '  - codex',
    ].join('\n')

    const indexes = collectFrontmatterSourceIndexes(listMetadata, [
      { tagName: 'hr', textContent: '' },
      { tagName: 'p', textContent: 'title: Foo tags:' },
      { tagName: 'ul', textContent: 'ai-index/skills codex' },
      { tagName: 'hr', textContent: '' },
      { tagName: 'h1', textContent: 'Foo' },
    ])

    expect(indexes).toEqual([0, 1, 2, 3])
  })

  it('does not hide the body heading when it repeats the frontmatter title', () => {
    const indexes = collectFrontmatterSourceIndexes('title: Foo', [
      { tagName: 'hr', textContent: '' },
      { tagName: 'p', textContent: 'title: Foo' },
      { tagName: 'hr', textContent: '' },
      { tagName: 'h1', textContent: 'Foo' },
    ])

    expect(indexes).toEqual([0, 1, 2])
  })

  it('does not hide unrelated leading content', () => {
    const indexes = collectFrontmatterSourceIndexes(metadata, [
      { tagName: 'h1', textContent: '英语阅读日志' },
      { tagName: 'p', textContent: '这是正文' },
    ])

    expect(indexes).toEqual([])
  })
})
