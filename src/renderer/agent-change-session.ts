export interface AgentChangeSession {
  previousContent: string
  updateCount: number
  summary: AgentChangeSummary
}

export interface AgentChangePayload {
  previousContent: string
  summary: AgentChangeSummary
}

export interface AgentChangeSummary {
  addedLines: number
  removedLines: number
  changedLines: number
  preview: Array<{
    type: 'added' | 'removed' | 'changed'
    lineNumber: number
    text: string
    previousText?: string
  }>
  truncated: boolean
}

export function createAgentChangeSession(payload: AgentChangePayload): AgentChangeSession {
  return {
    previousContent: payload.previousContent,
    updateCount: 1,
    summary: payload.summary,
  }
}

export function mergeAgentChangeSession(
  session: AgentChangeSession,
  payload: AgentChangePayload,
): AgentChangeSession {
  return {
    previousContent: session.previousContent,
    updateCount: session.updateCount + 1,
    summary: {
      addedLines: session.summary.addedLines + payload.summary.addedLines,
      removedLines: session.summary.removedLines + payload.summary.removedLines,
      changedLines: session.summary.changedLines + payload.summary.changedLines,
      preview: payload.summary.preview,
      truncated: session.summary.truncated || payload.summary.truncated,
    },
  }
}
