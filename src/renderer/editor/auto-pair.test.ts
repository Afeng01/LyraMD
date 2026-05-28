import { describe, expect, it } from 'vitest'
import { resolveAutoPairBackspace, resolveAutoPairTextInput } from './auto-pair'

describe('resolveAutoPairTextInput', () => {
  it('pairs Chinese parentheses and leaves the cursor inside', () => {
    expect(resolveAutoPairTextInput({
      text: '（',
      selectedText: '',
      nextText: '',
      cursor: 4,
    })).toEqual({
      insertText: '（）',
      selectionAnchor: 5,
      selectionHead: 5,
    })
  })

  it('pairs common ASCII brackets and quotes', () => {
    expect(resolveAutoPairTextInput({
      text: '(',
      selectedText: '',
      nextText: '',
      cursor: 2,
    })?.insertText).toBe('()')
    expect(resolveAutoPairTextInput({
      text: '"',
      selectedText: '',
      nextText: '',
      cursor: 2,
    })?.insertText).toBe('""')
  })

  it('steps over an existing closing character instead of duplicating it', () => {
    expect(resolveAutoPairTextInput({
      text: '）',
      selectedText: '',
      nextText: '）',
      cursor: 7,
    })).toEqual({
      insertText: '',
      selectionAnchor: 8,
      selectionHead: 8,
    })
  })

  it('does not intercept ordinary text or selected ranges', () => {
    expect(resolveAutoPairTextInput({
      text: 'a',
      selectedText: '',
      nextText: '',
      cursor: 1,
    })).toBeNull()
    expect(resolveAutoPairTextInput({
      text: '(',
      selectedText: '已选中',
      nextText: '',
      cursor: 1,
    })).toBeNull()
  })

  it('deletes an untouched paired wrapper together on backspace', () => {
    expect(resolveAutoPairBackspace({
      previousText: '（',
      nextText: '）',
      cursor: 5,
      selectedText: '',
    })).toEqual({
      deleteFrom: 4,
      deleteTo: 6,
      selectionAnchor: 4,
      selectionHead: 4,
    })
  })

  it('does not delete both sides once the pair has content or a selection', () => {
    expect(resolveAutoPairBackspace({
      previousText: '字',
      nextText: '）',
      cursor: 5,
      selectedText: '',
    })).toBeNull()
    expect(resolveAutoPairBackspace({
      previousText: '（',
      nextText: '）',
      cursor: 5,
      selectedText: '内容',
    })).toBeNull()
  })
})
