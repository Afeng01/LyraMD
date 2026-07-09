import { describe, expect, it } from 'vitest'

import {
  createAgentChangeSession,
  mergeAgentChangeSession,
} from './agent-change-session'

const safeRisk = {
  isDestructive: false,
  reason: null,
  previousCharCount: 120,
  nextCharCount: 116,
  removedLineCount: 1,
  charDropRatio: 0.03,
} as const

const destructiveRisk = {
  isDestructive: true,
  reason: 'emptied-document' as const,
  previousCharCount: 120,
  nextCharCount: 0,
  removedLineCount: 3,
  charDropRatio: 1,
}

const firstSummary = {
  addedLines: 1,
  removedLines: 0,
  changedLines: 1,
  preview: [
    { type: 'changed' as const, lineNumber: 2, previousText: 'old', text: 'new' },
  ],
  truncated: false,
}

const secondSummary = {
  addedLines: 0,
  removedLines: 1,
  changedLines: 2,
  preview: [
    { type: 'removed' as const, lineNumber: 4, text: 'drop' },
  ],
  truncated: true,
}

describe('agent change session', () => {
  it('creates a rollback session from the first external update', () => {
    expect(createAgentChangeSession({
      previousContent: 'before first update',
      summary: firstSummary,
      risk: safeRisk,
    })).toEqual({
      previousContent: 'before first update',
      updateCount: 1,
      summary: firstSummary,
      risk: safeRisk,
    })
  })

  it('merges newer external updates while preserving the first rollback content', () => {
    const session = createAgentChangeSession({
      previousContent: 'before first update',
      summary: firstSummary,
      risk: safeRisk,
    })

    expect(mergeAgentChangeSession(session, {
      previousContent: 'between updates',
      summary: secondSummary,
      risk: destructiveRisk,
    })).toEqual({
      previousContent: 'before first update',
      updateCount: 2,
      risk: destructiveRisk,
      summary: {
        addedLines: 1,
        removedLines: 1,
        changedLines: 3,
        preview: secondSummary.preview,
        truncated: true,
      },
    })
  })
})
