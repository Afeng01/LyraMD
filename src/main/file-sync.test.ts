import { mkdtemp, rename, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { describe, expect, it, vi } from 'vitest'

import {
  consumeIgnoredWatchedContent,
  decideWatchEvent,
  normalizeChangedName,
  reconcileWatchedContent,
  recordIgnoredWatchedContent,
} from './file-sync'
import * as fileSync from './file-sync'

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

describe('ignored watched content queue', () => {
  it('consumes one ignored internal write at a time', () => {
    const ignoredWatchedContents = new Map<string, number>()
    recordIgnoredWatchedContent(ignoredWatchedContents, 'draft a')
    recordIgnoredWatchedContent(ignoredWatchedContents, 'draft a')

    expect(consumeIgnoredWatchedContent(ignoredWatchedContents, 'draft a')).toBe(true)
    expect(ignoredWatchedContents.get('draft a')).toBe(1)
    expect(consumeIgnoredWatchedContent(ignoredWatchedContents, 'draft a')).toBe(true)
    expect(ignoredWatchedContents.has('draft a')).toBe(false)
  })

  it('does not consume unrelated watched content', () => {
    const ignoredWatchedContents = new Map<string, number>()
    recordIgnoredWatchedContent(ignoredWatchedContents, 'draft a')

    expect(consumeIgnoredWatchedContent(ignoredWatchedContents, 'draft b')).toBe(false)
    expect(ignoredWatchedContents.get('draft a')).toBe(1)
  })
})

describe('reconcileWatchedContent', () => {
  it('ignores watched file content that matches the already-synced content', () => {
    expect(reconcileWatchedContent('draft a', 'draft a')).toEqual({
      nextSyncedContent: 'draft a',
      shouldPropagate: false,
    })
  })

  it('propagates genuinely new watched file content', () => {
    expect(reconcileWatchedContent('draft a', 'draft ab')).toEqual({
      nextSyncedContent: 'draft ab',
      shouldPropagate: true,
    })
  })

  it('treats the first watched content as syncable baseline', () => {
    expect(reconcileWatchedContent(null, 'loaded file')).toEqual({
      nextSyncedContent: 'loaded file',
      shouldPropagate: true,
    })
  })
})

describe('decideWatchEvent', () => {
  it('treats change as a readable event', () => {
    expect(decideWatchEvent('change')).toEqual({
      shouldReadFile: true,
    })
  })

  it('treats rename as a readable event', () => {
    expect(decideWatchEvent('rename')).toEqual({
      shouldReadFile: true,
    })
  })

  it('ignores unsupported watch events', () => {
    expect(decideWatchEvent('unknown')).toEqual({
      shouldReadFile: false,
    })
  })
})

describe('normalizeChangedName', () => {
  it('keeps string file names as-is', () => {
    expect(normalizeChangedName('note.md')).toBe('note.md')
  })

  it('converts buffer file names to strings', () => {
    expect(normalizeChangedName(Buffer.from('note.md'))).toBe('note.md')
  })

  it('returns null for missing file names', () => {
    expect(normalizeChangedName(undefined)).toBeNull()
    expect(normalizeChangedName(null)).toBeNull()
  })
})

describe('watchTargetFile', () => {
  it('continues reporting changes after an atomic rename replacement', async () => {
    const watchTargetFile = (fileSync as Record<string, unknown>).watchTargetFile as
      | undefined
      | ((filePath: string, onEvent: (eventType: string) => void) => { close(): void })

    expect(watchTargetFile).toBeTypeOf('function')

    const tempDir = await mkdtemp(join(tmpdir(), 'lyramd-file-sync-'))
    const filePath = join(tempDir, 'note.md')
    const replacementPath = join(tempDir, 'note.tmp.md')
    const observedEvents: string[] = []

    await writeFile(filePath, '# first\n', 'utf-8')
    const watcher = watchTargetFile!(filePath, (eventType) => {
      observedEvents.push(eventType)
    })

    try {
      await sleep(50)
      await writeFile(replacementPath, '# second\n', 'utf-8')
      await rename(replacementPath, filePath)

      await vi.waitFor(() => {
        expect(observedEvents.length).toBeGreaterThanOrEqual(1)
      }, { timeout: 3000, interval: 50 })

      await writeFile(filePath, '# third\n', 'utf-8')

      await vi.waitFor(() => {
        expect(observedEvents.length).toBeGreaterThanOrEqual(2)
      }, { timeout: 3000, interval: 50 })
    } finally {
      watcher.close()
      await rm(tempDir, { recursive: true, force: true })
    }
  })

  it('can only ignore unrelated renames when the OS reports a file name', () => {
    const targetName = 'note.md'

    expect(normalizeChangedName('other.md')).not.toBe(targetName)
    expect(normalizeChangedName(undefined)).toBeNull()
  })
})
