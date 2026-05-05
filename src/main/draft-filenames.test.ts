import { join } from 'path'
import { describe, expect, it } from 'vitest'

import {
  resolveManualDraftPath,
  sanitizeMarkdownFileStem,
} from './drafts'

describe('sanitizeMarkdownFileStem', () => {
  it('keeps a clean manual draft title as the filename stem', () => {
    expect(sanitizeMarkdownFileStem(' 数字一的对话 ')).toBe('数字一的对话')
  })

  it('removes characters that are unsafe in filenames', () => {
    expect(sanitizeMarkdownFileStem('a/b:c*')).toBe('abc')
  })

  it('falls back when the title cannot produce a usable filename', () => {
    expect(sanitizeMarkdownFileStem('')).toBe('未命名草稿')
    expect(sanitizeMarkdownFileStem('///')).toBe('未命名草稿')
  })
})

describe('resolveManualDraftPath', () => {
  it('uses the manual title as the draft filename', () => {
    expect(resolveManualDraftPath('/drafts', '数字一的对话', () => false)).toBe(join('/drafts', '数字一的对话.md'))
  })

  it('adds a numeric suffix when the target draft filename exists', () => {
    expect(resolveManualDraftPath('/drafts', '数字一的对话', (candidate) => (
      candidate === join('/drafts', '数字一的对话.md')
    ))).toBe(join('/drafts', '数字一的对话-2.md'))
  })
})
