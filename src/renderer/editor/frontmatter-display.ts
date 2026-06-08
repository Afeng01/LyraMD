export type FrontmatterRenderedNode = {
  tagName: string
  textContent: string | null
}

export function normalizeFrontmatterRenderedText(text: string): string {
  return text
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => line.trim().replace(/^-\s+/, '').replace(/\\+$/g, '').trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function isFrontmatterDelimiterNode(node: FrontmatterRenderedNode): boolean {
  const tag = node.tagName.toLowerCase()
  const text = normalizeFrontmatterRenderedText(node.textContent ?? '')
  return tag === 'hr' || text === '---'
}

function matchesFrontmatterMetadata(
  text: string,
  normalizedMetadata: string,
  normalizedLines: string[],
): boolean {
  if (!text) return false
  if (text.includes(':') && (normalizedMetadata.includes(text) || text.includes(normalizedMetadata))) {
    return true
  }
  return normalizedLines.some((line) => text.includes(line))
}

export function collectFrontmatterSourceIndexes(
  metadata: string,
  nodes: FrontmatterRenderedNode[],
): number[] {
  const normalizedMetadata = normalizeFrontmatterRenderedText(metadata)
  if (!normalizedMetadata) return []

  const normalizedLines = metadata
    .split(/\r?\n/)
    .map(normalizeFrontmatterRenderedText)
    .filter(Boolean)

  const indexes: number[] = []
  let sawOpeningDelimiter = false
  let sawMetadata = false

  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index]
    if (isFrontmatterDelimiterNode(node)) {
      if (!sawOpeningDelimiter) {
        sawOpeningDelimiter = true
        indexes.push(index)
        continue
      }
      if (sawMetadata) indexes.push(index)
      break
    }

    const text = normalizeFrontmatterRenderedText(node.textContent ?? '')
    if (!text) {
      if (sawOpeningDelimiter && !sawMetadata) indexes.push(index)
      continue
    }

    if (matchesFrontmatterMetadata(text, normalizedMetadata, normalizedLines)) {
      sawMetadata = true
      indexes.push(index)
      continue
    }

    break
  }

  return sawMetadata ? indexes : []
}
