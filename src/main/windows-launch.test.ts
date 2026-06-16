import { describe, expect, it } from 'vitest'

import { decideSecondInstanceAction, extractEditableLaunchPaths } from './windows-launch'

describe('extractEditableLaunchPaths', () => {
  it('extracts editable file paths from packaged Windows argv', () => {
    expect(extractEditableLaunchPaths(
      ['C:\\Program Files\\LyraMD\\LyraMD.exe', 'C:\\Users\\Cherry\\Notes\\today.md'],
      { isPackaged: true },
    )).toEqual(['C:\\Users\\Cherry\\Notes\\today.md'])
  })

  it('skips Electron dev argv before user file paths while allowing config formats', () => {
    expect(extractEditableLaunchPaths(
      ['/Applications/Electron.app/Contents/MacOS/Electron', '/repo/dist/main/index.js', '--inspect', 'C:\\Users\\Cherry\\Notes\\draft.markdown', '/repo/config.json', '/repo/index.html'],
      { isPackaged: false },
    )).toEqual(['C:\\Users\\Cherry\\Notes\\draft.markdown', '/repo/config.json'])
  })

  it('ignores flags and unsupported code or asset arguments', () => {
    expect(extractEditableLaunchPaths(
      ['C:\\Program Files\\LyraMD\\LyraMD.exe', '--squirrel-firstrun', 'C:\\Users\\Cherry\\Notes\\image.png', 'C:\\Users\\Cherry\\Notes\\essay.md', 'C:\\Users\\Cherry\\Notes\\settings.yaml', 'C:\\Users\\Cherry\\Notes\\script.ts'],
      { isPackaged: true },
    )).toEqual(['C:\\Users\\Cherry\\Notes\\essay.md', 'C:\\Users\\Cherry\\Notes\\settings.yaml'])
  })

  it('recognizes dotfile config paths from launch arguments', () => {
    expect(extractEditableLaunchPaths(
      ['/Applications/LyraMD.app/Contents/MacOS/LyraMD', '/Users/cherry/project/.env'],
      { isPackaged: true },
    )).toEqual(['/Users/cherry/project/.env'])
  })
})

describe('decideSecondInstanceAction', () => {
  it('opens launch files when the second instance receives editable paths', () => {
    expect(decideSecondInstanceAction(['C:\\Users\\Cherry\\Notes\\today.md'])).toEqual({
      kind: 'open-files',
      filePaths: ['C:\\Users\\Cherry\\Notes\\today.md'],
    })
  })

  it('focuses the existing window when no editable path was passed', () => {
    expect(decideSecondInstanceAction([])).toEqual({
      kind: 'focus-existing-window',
    })
  })
})
