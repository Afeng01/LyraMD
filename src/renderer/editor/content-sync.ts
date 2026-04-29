export type IncomingContentResolution = 'ignore' | 'defer' | 'apply'

export interface IncomingContentDecisionInput {
  currentContent: string
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
  incomingContent,
  hasPendingLocalSave,
  isKnownLocalEcho,
}: IncomingContentDecisionInput): IncomingContentResolution {
  if (incomingContent === currentContent) return 'ignore'
  if (isKnownLocalEcho) return 'ignore'
  if (hasPendingLocalSave) return 'defer'
  return 'apply'
}
