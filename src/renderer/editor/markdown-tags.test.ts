import { describe, expect, it } from 'vitest'

import { collectMarkdownTokenRanges } from './markdown-tags'

describe('collectMarkdownTokenRanges', () => {
  it('recognizes Obsidian body tags and nested tags', () => {
    const tokens = collectMarkdownTokenRanges('写作 #idea #project/cola-md done')

    expect(tokens.map((token) => token.text)).toEqual(['#idea', '#project/cola-md'])
    expect(tokens.every((token) => token.kind === 'tag')).toBe(true)
  })

  it('recognizes YAML tag values with or without hash prefixes', () => {
    const tokens = collectMarkdownTokenRanges('tags: [agent, #codex, writing/notes]')

    expect(tokens).toEqual([
      { from: 7, kind: 'yaml-tag', text: '#agent', to: 12 },
      { from: 14, kind: 'yaml-tag', text: '#codex', to: 20 },
      { from: 22, kind: 'yaml-tag', text: '#writing/notes', to: 35 },
    ])
  })

  it('recognizes YAML tag list item values when the editor marks the list context', () => {
    const tokens = collectMarkdownTokenRanges('ai-index/skills', { yamlListItem: true })

    expect(tokens).toEqual([
      { from: 0, kind: 'yaml-tag', text: '#ai-index/skills', to: 15 },
    ])
  })

  it('recognizes wikilinks without treating them as tags', () => {
    const tokens = collectMarkdownTokenRanges('连接 [[Project Home]] 和 #tag')

    expect(tokens.map((token) => [token.kind, token.text])).toEqual([
      ['wikilink', '[[Project Home]]'],
      ['tag', '#tag'],
    ])
  })

  it('does not recognize markdown headings or empty hashes as tags', () => {
    const tokens = collectMarkdownTokenRanges('# Heading\n## Next\n# valid')

    expect(tokens).toEqual([])
  })
})
