import { describe, expect, it } from 'vitest'

import {
  createAgentChangeSession,
  mergeAgentChangeSession,
} from './agent-change-session'

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
    })).toEqual({
      previousContent: 'before first update',
      updateCount: 1,
      summary: firstSummary,
    })
  })

  it('merges newer external updates while preserving the first rollback content', () => {
    const session = createAgentChangeSession({
      previousContent: 'before first update',
      summary: firstSummary,
    })

    expect(mergeAgentChangeSession(session, {
      previousContent: 'between updates',
      summary: secondSummary,
    })).toEqual({
      previousContent: 'before first update',
      updateCount: 2,
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
