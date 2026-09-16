import { readdir } from 'fs/promises'
import { basename, join, relative } from 'path'
import { isMarkdownFile } from './file-extensions'

// 启动性能：扫描工作区时跳过重目录（依赖/版本库/隐藏目录），
// 否则第一次递归遍历可能要走过成千上万个 node_modules 文件。
const IGNORED_DIRECTORY_NAMES = new Set(['node_modules'])

function shouldEnterWorkdirDirectory(name: string): boolean {
  return !name.startsWith('.') && !IGNORED_DIRECTORY_NAMES.has(name)
}

export interface WorkdirEntry {
  absolutePath: string
  relativePath: string
}

export interface WorkdirTreeNode {
  absolutePath: string
  kind: 'directory' | 'file'
  name: string
  relativePath: string
  children?: WorkdirTreeNode[]
}

export function shouldRefreshWorkdirForWatchEvent(fileName?: string | Buffer | null): boolean {
  if (!fileName) return true
  const normalizedName = String(fileName)
  if (!normalizedName) return true
  if (!normalizedName.includes('.')) return true
  return isMarkdownFile(normalizedName)
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

export function resolveNewWorkdirFolderPath(
  rootPath: string,
  exists: (candidatePath: string) => boolean,
): string {
  let suffix = 1
  let candidatePath = join(rootPath, 'New Folder')

  while (exists(candidatePath)) {
    suffix += 1
    candidatePath = join(rootPath, `New Folder ${suffix}`)
  }

  return candidatePath
}

export function createWorkspaceRootTreeNode(
  rootPath: string,
  children: WorkdirTreeNode[],
): WorkdirTreeNode {
  return {
    absolutePath: rootPath,
    children,
    kind: 'directory',
    name: basename(rootPath),
    relativePath: basename(rootPath),
  }
}

export async function scanWorkdir(rootPath: string): Promise<WorkdirEntry[]> {
  // 扁平列表直接从树扫描拍平，避免对同一工作区做两次完整递归遍历。
  const tree = await scanWorkdirTree(rootPath)
  const entries: WorkdirEntry[] = []
  const stack = [...tree]
  while (stack.length > 0) {
    const node = stack.pop()!
    if (node.kind === 'file') {
      entries.push({
        absolutePath: node.absolutePath,
        relativePath: node.relativePath,
      })
    } else {
      stack.push(...node.children)
    }
  }
  entries.sort((a, b) => a.relativePath.localeCompare(b.relativePath))
  return entries
}

function sortWorkdirTreeNodes(a: WorkdirTreeNode, b: WorkdirTreeNode): number {
  if (a.kind !== b.kind) return a.kind === 'file' ? -1 : 1
  return a.name.localeCompare(b.name)
}

export async function scanWorkdirTree(rootPath: string): Promise<WorkdirTreeNode[]> {
  async function walk(currentPath: string): Promise<WorkdirTreeNode[]> {
    const dirEntries = await readdir(currentPath, { withFileTypes: true })
    const nodes = await Promise.all(dirEntries.map(async (entry): Promise<WorkdirTreeNode | null> => {
      const absolutePath = join(currentPath, entry.name)
      const relativePath = relative(rootPath, absolutePath).replaceAll('\\', '/')

      if (entry.isDirectory()) {
        if (!shouldEnterWorkdirDirectory(entry.name)) return null
        return {
          absolutePath,
          children: await walk(absolutePath),
          kind: 'directory',
          name: entry.name,
          relativePath,
        }
      }

      if (!entry.isFile() || !isMarkdownFile(entry.name)) return null

      return {
        absolutePath,
        kind: 'file',
        name: entry.name,
        relativePath,
      }
    }))

    return nodes.filter((node): node is WorkdirTreeNode => node !== null).sort(sortWorkdirTreeNodes)
  }

  return walk(rootPath)
}
