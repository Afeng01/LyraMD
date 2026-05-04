import { describe, expect, it } from 'vitest'

import { summarizeAgentChange } from './agent-change-summary'

describe('summarizeAgentChange', () => {
  it('counts added, removed, and changed lines from an external edit', () => {
    expect(summarizeAgentChange([
      '# Plan',
      '',
      '- old task',
      '- keep',
      '- remove',
    ].join('\n'), [
      '# Plan',
      '',
      '- new task',
      '- keep',
      '- added',
      '- extra',
    ].join('\n'))).toEqual({
      addedLines: 1,
      removedLines: 0,
      changedLines: 2,
      preview: [
        {
          type: 'changed',
          lineNumber: 3,
          previousText: '- old task',
          text: '- new task',
        },
        {
          type: 'changed',
          lineNumber: 5,
          previousText: '- remove',
          text: '- added',
        },
        {
          type: 'added',
          lineNumber: 6,
          text: '- extra',
        },
      ],
      truncated: false,
    })
  })

  it('returns an empty summary when content did not change', () => {
    expect(summarizeAgentChange('same\ntext', 'same\ntext')).toEqual({
      addedLines: 0,
      removedLines: 0,
      changedLines: 0,
      preview: [],
      truncated: false,
    })
  })

  it('truncates preview lines without losing total counts', () => {
    const before = ['a', 'b', 'c', 'd', 'e', 'f'].join('\n')
    const after = ['a1', 'b1', 'c1', 'd1', 'e1', 'f1'].join('\n')

    expect(summarizeAgentChange(before, after, { maxPreviewLines: 3 })).toEqual({
      addedLines: 0,
      removedLines: 0,
      changedLines: 6,
      preview: [
        { type: 'changed', lineNumber: 1, previousText: 'a', text: 'a1' },
        { type: 'changed', lineNumber: 2, previousText: 'b', text: 'b1' },
        { type: 'changed', lineNumber: 3, previousText: 'c', text: 'c1' },
      ],
      truncated: true,
    })
  })
})
