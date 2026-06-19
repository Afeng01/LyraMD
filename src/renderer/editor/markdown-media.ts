import {
  absolutePathToLocalMediaUrl,
  fileUrlToAbsolutePath,
  isLocalMediaUrl,
} from '../../shared/local-media'

const MARKDOWN_IMAGE_PATTERN = /!\[[^\]]*]\((?<src><[^>]+>|[^)\s]+)(?<suffix>[^)]*)\)/g
const LOCAL_PATH_START_PATTERN = /^(?:\/|\.{1,2}\/|[A-Za-z]:[\\/])/
const IMAGE_FILE_PATH_PATTERN = /\.(?:png|jpe?g|gif|webp|bmp|svg|avif)(?:[?#][^)]*)?$/i
const WINDOWS_ABSOLUTE_PATH_PATTERN = /^[a-zA-Z]:[\\/]/

export function resolveMarkdownImageSrc(src: string, markdownFilePath: string | null): string {
  const trimmed = src.trim()
  if (!trimmed || trimmed.startsWith('#') || isLocalMediaUrl(trimmed)) return src

  if (trimmed.toLowerCase().startsWith('file:')) {
    const absolutePath = fileUrlToAbsolutePath(trimmed)
    return absolutePath ? absolutePathToLocalMediaUrl(absolutePath) : src
  }

  if (/^(?:https?:|data:|blob:)/i.test(trimmed)) return src

  if (isAbsoluteLocalPath(trimmed)) {
    return absolutePathToLocalMediaUrl(trimmed)
  }

  if (!markdownFilePath) return src

  return absolutePathToLocalMediaUrl(joinLocalPath(dirname(markdownFilePath), trimmed))
}

export function normalizeMarkdownImageDestinations(markdown: string): string {
  return markdown.replace(MARKDOWN_IMAGE_PATTERN, (match, rawSrc: string, suffix = '') => {
    if (!suffix) return match
    if (rawSrc.startsWith('<') && rawSrc.endsWith('>')) return match

    const destination = `${rawSrc}${suffix}`.trimEnd()
    if (!LOCAL_PATH_START_PATTERN.test(destination)) return match
    if (!IMAGE_FILE_PATH_PATTERN.test(destination)) return match

    return match.replace(rawSrc + suffix, `<${destination}>`)
  })
}

function isAbsoluteLocalPath(path: string): boolean {
  return path.startsWith('/') || WINDOWS_ABSOLUTE_PATH_PATTERN.test(path)
}

function dirname(filePath: string): string {
  const normalized = filePath.replaceAll('\\', '/')
  const lastSlash = normalized.lastIndexOf('/')
  if (lastSlash <= 0) return normalized.slice(0, Math.max(0, lastSlash))
  return normalized.slice(0, lastSlash)
}

function joinLocalPath(basePath: string, relativePath: string): string {
  const normalizedBase = basePath.replaceAll('\\', '/')
  const normalizedRelative = relativePath.replaceAll('\\', '/')
  const prefix = WINDOWS_ABSOLUTE_PATH_PATTERN.test(normalizedBase) ? '' : normalizedBase.startsWith('/') ? '/' : ''
  const rawSegments = `${normalizedBase}/${normalizedRelative}`.split('/')
  const segments: string[] = []

  for (const segment of rawSegments) {
    if (!segment || segment === '.') continue
    if (segment === '..') {
      segments.pop()
      continue
    }
    segments.push(segment)
  }

  return `${prefix}${segments.join('/')}`
}
