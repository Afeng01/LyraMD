import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { buildTitleSyncPath, decideTitleSync, sanitizeTitleToFileStem } from './title-sync'

describe('sanitizeTitleToFileStem', () => {
  it('removes unsupported path characters', () => {
    expect(sanitizeTitleToFileStem('My:/ Unsafe*Title?')).toBe('My UnsafeTitle')
  })
})

describe('decideTitleSync', () => {
  it('does nothing when there is no file path', () => {
    expect(decideTitleSync({
      mode: 'always',
      filePath: null,
      previousTitle: '旧标题',
      nextTitle: '新标题',
    })).toEqual({
      shouldRename: false,
      nextPath: null,
    })
  })

  it('does nothing in never mode', () => {
    expect(decideTitleSync({
      mode: 'never',
      filePath: '/tmp/old.md',
      previousTitle: '旧标题',
      nextTitle: '新标题',
    })).toEqual({
      shouldRename: false,
      nextPath: null,
    })
  })

  it('does nothing in ask mode until UI handles it', () => {
    expect(decideTitleSync({
      mode: 'ask',
      filePath: '/tmp/old.md',
      previousTitle: '旧标题',
      nextTitle: '新标题',
    })).toEqual({
      shouldRename: false,
      nextPath: null,
    })
  })

  it('suggests a renamed path in always mode when the title changes', () => {
    expect(decideTitleSync({
      mode: 'always',
      filePath: '/tmp/old.md',
      previousTitle: '旧标题',
      nextTitle: '新标题',
    })).toEqual({
      shouldRename: true,
      nextPath: '/tmp/新标题.md',
    })
  })

  it('does not rename when the current file stem already matches the new title', () => {
    expect(decideTitleSync({
      mode: 'always',
      filePath: '/tmp/新标题.md',
      previousTitle: '旧标题',
      nextTitle: '新标题',
    })).toEqual({
      shouldRename: false,
      nextPath: null,
    })
  })
})

describe('buildTitleSyncPath', () => {
  it('builds a markdown path from the next title', () => {
    expect(buildTitleSyncPath('/tmp/old.md', '新标题')).toBe('/tmp/新标题.md')
  })

  it('preserves the original extension when renaming', () => {
    expect(buildTitleSyncPath('/tmp/old.markdown', '新标题')).toBe('/tmp/新标题.markdown')
  })

  it('does not duplicate the extension when the edited title already includes it', () => {
    expect(buildTitleSyncPath('/tmp/old.md', '新标题.md')).toBe('/tmp/新标题.md')
  })

  it('returns null when the title becomes empty after sanitization', () => {
    expect(buildTitleSyncPath('/tmp/old.md', '////')).toBeNull()
  })
})

describe('macOS window chrome', () => {
  it('uses a tighter traffic light offset so the hidden inset title bar does not feel oversized', () => {
    const file = readFileSync(join(process.cwd(), 'src/main/index.ts'), 'utf8')

    expect(file).toContain("trafficLightPosition: { x: 14, y: 14 }")
  })
})
