import { join } from 'path'
import { describe, expect, it } from 'vitest'

import {
  createDraftFileName,
  deriveDraftDisplayTitle,
  isBlankDocumentContent,
  promoteDraftEntries,
  upsertDraftEntry,
} from './drafts'

describe('isBlankDocumentContent', () => {
  it('treats empty and whitespace-only content as blank', () => {
    expect(isBlankDocumentContent('')).toBe(true)
    expect(isBlankDocumentContent(' \n\t  ')).toBe(true)
    expect(isBlankDocumentContent('# title')).toBe(false)
  })
})

describe('deriveDraftDisplayTitle', () => {
  it('prefers the first heading line', () => {
    expect(deriveDraftDisplayTitle('\n# 第一标题\n正文')).toBe('第一标题')
  })

  it('falls back to the first non-empty line when there is no heading', () => {
    expect(deriveDraftDisplayTitle('\n  第一行内容  \n第二行')).toBe('第一行内容')
  })

  it('falls back to 未命名草稿 when content stays blank', () => {
    expect(deriveDraftDisplayTitle(' \n\t')).toBe('未命名草稿')
  })
})

describe('createDraftFileName', () => {
  it('creates a deterministic markdown filename', () => {
    expect(createDraftFileName(Date.UTC(2026, 3, 28, 2, 31, 22), 1)).toBe('draft-20260428-023122-1.md')
  })
})

describe('upsertDraftEntry', () => {
  it('keeps blank untitled sessions transient until the first real edit', () => {
    expect(upsertDraftEntry({
      entries: [],
      content: ' \n  ',
      draftDirectoryPath: '/drafts',
      now: Date.UTC(2026, 3, 28, 2, 31, 22),
    })).toEqual({
      draftEntry: null,
      entries: [],
      materialized: false,
    })
  })

  it('materializes a real draft entry with a real markdown path after the first edit', () => {
    const result = upsertDraftEntry({
      entries: [],
      content: '# 新草稿\n正文',
      draftDirectoryPath: '/drafts',
      now: Date.UTC(2026, 3, 28, 2, 31, 22),
      suffix: 1,
    })

    expect(result.materialized).toBe(true)
    expect(result.entries).toHaveLength(1)
    expect(result.draftEntry).toEqual({
      id: 'draft-20260428-023122-1',
      path: join('/drafts', 'draft-20260428-023122-1.md'),
      createdAt: Date.UTC(2026, 3, 28, 2, 31, 22),
      updatedAt: Date.UTC(2026, 3, 28, 2, 31, 22),
      displayTitle: '新草稿',
    })
  })

  it('preserves an existing draft position instead of moving it to the front', () => {
    const result = upsertDraftEntry({
      entries: [
        {
          id: 'draft-a',
          path: '/drafts/draft-a.md',
          createdAt: 1,
          updatedAt: 2,
          displayTitle: 'A',
        },
        {
          id: 'draft-b',
          path: '/drafts/draft-b.md',
          createdAt: 3,
          updatedAt: 4,
          displayTitle: 'B',
        },
      ],
      content: '# 更新后的 B',
      draftDirectoryPath: '/drafts',
      now: 5,
      existingEntry: {
        id: 'draft-b',
        path: '/drafts/draft-b.md',
        createdAt: 3,
        updatedAt: 4,
        displayTitle: 'B',
      },
    })

    expect(result.entries.map((entry) => entry.id)).toEqual(['draft-a', 'draft-b'])
    expect(result.entries[1]).toEqual({
      id: 'draft-b',
      path: '/drafts/draft-b.md',
      createdAt: 3,
      updatedAt: 5,
      displayTitle: '更新后的 B',
    })
  })
})

describe('promoteDraftEntries', () => {
  it('removes a promoted draft entry from the collection', () => {
    expect(promoteDraftEntries([
      {
        id: 'draft-a',
        path: '/drafts/draft-a.md',
        createdAt: 1,
        updatedAt: 2,
        displayTitle: 'A',
      },
      {
        id: 'draft-b',
        path: '/drafts/draft-b.md',
        createdAt: 3,
        updatedAt: 4,
        displayTitle: 'B',
      },
    ], { draftPath: '/drafts/draft-a.md' })).toEqual([
      {
        id: 'draft-b',
        path: '/drafts/draft-b.md',
        createdAt: 3,
        updatedAt: 4,
        displayTitle: 'B',
      },
    ])
  })
})
