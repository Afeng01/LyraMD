export interface OutlineItem {
  id: string
  level: 1 | 2
  title: string
  pos: number
}

export function normalizeHeadingText(text: string): string {
  const normalized = text.replace(/\s+/g, ' ').trim()
  return normalized || '未命名标题'
}

export function shouldIncludeHeadingLevel(level: number): level is 1 | 2 {
  return level === 1 || level === 2
}

export function createOutlineId(pos: number, index: number): string {
  return `outline-${pos}-${index}`
}
