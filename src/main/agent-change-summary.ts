export type AgentChangePreviewType = 'added' | 'removed' | 'changed'

export interface AgentChangePreviewLine {
  type: AgentChangePreviewType
  lineNumber: number
  text: string
  previousText?: string
}

export interface AgentChangeSummary {
  addedLines: number
  removedLines: number
  changedLines: number
  preview: AgentChangePreviewLine[]
  truncated: boolean
}

export interface AgentChangeSummaryOptions {
  maxPreviewLines?: number
  maxComparisonCells?: number
}

type DiffOp =
  | { type: 'equal'; text: string; beforeLine: number; afterLine: number }
  | { type: 'removed'; text: string; beforeLine: number }
  | { type: 'added'; text: string; afterLine: number }

const DEFAULT_MAX_PREVIEW_LINES = 6
const DEFAULT_MAX_COMPARISON_CELLS = 80000

export function summarizeAgentChange(
  previousContent: string,
  nextContent: string,
  options: AgentChangeSummaryOptions = {},
): AgentChangeSummary {
  const previousLines = splitDocumentLines(previousContent)
  const nextLines = splitDocumentLines(nextContent)
  const maxPreviewLines = Math.max(0, options.maxPreviewLines ?? DEFAULT_MAX_PREVIEW_LINES)
  const maxComparisonCells = Math.max(1, options.maxComparisonCells ?? DEFAULT_MAX_COMPARISON_CELLS)
  const diffOps = previousLines.length * nextLines.length <= maxComparisonCells
    ? buildLcsDiff(previousLines, nextLines)
    : buildBoundedDiff(previousLines, nextLines)

  return summarizeDiffOps(diffOps, maxPreviewLines)
}

function splitDocumentLines(content: string): string[] {
  if (content.length === 0) return []
  return content.replaceAll('\r\n', '\n').split('\n')
}

function buildLcsDiff(previousLines: string[], nextLines: string[]): DiffOp[] {
  const previousCount = previousLines.length
  const nextCount = nextLines.length
  const dp: number[][] = Array.from({ length: previousCount + 1 }, () => (
    Array.from({ length: nextCount + 1 }, () => 0)
  ))

  for (let previousIndex = previousCount - 1; previousIndex >= 0; previousIndex -= 1) {
    for (let nextIndex = nextCount - 1; nextIndex >= 0; nextIndex -= 1) {
      dp[previousIndex][nextIndex] = previousLines[previousIndex] === nextLines[nextIndex]
        ? dp[previousIndex + 1][nextIndex + 1] + 1
        : Math.max(dp[previousIndex + 1][nextIndex], dp[previousIndex][nextIndex + 1])
    }
  }

  const ops: DiffOp[] = []
  let previousIndex = 0
  let nextIndex = 0

  while (previousIndex < previousCount && nextIndex < nextCount) {
    const previousText = previousLines[previousIndex]
    const nextText = nextLines[nextIndex]
    if (previousText === nextText) {
      ops.push({
        type: 'equal',
        text: previousText,
        beforeLine: previousIndex + 1,
        afterLine: nextIndex + 1,
      })
      previousIndex += 1
      nextIndex += 1
    } else if (dp[previousIndex + 1][nextIndex] >= dp[previousIndex][nextIndex + 1]) {
      ops.push({
        type: 'removed',
        text: previousText,
        beforeLine: previousIndex + 1,
      })
      previousIndex += 1
    } else {
      ops.push({
        type: 'added',
        text: nextText,
        afterLine: nextIndex + 1,
      })
      nextIndex += 1
    }
  }

  while (previousIndex < previousCount) {
    ops.push({
      type: 'removed',
      text: previousLines[previousIndex],
      beforeLine: previousIndex + 1,
    })
    previousIndex += 1
  }

  while (nextIndex < nextCount) {
    ops.push({
      type: 'added',
      text: nextLines[nextIndex],
      afterLine: nextIndex + 1,
    })
    nextIndex += 1
  }

  return ops
}

function buildBoundedDiff(previousLines: string[], nextLines: string[]): DiffOp[] {
  let prefixLength = 0
  while (
    prefixLength < previousLines.length
    && prefixLength < nextLines.length
    && previousLines[prefixLength] === nextLines[prefixLength]
  ) {
    prefixLength += 1
  }

  let suffixLength = 0
  while (
    suffixLength < previousLines.length - prefixLength
    && suffixLength < nextLines.length - prefixLength
    && previousLines[previousLines.length - suffixLength - 1] === nextLines[nextLines.length - suffixLength - 1]
  ) {
    suffixLength += 1
  }

  const ops: DiffOp[] = []
  for (let index = 0; index < prefixLength; index += 1) {
    ops.push({
      type: 'equal',
      text: previousLines[index],
      beforeLine: index + 1,
      afterLine: index + 1,
    })
  }

  const previousMiddleEnd = previousLines.length - suffixLength
  const nextMiddleEnd = nextLines.length - suffixLength
  for (let index = prefixLength; index < previousMiddleEnd; index += 1) {
    ops.push({
      type: 'removed',
      text: previousLines[index],
      beforeLine: index + 1,
    })
  }
  for (let index = prefixLength; index < nextMiddleEnd; index += 1) {
    ops.push({
      type: 'added',
      text: nextLines[index],
      afterLine: index + 1,
    })
  }

  for (let index = 0; index < suffixLength; index += 1) {
    const previousIndex = previousMiddleEnd + index
    const nextIndex = nextMiddleEnd + index
    ops.push({
      type: 'equal',
      text: previousLines[previousIndex],
      beforeLine: previousIndex + 1,
      afterLine: nextIndex + 1,
    })
  }

  return ops
}

function summarizeDiffOps(diffOps: DiffOp[], maxPreviewLines: number): AgentChangeSummary {
  const summary: AgentChangeSummary = {
    addedLines: 0,
    removedLines: 0,
    changedLines: 0,
    preview: [],
    truncated: false,
  }
  let removedBuffer: Array<{ text: string; lineNumber: number }> = []
  let addedBuffer: Array<{ text: string; lineNumber: number }> = []

  const pushPreview = (line: AgentChangePreviewLine): void => {
    if (summary.preview.length < maxPreviewLines) {
      summary.preview.push(line)
      return
    }
    summary.truncated = true
  }

  const flushChangeBuffers = (): void => {
    const changedCount = Math.min(removedBuffer.length, addedBuffer.length)
    for (let index = 0; index < changedCount; index += 1) {
      const removedLine = removedBuffer[index]
      const addedLine = addedBuffer[index]
      summary.changedLines += 1
      pushPreview({
        type: 'changed',
        lineNumber: addedLine.lineNumber,
        previousText: removedLine.text,
        text: addedLine.text,
      })
    }

    for (const addedLine of addedBuffer.slice(changedCount)) {
      summary.addedLines += 1
      pushPreview({
        type: 'added',
        lineNumber: addedLine.lineNumber,
        text: addedLine.text,
      })
    }

    for (const removedLine of removedBuffer.slice(changedCount)) {
      summary.removedLines += 1
      pushPreview({
        type: 'removed',
        lineNumber: removedLine.lineNumber,
        text: removedLine.text,
      })
    }

    removedBuffer = []
    addedBuffer = []
  }

  for (const op of diffOps) {
    if (op.type === 'equal') {
      flushChangeBuffers()
      continue
    }

    if (op.type === 'removed') {
      removedBuffer.push({ text: op.text, lineNumber: op.beforeLine })
    } else {
      addedBuffer.push({ text: op.text, lineNumber: op.afterLine })
    }
  }

  flushChangeBuffers()
  return summary
}
