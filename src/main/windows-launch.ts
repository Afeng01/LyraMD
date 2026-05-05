import { extname } from 'path'

export type SecondInstanceAction =
  | { kind: 'open-files'; filePaths: string[] }
  | { kind: 'focus-existing-window' }

export function extractMarkdownLaunchPaths(
  argv: string[],
  { isPackaged }: { isPackaged: boolean },
): string[] {
  const userArgs = argv.slice(isPackaged ? 1 : 2)
  return userArgs.filter(isMarkdownLaunchArg)
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

function isMarkdownLaunchArg(arg: string): boolean {
  if (!arg || arg.startsWith('-')) return false
  const extension = extname(arg).toLowerCase()
  return extension === '.md' || extension === '.markdown'
}
