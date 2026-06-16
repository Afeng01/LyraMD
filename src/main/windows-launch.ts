import { isManualEditableFile } from './file-extensions'

export type SecondInstanceAction =
  | { kind: 'open-files'; filePaths: string[] }
  | { kind: 'focus-existing-window' }

export function extractEditableLaunchPaths(
  argv: string[],
  { isPackaged }: { isPackaged: boolean },
): string[] {
  const userArgs = argv.slice(isPackaged ? 1 : 2)
  return userArgs.filter(arg => {
    if (!arg || arg.startsWith('-')) return false
    return isManualEditableFile(arg)
  })
}

export function decideSecondInstanceAction(filePaths: string[]): SecondInstanceAction {
  if (filePaths.length > 0) {
    return {
      kind: 'open-files',
      filePaths,
    }
  }

  return {
    kind: 'focus-existing-window',
  }
}
