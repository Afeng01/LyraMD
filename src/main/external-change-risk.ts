import type { AgentChangeSummary } from './agent-change-summary'

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

const LARGE_CONTENT_DROP_RATIO = 0.6
const LARGE_LINE_REMOVAL_THRESHOLD = 50

export function assessExternalChangeRisk(
  previousContent: string,
  nextContent: string,
  summary: AgentChangeSummary,
): ExternalChangeRisk {
  const previousCharCount = previousContent.length
  const nextCharCount = nextContent.length
  const removedLineCount = summary.removedLines + summary.changedLines
  const charDropRatio = previousCharCount <= 0
    ? 0
    : Math.max(0, previousCharCount - nextCharCount) / previousCharCount

  if (previousCharCount > 0 && nextCharCount === 0) {
    return {
      isDestructive: true,
      reason: 'emptied-document',
      previousCharCount,
      nextCharCount,
      removedLineCount,
      charDropRatio,
    }
  }

  if (previousCharCount > 0 && charDropRatio >= LARGE_CONTENT_DROP_RATIO) {
    return {
      isDestructive: true,
      reason: 'large-content-drop',
      previousCharCount,
      nextCharCount,
      removedLineCount,
      charDropRatio,
    }
  }

  if (removedLineCount >= LARGE_LINE_REMOVAL_THRESHOLD) {
    return {
      isDestructive: true,
      reason: 'large-line-removal',
      previousCharCount,
      nextCharCount,
      removedLineCount,
      charDropRatio,
    }
  }

  return {
    isDestructive: false,
    reason: null,
    previousCharCount,
    nextCharCount,
    removedLineCount,
    charDropRatio,
  }
}
