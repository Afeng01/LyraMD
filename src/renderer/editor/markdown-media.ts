const PASSTHROUGH_SRC_PATTERN = /^(?:https?:|data:|blob:|file:)/i
const WINDOWS_ABSOLUTE_PATH_PATTERN = /^[a-zA-Z]:[\\/]/

export function resolveMarkdownImageSrc(src: string, markdownFilePath: string | null): string {
  const trimmed = src.trim()
  if (!trimmed || PASSTHROUGH_SRC_PATTERN.test(trimmed) || trimmed.startsWith('#')) return src

  if (isAbsoluteLocalPath(trimmed)) {
    return localPathToFileUrl(trimmed)
  }

  if (!markdownFilePath) return src

  return localPathToFileUrl(joinLocalPath(dirname(markdownFilePath), trimmed))
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

function localPathToFileUrl(path: string): string {
  const normalized = path.replaceAll('\\', '/')
  const absolutePath = WINDOWS_ABSOLUTE_PATH_PATTERN.test(normalized)
    ? `/${normalized}`
    : normalized
  const encodedPath = absolutePath
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/')
    .replace('%3A', ':')

  return `file://${encodedPath.startsWith('/') ? '' : '/'}${encodedPath}`
}
