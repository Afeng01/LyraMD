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

  const cjkWords = Array.from(trimmed.matchAll(cjkPattern)).length
  const latinWords = Array.from(trimmed.matchAll(latinWordPattern)).length
  const characters = Array.from(trimmed.replace(/\s/gu, '')).length
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
