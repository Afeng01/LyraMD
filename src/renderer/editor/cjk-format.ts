const CJK_PATTERN = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/
const FENCE_PATTERN = /^\s*(```|~~~)/
const FULL_WIDTH_ALNUM_START = 0xff01
const FULL_WIDTH_ALNUM_END = 0xff5e
const FULL_WIDTH_OFFSET = 0xfee0

export function formatCjkTypography(markdown: string): string {
  const lines = markdown.replaceAll('\r\n', '\n').split('\n')
  const formattedLines: string[] = []
  let inFence = false
  let blankCount = 0

  for (const line of lines) {
    if (FENCE_PATTERN.test(line)) {
      formattedLines.push(line)
      inFence = !inFence
      blankCount = 0
      continue
    }

    if (inFence) {
      formattedLines.push(line)
      continue
    }

    const formattedLine = formatCjkLine(line)
    if (formattedLine.trim().length === 0) {
      blankCount += 1
      if (blankCount <= 1) formattedLines.push('')
      continue
    }

    blankCount = 0
    formattedLines.push(formattedLine)
  }

  return trimTrailingBlankLines(formattedLines, inFence).join('\n')
}

function formatCjkLine(line: string): string {
  return addCjkLatinSpacing(normalizeFullWidthAlnum(line).trimEnd())
}

function normalizeFullWidthAlnum(text: string): string {
  return Array.from(text, (char) => {
    const codePoint = char.codePointAt(0)
    if (codePoint === undefined) return char
    if (codePoint === 0x3000) return ' '
    if (codePoint < FULL_WIDTH_ALNUM_START || codePoint > FULL_WIDTH_ALNUM_END) return char

    const normalized = String.fromCodePoint(codePoint - FULL_WIDTH_OFFSET)
    return /[A-Za-z0-9]/.test(normalized) ? normalized : char
  }).join('')
}

function addCjkLatinSpacing(text: string): string {
  let nextText = ''

  for (const char of text) {
    const previous = nextText.at(-1) ?? ''
    if (previous && shouldSeparate(previous, char)) {
      nextText += ' '
    }
    nextText += char
  }

  return nextText
}

function shouldSeparate(left: string, right: string): boolean {
  if (left === ' ' || right === ' ') return false
  return (isCjk(left) && isLatinOrDigit(right)) || (isLatinOrDigit(left) && isCjk(right))
}

function isCjk(char: string): boolean {
  return CJK_PATTERN.test(char)
}

function isLatinOrDigit(char: string): boolean {
  return /[A-Za-z0-9]/.test(char)
}

function trimTrailingBlankLines(lines: string[], preserveTrailingWhitespace: boolean): string[] {
  if (preserveTrailingWhitespace) return lines

  let endIndex = lines.length
  while (endIndex > 0 && lines[endIndex - 1].trim().length === 0) {
    endIndex -= 1
  }
  return lines.slice(0, endIndex)
}
