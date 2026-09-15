import { mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it } from 'vitest'

import {
  checksumContent,
  createDocumentJournal,
  describeJournalContent,
  DOCUMENT_JOURNAL_DEFAULT_MAX_BYTES,
} from './document-journal'

const tempDirs: string[] = []

afterEach(async () => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) await rm(dir, { recursive: true, force: true })
  }
})

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'lyramd-journal-'))
  tempDirs.push(dir)
  return dir
}

describe('document journal checksum', () => {
  it('is deterministic and sensitive to content changes', () => {
    expect(checksumContent('hello')).toBe(checksumContent('hello'))
    expect(checksumContent('hello')).not.toBe(checksumContent('hello!'))
  })

  it('describes chars and normalized line counts', () => {
    expect(describeJournalContent('')).toEqual({ checksum: checksumContent(''), chars: 0, lines: 0 })
    const stats = describeJournalContent('a\r\nb\nc')
    expect(stats.chars).toBe(6)
    expect(stats.lines).toBe(3)
  })
})

describe('document journal record', () => {
  it('appends one JSON line per event with timestamp and app version', async () => {
    const dir = await createTempDir()
    const journalPath = join(dir, 'document-journal.jsonl')
    const journal = createDocumentJournal(journalPath, { appVersion: '1.3.8' })

    await journal.record({
      type: 'external-change-blocked',
      docPath: '/tmp/doc.md',
      source: 'external',
      risk: { isDestructive: true, reason: 'emptied-document' },
      previous: describeJournalContent('before'),
      next: describeJournalContent(''),
    })

    const raw = await readFile(journalPath, 'utf-8')
    const lines = raw.trim().split('\n')
    expect(lines).toHaveLength(1)
    const entry = JSON.parse(lines[0])
    expect(entry.type).toBe('external-change-blocked')
    expect(entry.appVersion).toBe('1.3.8')
    expect(typeof entry.ts).toBe('string')
    expect(entry.previous.checksum).toBe(checksumContent('before'))
    expect(entry.next.chars).toBe(0)
  })

  it('rotates by size and keeps one archived segment', async () => {
    const dir = await createTempDir()
    const journalPath = join(dir, 'document-journal.jsonl')
    const journal = createDocumentJournal(journalPath, { maxBytes: 256 })

    for (let index = 0; index < 20; index += 1) {
      await journal.record({ type: 'manual-save', detail: `event-${index}`.repeat(4) })
    }

    const entries = await readdir(dir)
    expect(entries).toContain('document-journal.jsonl')
    expect(entries).toContain('document-journal.jsonl.1')

    const current = await readFile(journalPath, 'utf-8')
    expect(current.trim().split('\n').length).toBeGreaterThan(0)
    expect((await stat(journalPath)).size).toBeLessThan(DOCUMENT_JOURNAL_DEFAULT_MAX_BYTES)
  })

  it('never throws when the journal target is unwritable', async () => {
    const dir = await createTempDir()
    // 把 journal 路径指到一个已存在的目录上，appendFile 必然失败，但 record 不能抛
    const journal = createDocumentJournal(dir)
    await expect(journal.record({ type: 'manual-save' })).resolves.toBeUndefined()
  })
})

describe('document journal wiring regression', () => {
  const main = readFileSync(join(process.cwd(), 'src/main/index.ts'), 'utf8')

  it('hooks every safety-relevant event in the main process', () => {
    expect(main).toContain("createDocumentJournal(documentJournalPath")
    expect(main).toContain("'external-change-blocked'")
    expect(main).toContain("'external-change-detected'")
    expect(main).toContain("'external-change-accepted'")
    expect(main).toContain("'external-change-restored'")
    expect(main).toContain("'crash-recovery-generated'")
    expect(main).toContain("'crash-recovery-restored'")
    expect(main).toContain("'revision-restored'")
    expect(main).toContain('journalSaveEventType(reason)')
  })

  it('records external changes before the guard decision, without blocking the save chain', () => {
    expect(main).toContain('void documentJournal.record(')
    // journal 写失败被模块内部吞掉，主链路不允许 await 它的结果
    expect(main).not.toContain('await documentJournal.record(')
  })
})
