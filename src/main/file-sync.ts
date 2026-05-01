import { watch, type FSWatcher } from 'fs'
import { basename, dirname } from 'path'

export interface WatchedContentDecision {
  nextSyncedContent: string
  shouldPropagate: boolean
}

export interface WatchEventDecision {
  shouldReadFile: boolean
}

export function normalizeChangedName(changedName: string | Buffer | null | undefined): string | null {
  if (typeof changedName === 'string') return changedName
  if (changedName && Buffer.isBuffer(changedName)) return changedName.toString()
  return null
}

export function recordIgnoredWatchedContent(
  ignoredWatchedContents: Map<string, number>,
  content: string,
): void {
  ignoredWatchedContents.set(content, (ignoredWatchedContents.get(content) ?? 0) + 1)
}

export function consumeIgnoredWatchedContent(
  ignoredWatchedContents: Map<string, number>,
  content: string,
): boolean {
  const currentCount = ignoredWatchedContents.get(content) ?? 0
  if (currentCount <= 0) return false
  if (currentCount === 1) {
    ignoredWatchedContents.delete(content)
  } else {
    ignoredWatchedContents.set(content, currentCount - 1)
  }
  return true
}

export function reconcileWatchedContent(
  lastSyncedContent: string | null,
  nextContent: string,
): WatchedContentDecision {
  return {
    nextSyncedContent: nextContent,
    shouldPropagate: lastSyncedContent !== nextContent,
  }
}

export function decideWatchEvent(eventType: string): WatchEventDecision {
  if (eventType === 'rename') {
    return {
      shouldReadFile: true,
    }
  }

  if (eventType === 'change') {
    return {
      shouldReadFile: true,
    }
  }

  return {
    shouldReadFile: false,
  }
}

export function watchTargetFile(
  filePath: string,
  onEvent: (eventType: string) => void,
): FSWatcher {
  const parentDir = dirname(filePath)
  const targetName = basename(filePath)

  return watch(parentDir, (eventType, changedName) => {
    const normalizedChangedName = normalizeChangedName(changedName)
    if (normalizedChangedName && normalizedChangedName !== targetName) {
      return
    }

    if (!normalizedChangedName && eventType !== 'rename') {
      return
    }

    onEvent(eventType)
  })
}
