import { mkdir, mkdtemp, readFile, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, describe, expect, it } from 'vitest'

import {
  applyDocumentAssetMoves,
  createImageAssetFileName,
  isSupportedImageMimeType,
  planDocumentAssetMigration,
  resolveDocumentAssetDirectoryPath,
} from './image-assets'

const tempDirs: string[] = []

async function createTempDir(): Promise<string> {
  const tempDir = await mkdtemp(join(tmpdir(), 'lyramd-image-assets-'))
  tempDirs.push(tempDir)
  return tempDir
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe('resolveDocumentAssetDirectoryPath', () => {
  it('stores image assets next to the markdown file using a sibling .assets directory', () => {
    expect(resolveDocumentAssetDirectoryPath('/Users/cherry/notes/Weekly Review.md')).toBe(
      '/Users/cherry/notes/Weekly Review.assets',
    )
  })
})

describe('isSupportedImageMimeType', () => {
  it('supports the common pasted and dropped image formats', () => {
    expect(isSupportedImageMimeType('image/png')).toBe(true)
    expect(isSupportedImageMimeType('image/jpeg')).toBe(true)
    expect(isSupportedImageMimeType('image/webp')).toBe(true)
    expect(isSupportedImageMimeType('image/gif')).toBe(true)
    expect(isSupportedImageMimeType('image/svg+xml')).toBe(false)
  })
})

describe('createImageAssetFileName', () => {
  it('keeps a readable stem and preserves a supported extension', () => {
    expect(createImageAssetFileName({
      originalName: '屏幕截图 2026-06-18 at 10.30.00 AM.PNG',
      mimeType: 'image/png',
      now: Date.UTC(2026, 5, 18, 2, 30, 0),
    })).toBe('2026-06-18-at-10-30-00-am.png')
  })

  it('falls back to a pasted-image stem and infers the extension from mime type', () => {
    expect(createImageAssetFileName({
      originalName: '',
      mimeType: 'image/gif',
      now: Date.UTC(2026, 5, 18, 2, 30, 0),
    })).toBe('pasted-image-20260618-023000.gif')
  })
})

describe('planDocumentAssetMigration', () => {
  it('rewrites self-managed image asset paths when a draft is promoted to a formal file', () => {
    const result = planDocumentAssetMigration({
      sourceMarkdownPath: '/Users/cherry/Drafts/draft-20260618-103000-1.md',
      targetMarkdownPath: '/Users/cherry/Notes/菲律宾区为什么便宜.md',
      markdown: [
        '# 标题',
        '',
        '![截图](./draft-20260618-103000-1.assets/pasted-image-20260618-103000.png)',
        '![外链](https://example.com/cover.png)',
      ].join('\n'),
    })

    expect(result.markdown).toContain('./菲律宾区为什么便宜.assets/pasted-image-20260618-103000.png')
    expect(result.markdown).toContain('https://example.com/cover.png')
    expect(result.assetMoves).toEqual([
      {
        from: '/Users/cherry/Drafts/draft-20260618-103000-1.assets/pasted-image-20260618-103000.png',
        to: '/Users/cherry/Notes/菲律宾区为什么便宜.assets/pasted-image-20260618-103000.png',
      },
    ])
  })

  it('leaves markdown unchanged when saving back to the same path', () => {
    const markdown = '![截图](./note.assets/pasted-image.png)'

    expect(planDocumentAssetMigration({
      sourceMarkdownPath: '/Users/cherry/Notes/note.md',
      targetMarkdownPath: '/Users/cherry/Notes/note.md',
      markdown,
    })).toEqual({
      markdown,
      assetMoves: [],
    })
  })
})

describe('applyDocumentAssetMoves', () => {
  it('copies promoted image assets in switch mode without removing the source asset', async () => {
    const tempDir = await createTempDir()
    const sourceAssetPath = join(tempDir, 'draft.assets', 'cover.png')
    const targetAssetPath = join(tempDir, 'note.assets', 'cover.png')
    await mkdir(join(tempDir, 'draft.assets'), { recursive: true })
    await writeFile(sourceAssetPath, 'source-image', 'utf8')

    await applyDocumentAssetMoves({
      assetMoves: [{ from: sourceAssetPath, to: targetAssetPath }],
      mode: 'copy',
    })

    expect(await readFile(sourceAssetPath, 'utf8')).toBe('source-image')
    expect(await readFile(targetAssetPath, 'utf8')).toBe('source-image')
  })

  it('moves renamed image assets in move mode', async () => {
    const tempDir = await createTempDir()
    const sourceAssetPath = join(tempDir, 'old.assets', 'cover.png')
    const targetAssetPath = join(tempDir, 'new.assets', 'cover.png')
    await mkdir(join(tempDir, 'old.assets'), { recursive: true })
    await writeFile(sourceAssetPath, 'source-image', 'utf8')

    await applyDocumentAssetMoves({
      assetMoves: [{ from: sourceAssetPath, to: targetAssetPath }],
      mode: 'move',
    })

    await expect(readFile(sourceAssetPath, 'utf8')).rejects.toThrow()
    expect(await readFile(targetAssetPath, 'utf8')).toBe('source-image')
  })
})
