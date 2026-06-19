import { describe, expect, it } from 'vitest'

import {
  LOCAL_MEDIA_PROTOCOL,
  absolutePathToLocalMediaUrl,
  fileUrlToAbsolutePath,
  isLocalMediaUrl,
  localMediaUrlToAbsolutePath,
} from './local-media'

describe('local media urls', () => {
  it('round-trips absolute paths through the app-local media protocol', () => {
    const url = absolutePathToLocalMediaUrl('/Users/cherry/notes/image a.png')

    expect(url.startsWith(`${LOCAL_MEDIA_PROTOCOL}://local?path=`)).toBe(true)
    expect(isLocalMediaUrl(url)).toBe(true)
    expect(localMediaUrlToAbsolutePath(url)).toBe('/Users/cherry/notes/image a.png')
  })

  it('extracts absolute paths from file urls across macOS and Windows shapes', () => {
    expect(fileUrlToAbsolutePath('file:///Users/cherry/notes/a%20b.png')).toBe('/Users/cherry/notes/a b.png')
    expect(fileUrlToAbsolutePath('file:///C:/Users/Cherry/Notes/a%20b.png')).toBe('C:/Users/Cherry/Notes/a b.png')
  })
})
