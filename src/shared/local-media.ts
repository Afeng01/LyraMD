export const LOCAL_MEDIA_PROTOCOL = 'lyramd-media'

const LOCAL_MEDIA_PROTOCOL_PREFIX = `${LOCAL_MEDIA_PROTOCOL}:`

export function isLocalMediaUrl(value: string): boolean {
  return value.trim().toLowerCase().startsWith(LOCAL_MEDIA_PROTOCOL_PREFIX)
}

export function absolutePathToLocalMediaUrl(absolutePath: string): string {
  const url = new URL(`${LOCAL_MEDIA_PROTOCOL}://local`)
  url.searchParams.set('path', absolutePath)
  return url.toString()
}

export function localMediaUrlToAbsolutePath(value: string): string | null {
  if (!isLocalMediaUrl(value)) return null

  try {
    const url = new URL(value)
    const absolutePath = url.searchParams.get('path')
    return absolutePath && absolutePath.trim().length > 0 ? absolutePath : null
  } catch {
    return null
  }
}

export function fileUrlToAbsolutePath(fileUrl: string): string | null {
  if (!fileUrl.trim().toLowerCase().startsWith('file:')) return null

  try {
    const url = new URL(fileUrl)
    let pathname = decodeURIComponent(url.pathname)
    if (/^\/[A-Za-z]:/.test(pathname)) {
      pathname = pathname.slice(1)
    }
    return pathname
  } catch {
    return null
  }
}
