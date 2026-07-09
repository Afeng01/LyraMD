export type IncomingContentResolution = 'ignore' | 'defer' | 'apply' | 'notify-only'

export interface IncomingContentDecisionInput {
  currentContent: string
  forceNotify: boolean
  incomingContent: string
  hasPendingLocalSave: boolean
  isKnownLocalEcho: boolean
}

export function recordQueuedContent(queue: Map<string, number>, content: string): void {
  queue.set(content, (queue.get(content) ?? 0) + 1)
}

export function releaseQueuedContent(queue: Map<string, number>, content: string): boolean {
  const count = queue.get(content) ?? 0
  if (count <= 0) return false

  if (count === 1) {
    queue.delete(content)
  } else {
    queue.set(content, count - 1)
  }

  return true
}

export function consumeQueuedContent(queue: Map<string, number>, content: string): boolean {
  return releaseQueuedContent(queue, content)
}

export function resolveIncomingContentDecision({
  currentContent,
  forceNotify,
  incomingContent,
  hasPendingLocalSave,
  isKnownLocalEcho,
}: IncomingContentDecisionInput): IncomingContentResolution {
  if (incomingContent === currentContent) return forceNotify ? 'notify-only' : 'ignore'
  if (isKnownLocalEcho) return 'ignore'
  if (hasPendingLocalSave) return 'defer'
  return 'apply'
}
