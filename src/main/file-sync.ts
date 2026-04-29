export interface WatchedContentDecision {
  nextSyncedContent: string
  shouldPropagate: boolean
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
