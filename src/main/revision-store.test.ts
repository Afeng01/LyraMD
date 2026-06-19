import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, describe, expect, it } from 'vitest'

import {
  clearCrashRecoveryState,
  createDocumentRevisionKey,
  readCrashRecoveryState,
  readLatestRevisionSnapshot,
  recordRevisionSnapshot,
  writeCrashRecoveryState,
} from './revision-store'

const tempDirs: string[] = []

async function createTempDir(): Promise<string> {
  const tempDir = await mkdtemp(join(tmpdir(), 'lyramd-revisions-'))
  tempDirs.push(tempDir)
  return tempDir
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map(async (dir) => {
    await clearCrashRecoveryState(join(dir, 'crash-recovery.json')).catch(() => {})
    await rm(dir, { force: true, recursive: true }).catch(() => {})
  }))
})

describe('createDocumentRevisionKey', () => {
  it('uses the draft id as the stable draft key when available', () => {
    expect(createDocumentRevisionKey({
      documentKind: 'draft',
      draftId: 'draft-1',
      filePath: '/tmp/draft-1.md',
    })).toContain('draft-')
  })
})

describe('recordRevisionSnapshot', () => {
  it('persists and reads back the latest revision snapshot', async () => {
    const rootDir = await createTempDir()

    await recordRevisionSnapshot(rootDir, {
      content: '# 第一版',
      displayTitle: '标题一',
      documentKind: 'file',
      draftId: null,
      filePath: '/tmp/note.md',
      reason: 'autosave',
      updatedAt: 1,
    })

    const latest = await readLatestRevisionSnapshot(
      rootDir,
      createDocumentRevisionKey({ documentKind: 'file', draftId: null, filePath: '/tmp/note.md' }),
    )

    expect(latest?.content).toBe('# 第一版')
    expect(latest?.displayTitle).toBe('标题一')
  })

  it('deduplicates unchanged snapshots for the same document', async () => {
    const rootDir = await createTempDir()

    const first = await recordRevisionSnapshot(rootDir, {
      content: '# 第一版',
      displayTitle: '标题一',
      documentKind: 'file',
      draftId: null,
      filePath: '/tmp/note.md',
      reason: 'autosave',
      updatedAt: 1,
    })

    const second = await recordRevisionSnapshot(rootDir, {
      content: '# 第一版',
      displayTitle: '标题一',
      documentKind: 'file',
      draftId: null,
      filePath: '/tmp/note.md',
      reason: 'save',
      updatedAt: 2,
    })

    expect(second.id).toBe(first.id)
  })

  it('prunes old snapshots beyond the keep limit', async () => {
    const rootDir = await createTempDir()

    await recordRevisionSnapshot(rootDir, {
      content: '# 一',
      displayTitle: '一',
      documentKind: 'file',
      draftId: null,
      filePath: '/tmp/note.md',
      reason: 'autosave',
      updatedAt: 1,
    }, 2)

    await recordRevisionSnapshot(rootDir, {
      content: '# 二',
      displayTitle: '二',
      documentKind: 'file',
      draftId: null,
      filePath: '/tmp/note.md',
      reason: 'autosave',
      updatedAt: 2,
    }, 2)

    const latest = await recordRevisionSnapshot(rootDir, {
      content: '# 三',
      displayTitle: '三',
      documentKind: 'file',
      draftId: null,
      filePath: '/tmp/note.md',
      reason: 'autosave',
      updatedAt: 3,
    }, 2)

    expect(latest.content).toBe('# 三')
    const surviving = await readLatestRevisionSnapshot(
      rootDir,
      createDocumentRevisionKey({ documentKind: 'file', draftId: null, filePath: '/tmp/note.md' }),
    )
    expect(surviving?.content).toBe('# 三')
  })
})

describe('crash recovery state', () => {
  it('writes, reads, and clears crash recovery state', async () => {
    const rootDir = await createTempDir()
    const crashRecoveryStatePath = join(rootDir, 'crash-recovery.json')
    const snapshot = await recordRevisionSnapshot(rootDir, {
      content: '# 恢复内容',
      displayTitle: '恢复草稿',
      documentKind: 'draft',
      draftId: 'draft-1',
      filePath: '/tmp/draft-1.md',
      reason: 'crash',
      updatedAt: 9,
    })

    await writeCrashRecoveryState(crashRecoveryStatePath, {
      reason: 'crashed',
      snapshot,
      status: 'crashed',
      updatedAt: 10,
    })

    expect((await readCrashRecoveryState(crashRecoveryStatePath))?.snapshot.content).toBe('# 恢复内容')
    await clearCrashRecoveryState(crashRecoveryStatePath)
    expect(await readCrashRecoveryState(crashRecoveryStatePath)).toBeNull()
  })
})
