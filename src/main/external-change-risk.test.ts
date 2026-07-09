import { describe, expect, it } from 'vitest'

import { assessExternalChangeRisk } from './external-change-risk'
import { summarizeAgentChange } from './agent-change-summary'

describe('assessExternalChangeRisk', () => {
  it('marks non-empty to empty overwrites as destructive', () => {
    const previous = 'hello\nworld\n'
    const next = ''
    const summary = summarizeAgentChange(previous, next)

    expect(assessExternalChangeRisk(previous, next, summary)).toMatchObject({
      isDestructive: true,
      reason: 'emptied-document',
      previousCharCount: previous.length,
      nextCharCount: 0,
    })
  })

  it('marks large content drops as destructive', () => {
    const previous = Array.from({ length: 20 }, (_, index) => `line ${index} abcdefghijklmnopqrstuvwxyz`).join('\n')
    const next = 'short'
    const summary = summarizeAgentChange(previous, next)

    expect(assessExternalChangeRisk(previous, next, summary)).toMatchObject({
      isDestructive: true,
      reason: 'large-content-drop',
    })
  })

  it('marks large line removals as destructive even when some content remains', () => {
    const previous = Array.from({ length: 80 }, (_, index) => `line ${index}`).join('\n')
    const next = [
      ...Array.from({ length: 20 }, (_, index) => `line ${index}`),
      ...Array.from({ length: 30 }, (_, index) => `replacement ${index} with extra padding to avoid a huge char drop`),
    ].join('\n')
    const summary = summarizeAgentChange(previous, next)

    expect(assessExternalChangeRisk(previous, next, summary)).toMatchObject({
      isDestructive: true,
      reason: 'large-line-removal',
    })
  })

  it('keeps ordinary edits out of the destructive path', () => {
    const previous = 'a\nb\nc\n'
    const next = 'a\nb changed\nc\n'
    const summary = summarizeAgentChange(previous, next)

    expect(assessExternalChangeRisk(previous, next, summary)).toMatchObject({
      isDestructive: false,
      reason: null,
    })
  })
})
