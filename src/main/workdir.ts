import { readdir } from 'fs/promises'
import { join, relative } from 'path'

export interface WorkdirEntry {
  absolutePath: string
  relativePath: string
}

const MARKDOWN_EXTENSIONS = new Set(['.md', '.markdown', '.mdown', '.mkd'])

function hasMarkdownExtension(fileName: string): boolean {
  const dotIndex = fileName.lastIndexOf('.')
  if (dotIndex === -1) return false
  return MARKDOWN_EXTENSIONS.has(fileName.slice(dotIndex).toLowerCase())
}

export function shouldRefreshWorkdirForWatchEvent(fileName?: string | Buffer | null): boolean {
  if (!fileName) return true
  const normalizedName = String(fileName)
  if (!normalizedName) return true
  return hasMarkdownExtension(normalizedName)
}

export function resolveNewWorkdirMarkdownPath(
  rootPath: string,
  exists: (candidatePath: string) => boolean,
): string {
  let suffix = 1
  let candidatePath = join(rootPath, 'untitled.md')

  while (exists(candidatePath)) {
    suffix += 1
    candidatePath = join(rootPath, `untitled-${suffix}.md`)
  }

  return candidatePath
}

export async function scanWorkdir(rootPath: string): Promise<WorkdirEntry[]> {
  const entries: WorkdirEntry[] = []

  async function walk(currentPath: string): Promise<void> {
    const dirEntries = await readdir(currentPath, { withFileTypes: true })

    await Promise.all(dirEntries.map(async (entry) => {
      const absolutePath = join(currentPath, entry.name)

      if (entry.isDirectory()) {
        await walk(absolutePath)
        return
      }

      if (!entry.isFile() || !hasMarkdownExtension(entry.name)) return

      entries.push({
        absolutePath,
        relativePath: relative(rootPath, absolutePath).replaceAll('\\', '/'),
      })
    }))
  }

  await walk(rootPath)
  entries.sort((a, b) => a.relativePath.localeCompare(b.relativePath))
  return entries
}
