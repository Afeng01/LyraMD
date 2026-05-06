import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, mkdir, rm, writeFile } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'

import { resolveNewWorkdirFolderPath, resolveNewWorkdirMarkdownPath, scanWorkdir, scanWorkdirTree, shouldRefreshWorkdirForWatchEvent } from './workdir'

describe('scanWorkdir', () => {
  const tempDirs: string[] = []

  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
  })

  it('recursively finds markdown files and sorts them by relative path', async () => {
    const root = await mkdtemp(join(tmpdir(), 'lyramd-workdir-'))
    tempDirs.push(root)

    await mkdir(join(root, 'daily'), { recursive: true })
    await mkdir(join(root, 'notes', 'nested'), { recursive: true })

    await writeFile(join(root, 'z-last.md'), '# z')
    await writeFile(join(root, 'daily', 'entry.md'), '# daily')
    await writeFile(join(root, 'notes', 'nested', 'idea.markdown'), '# idea')
    await writeFile(join(root, 'ignore.txt'), 'ignore')

    const entries = await scanWorkdir(root)

    expect(entries).toEqual([
      {
        absolutePath: join(root, 'daily', 'entry.md'),
        relativePath: 'daily/entry.md',
      },
      {
        absolutePath: join(root, 'notes', 'nested', 'idea.markdown'),
        relativePath: 'notes/nested/idea.markdown',
      },
      {
        absolutePath: join(root, 'z-last.md'),
        relativePath: 'z-last.md',
      },
    ])
  })
})

describe('scanWorkdirTree', () => {
  const tempDirs: string[] = []

  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
  })

  it('returns folders and markdown files only', async () => {
    const root = await mkdtemp(join(tmpdir(), 'lyramd-workdir-tree-'))
    tempDirs.push(root)

    await mkdir(join(root, 'notes', 'nested'), { recursive: true })
    await mkdir(join(root, 'empty'), { recursive: true })
    await writeFile(join(root, 'a.md'), '# a')
    await writeFile(join(root, 'notes', 'b.md'), '# b')
    await writeFile(join(root, 'notes', 'nested', 'c.markdown'), '# c')
    await writeFile(join(root, 'notes', 'image.png'), 'ignore')

    const tree = await scanWorkdirTree(root)

    expect(tree).toEqual([
      {
        absolutePath: join(root, 'a.md'),
        kind: 'file',
        name: 'a.md',
        relativePath: 'a.md',
      },
      {
        absolutePath: join(root, 'empty'),
        children: [],
        kind: 'directory',
        name: 'empty',
        relativePath: 'empty',
      },
      {
        absolutePath: join(root, 'notes'),
        children: [
          {
            absolutePath: join(root, 'notes', 'b.md'),
            kind: 'file',
            name: 'b.md',
            relativePath: 'notes/b.md',
          },
          {
            absolutePath: join(root, 'notes', 'nested'),
            children: [
              {
                absolutePath: join(root, 'notes', 'nested', 'c.markdown'),
                kind: 'file',
                name: 'c.markdown',
                relativePath: 'notes/nested/c.markdown',
              },
            ],
            kind: 'directory',
            name: 'nested',
            relativePath: 'notes/nested',
          },
        ],
        kind: 'directory',
        name: 'notes',
        relativePath: 'notes',
      },
    ])
  })
})

describe('resolveNewWorkdirMarkdownPath', () => {
  it('creates untitled markdown files in the active workdir', () => {
    expect(resolveNewWorkdirMarkdownPath('/workspace', () => false)).toBe(join('/workspace', 'untitled.md'))
  })

  it('adds a numeric suffix when the default filename exists', () => {
    expect(resolveNewWorkdirMarkdownPath('/workspace', (candidate) => (
      candidate === join('/workspace', 'untitled.md')
        || candidate === join('/workspace', 'untitled-2.md')
    ))).toBe(join('/workspace', 'untitled-3.md'))
  })
})

describe('resolveNewWorkdirFolderPath', () => {
  it('creates a default folder in the active workdir', () => {
    expect(resolveNewWorkdirFolderPath('/workspace', () => false)).toBe(join('/workspace', 'New Folder'))
  })

  it('adds a numeric suffix when the default folder exists', () => {
    expect(resolveNewWorkdirFolderPath('/workspace', (candidate) => (
      candidate === join('/workspace', 'New Folder')
        || candidate === join('/workspace', 'New Folder 2')
    ))).toBe(join('/workspace', 'New Folder 3'))
  })
})

describe('shouldRefreshWorkdirForWatchEvent', () => {
  it('refreshes on markdown file changes and unknown filenames', () => {
    expect(shouldRefreshWorkdirForWatchEvent('note.md')).toBe(true)
    expect(shouldRefreshWorkdirForWatchEvent('note.markdown')).toBe(true)
    expect(shouldRefreshWorkdirForWatchEvent('folder')).toBe(true)
    expect(shouldRefreshWorkdirForWatchEvent(undefined)).toBe(true)
  })

  it('ignores obvious non-markdown file changes', () => {
    expect(shouldRefreshWorkdirForWatchEvent('image.png')).toBe(false)
    expect(shouldRefreshWorkdirForWatchEvent('notes.txt')).toBe(false)
  })
})
