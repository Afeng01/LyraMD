export interface DocumentStats {
  characters: number
  lines: number
  words: number
}

const cjkPattern = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu
const latinWordPattern = /[\p{Script=Latin}\p{Number}]+(?:['’-][\p{Script=Latin}\p{Number}]+)*/gu

export function resolveDocumentStats(content: string): DocumentStats {
  const trimmed = content.trim()
  if (!trimmed) {
    return {
      characters: 0,
      lines: 0,
      words: 0,
    }
  }

  const statsSource = stripImagesForStats(trimmed)
  const cjkWords = Array.from(statsSource.matchAll(cjkPattern)).length
  const latinWords = Array.from(statsSource.matchAll(latinWordPattern)).length
  const characters = Array.from(statsSource.replace(/\s/gu, '')).length
  const lines = trimmed.split(/\r\n|\r|\n/).length

  return {
    characters,
    lines,
    words: cjkWords + latinWords,
  }
}

export function formatDocumentStats(stats: DocumentStats): string {
  return `${stats.words} 字 · ${stats.characters} 字符 · ${stats.lines} 行`
}

function stripImagesForStats(content: string): string {
  let output = ''
  let cursor = 0

  while (cursor < content.length) {
    const imageStart = content.indexOf('![', cursor)
    if (imageStart < 0) {
      output += stripHtmlImages(content.slice(cursor))
      break
    }

    output += stripHtmlImages(content.slice(cursor, imageStart))
    const imageToken = parseMarkdownImage(content, imageStart)
    if (!imageToken) {
      output += content.slice(imageStart, imageStart + 2)
      cursor = imageStart + 2
      continue
    }

    output += imageToken.alt
    cursor = imageToken.end
  }

  return output
}

function stripHtmlImages(content: string): string {
  return content.replace(/<img\b[^>]*>/giu, (tag) => {
    const altMatch = /\balt=(["'])(.*?)\1/iu.exec(tag)
    return altMatch?.[2] ?? ''
  })
}

function parseMarkdownImage(content: string, start: number): { alt: string; end: number } | null {
  if (!content.startsWith('![', start)) return null

  let altEnd = start + 2
  let escaping = false
  for (; altEnd < content.length; altEnd += 1) {
    const char = content[altEnd]
    if (escaping) {
      escaping = false
      continue
    }
    if (char === '\\') {
      escaping = true
      continue
    }
    if (char === ']') break
  }

  if (altEnd >= content.length || content[altEnd + 1] !== '(') return null

  let cursor = altEnd + 2
  let depth = 1
  let quote: '"' | "'" | null = null
  for (; cursor < content.length; cursor += 1) {
    const char = content[cursor]
    if (quote) {
      if (char === quote && content[cursor - 1] !== '\\') quote = null
      continue
    }
    if (char === '"' || char === '\'') {
      quote = char
      continue
    }
    if (char === '(') {
      depth += 1
      continue
    }
    if (char === ')') {
      depth -= 1
      if (depth === 0) {
        return {
          alt: content.slice(start + 2, altEnd),
          end: cursor + 1,
        }
      }
    }
  }

  return null
}
