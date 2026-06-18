const LYRA_IMAGE_TITLE_PREFIX = 'lyra-image:'

export interface DecodedImageTitleMetadata {
  displayTitle: string
  width: number | null
}

interface ImageTitlePayload {
  title?: unknown
  width?: unknown
}

export function decodeImageTitleMetadata(rawTitle: string): DecodedImageTitleMetadata {
  if (!rawTitle.startsWith(LYRA_IMAGE_TITLE_PREFIX)) {
    return {
      displayTitle: rawTitle,
      width: null,
    }
  }

  try {
    const payload = JSON.parse(rawTitle.slice(LYRA_IMAGE_TITLE_PREFIX.length)) as ImageTitlePayload
    const displayTitle = typeof payload.title === 'string' ? payload.title : ''
    const width = normalizeImageWidth(payload.width)
    return {
      displayTitle,
      width,
    }
  } catch {
    return {
      displayTitle: rawTitle,
      width: null,
    }
  }
}

export function encodeImageTitleMetadata(displayTitle: string, width: number | null): string {
  const normalizedTitle = displayTitle.trim()
  const normalizedWidth = normalizeImageWidth(width)
  if (normalizedWidth === null) return normalizedTitle

  return `${LYRA_IMAGE_TITLE_PREFIX}${JSON.stringify({
    title: normalizedTitle || undefined,
    width: normalizedWidth,
  })}`
}

function normalizeImageWidth(width: unknown): number | null {
  if (typeof width !== 'number' || !Number.isFinite(width)) return null
  const normalized = Math.round(width)
  return normalized >= 120 ? normalized : null
}
