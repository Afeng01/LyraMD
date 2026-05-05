import { describe, expect, it } from 'vitest'

import { decideSecondInstanceAction, extractMarkdownLaunchPaths } from './windows-launch'

describe('extractMarkdownLaunchPaths', () => {
  it('extracts markdown file paths from packaged Windows argv', () => {
    expect(extractMarkdownLaunchPaths(
      ['C:\\Program Files\\LyraMD\\LyraMD.exe', 'C:\\Users\\Cherry\\Notes\\today.md'],
      { isPackaged: true },
    )).toEqual(['C:\\Users\\Cherry\\Notes\\today.md'])
  })

  it('skips Electron dev argv before user file paths', () => {
    expect(extractMarkdownLaunchPaths(
      ['/Applications/Electron.app/Contents/MacOS/Electron', '/repo/dist/main/index.js', '--inspect', 'C:\\Users\\Cherry\\Notes\\draft.markdown'],
      { isPackaged: false },
    )).toEqual(['C:\\Users\\Cherry\\Notes\\draft.markdown'])
  })

  it('ignores flags and non-markdown arguments', () => {
    expect(extractMarkdownLaunchPaths(
      ['C:\\Program Files\\LyraMD\\LyraMD.exe', '--squirrel-firstrun', 'C:\\Users\\Cherry\\Notes\\image.png', 'C:\\Users\\Cherry\\Notes\\essay.md'],
      { isPackaged: true },
    )).toEqual(['C:\\Users\\Cherry\\Notes\\essay.md'])
  })
})

describe('decideSecondInstanceAction', () => {
  it('opens launch files when the second instance receives markdown paths', () => {
    expect(decideSecondInstanceAction(['C:\\Users\\Cherry\\Notes\\today.md'])).toEqual({
      kind: 'open-files',
      filePaths: ['C:\\Users\\Cherry\\Notes\\today.md'],
    })
  })

  it('focuses the existing window when no markdown path was passed', () => {
    expect(decideSecondInstanceAction([])).toEqual({
      kind: 'focus-existing-window',
    })
  })
})
