import { copyFile, mkdir, rename } from 'fs/promises'
import { basename, dirname, extname, join } from 'path'

const IMAGE_MIME_EXTENSION_MAP = new Map<string, string>([
  ['image/png', '.png'],
  ['image/jpeg', '.jpg'],
  ['image/jpg', '.jpg'],
  ['image/webp', '.webp'],
  ['image/gif', '.gif'],
])

const MARKDOWN_IMAGE_PATTERN = /!\[[^\]]*]\((?<src><[^>]+>|[^)\s]+)(?<suffix>[^)]*)\)/g

export interface DocumentAssetMove {
  from: string
  to: string
}

export interface DocumentAssetMigrationPlan {
  markdown: string
  assetMoves: DocumentAssetMove[]
}

export type DocumentAssetMoveMode = 'copy' | 'move'

export function resolveDocumentAssetDirectoryPath(markdownPath: string): string {
  const stem = basename(markdownPath, extname(markdownPath)) || 'document'
  return join(dirname(markdownPath), `${stem}.assets`)
}

export function isSupportedImageMimeType(mimeType: string): boolean {
  return IMAGE_MIME_EXTENSION_MAP.has(mimeType.trim().toLowerCase())
}

export function createImageAssetFileName(input: {
  originalName?: string | null
  mimeType?: string | null
  now: number
  existingFileNames?: Set<string>
}): string {
  const normalizedMimeType = input.mimeType?.trim().toLowerCase() ?? ''
  const originalExtension = extname(input.originalName ?? '').toLowerCase()
  const extension = IMAGE_MIME_EXTENSION_MAP.get(normalizedMimeType)
    ?? (IMAGE_MIME_EXTENSION_MAP.has(`image/${originalExtension.slice(1)}`) ? originalExtension : '.png')
  const rawStem = basename(input.originalName ?? '', extname(input.originalName ?? ''))
  const normalizedStem = normalizeAssetFileStem(rawStem)
  const baseName = normalizedStem || `pasted-image-${formatUtcTimestamp(input.now)}`

  let candidate = `${baseName}${extension}`
  let suffix = 2
  while (input.existingFileNames?.has(candidate)) {
    candidate = `${baseName}-${suffix}${extension}`
    suffix += 1
  }
  return candidate
}

export function planDocumentAssetMigration(input: {
  sourceMarkdownPath: string
  targetMarkdownPath: string
  markdown: string
}): DocumentAssetMigrationPlan {
  if (input.sourceMarkdownPath === input.targetMarkdownPath) {
    return {
      markdown: input.markdown,
      assetMoves: [],
    }
  }

  const sourceAssetDirName = basename(resolveDocumentAssetDirectoryPath(input.sourceMarkdownPath))
  const targetAssetDirName = basename(resolveDocumentAssetDirectoryPath(input.targetMarkdownPath))
  const sourceAssetDirPath = resolveDocumentAssetDirectoryPath(input.sourceMarkdownPath)
  const targetAssetDirPath = resolveDocumentAssetDirectoryPath(input.targetMarkdownPath)
  const assetMoves = new Map<string, string>()

  const markdown = input.markdown.replace(MARKDOWN_IMAGE_PATTERN, (match, rawSrc: string, suffix = '') => {
    const normalizedSrc = unwrapMarkdownLinkDestination(rawSrc)
    const prefix = `./${sourceAssetDirName}/`
    if (!normalizedSrc.startsWith(prefix)) return match

    const fileName = normalizedSrc.slice(prefix.length)
    if (!fileName) return match

    const nextSrc = `./${targetAssetDirName}/${fileName}`
    assetMoves.set(join(sourceAssetDirPath, fileName), join(targetAssetDirPath, fileName))
    return match.replace(rawSrc + suffix, `${wrapMarkdownLinkDestinationIfNeeded(nextSrc)}${suffix}`)
  })

  return {
    markdown,
    assetMoves: Array.from(assetMoves.entries()).map(([from, to]) => ({ from, to })),
  }
}

export async function applyDocumentAssetMoves(input: {
  assetMoves: DocumentAssetMove[]
  mode: DocumentAssetMoveMode
}): Promise<void> {
  for (const move of input.assetMoves) {
    await mkdir(dirname(move.to), { recursive: true })
    if (input.mode === 'move') {
      await rename(move.from, move.to)
      continue
    }
    await copyFile(move.from, move.to)
  }
}

function normalizeAssetFileStem(stem: string): string {
  return stem
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

function formatUtcTimestamp(now: number): string {
  const date = new Date(now)
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  const hours = String(date.getUTCHours()).padStart(2, '0')
  const minutes = String(date.getUTCMinutes()).padStart(2, '0')
  const seconds = String(date.getUTCSeconds()).padStart(2, '0')
  return `${year}${month}${day}-${hours}${minutes}${seconds}`
}

function unwrapMarkdownLinkDestination(destination: string): string {
  return destination.startsWith('<') && destination.endsWith('>')
    ? destination.slice(1, -1)
    : destination
}

function wrapMarkdownLinkDestinationIfNeeded(destination: string): string {
  return /\s/.test(destination) ? `<${destination}>` : destination
}
