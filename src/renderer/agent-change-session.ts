export interface AgentChangeSession {
  applyBlocked: boolean
  previousContent: string
  updateCount: number
  summary: AgentChangeSummary
  risk: ExternalChangeRisk
}

export type ExternalChangeRiskReason =
  | 'emptied-document'
  | 'large-content-drop'
  | 'large-line-removal'

export interface ExternalChangeRisk {
  isDestructive: boolean
  reason: ExternalChangeRiskReason | null
  previousCharCount: number
  nextCharCount: number
  removedLineCount: number
  charDropRatio: number
}

export interface AgentChangePayload {
  applyBlocked?: boolean
  previousContent: string
  summary: AgentChangeSummary
  risk: ExternalChangeRisk
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
    applyBlocked: !!payload.applyBlocked,
    previousContent: payload.previousContent,
    updateCount: 1,
    summary: payload.summary,
    risk: payload.risk,
  }
}

export function mergeAgentChangeSession(
  session: AgentChangeSession,
  payload: AgentChangePayload,
): AgentChangeSession {
  return {
    applyBlocked: session.applyBlocked || !!payload.applyBlocked,
    previousContent: session.previousContent,
    updateCount: session.updateCount + 1,
    risk: payload.risk.isDestructive ? payload.risk : session.risk,
    summary: {
      addedLines: session.summary.addedLines + payload.summary.addedLines,
      removedLines: session.summary.removedLines + payload.summary.removedLines,
      changedLines: session.summary.changedLines + payload.summary.changedLines,
      preview: payload.summary.preview,
      truncated: session.summary.truncated || payload.summary.truncated,
    },
  }
}
