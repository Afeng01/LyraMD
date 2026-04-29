import { describe, expect, it } from 'vitest'

import {
  consumeQueuedContent,
  recordQueuedContent,
  releaseQueuedContent,
  resolveIncomingContentDecision,
} from './content-sync'

describe('queued content helpers', () => {
  it('records and consumes one queued content token at a time', () => {
    const queue = new Map<string, number>()
    recordQueuedContent(queue, 'draft-a')
    recordQueuedContent(queue, 'draft-a')

    expect(consumeQueuedContent(queue, 'draft-a')).toBe(true)
    expect(queue.get('draft-a')).toBe(1)
    expect(consumeQueuedContent(queue, 'draft-a')).toBe(true)
    expect(queue.has('draft-a')).toBe(false)
  })

  it('releases queued content without throwing when the token is absent', () => {
    const queue = new Map<string, number>()

    expect(releaseQueuedContent(queue, 'missing')).toBe(false)
  })
})

describe('resolveIncomingContentDecision', () => {
  it('ignores incoming content that matches the current editor state', () => {
    expect(resolveIncomingContentDecision({
      currentContent: 'hello',
      incomingContent: 'hello',
      hasPendingLocalSave: false,
      isKnownLocalEcho: false,
    })).toBe('ignore')
  })

  it('ignores known local save echoes even when the editor has moved on', () => {
    expect(resolveIncomingContentDecision({
      currentContent: 'hello world',
      incomingContent: 'hello',
      hasPendingLocalSave: false,
      isKnownLocalEcho: true,
    })).toBe('ignore')
  })

  it('defers true external updates while a local save is still in flight', () => {
    expect(resolveIncomingContentDecision({
      currentContent: 'hello world',
      incomingContent: 'hello world from disk',
      hasPendingLocalSave: true,
      isKnownLocalEcho: false,
    })).toBe('defer')
  })

  it('applies true external updates when the local save queue is idle', () => {
    expect(resolveIncomingContentDecision({
      currentContent: 'hello world',
      incomingContent: 'hello world from disk',
      hasPendingLocalSave: false,
      isKnownLocalEcho: false,
    })).toBe('apply')
  })
})
