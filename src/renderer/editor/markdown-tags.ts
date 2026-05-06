export type MarkdownTokenKind = 'tag' | 'wikilink' | 'yaml-tag'

export interface MarkdownTokenRange {
  from: number
  kind: MarkdownTokenKind
  text: string
  to: number
}

export interface CollectMarkdownTokenOptions {
  yamlListItem?: boolean
}

const OBSIDIAN_TAG_RE = /(^|[\s([{:>])(#(?![\s#])[\p{L}\p{N}_/-]+)(?=$|[\s)\]},.;:!?])/gu
const WIKILINK_RE = /\[\[([^\]\n]+)\]\]/g
const YAML_TAG_LINE_RE = /^\s*tags\s*:\s*(.+)$/iu
const YAML_TAG_VALUE_RE = /#?[\p{L}\p{N}_/-]+/gu
const YAML_TAG_LIST_ITEM_RE = /^#?[\p{L}\p{N}_/-]+$/u

function pushUniqueRange(ranges: MarkdownTokenRange[], range: MarkdownTokenRange): void {
  if (ranges.some((candidate) => candidate.from === range.from && candidate.to === range.to)) return
  ranges.push(range)
}

function collectYamlTagRanges(text: string): MarkdownTokenRange[] {
  const match = text.match(YAML_TAG_LINE_RE)
  if (!match || match.index === undefined) return []

  const value = match[1]
  const valueStart = text.indexOf(value, match.index)
  const ranges: MarkdownTokenRange[] = []
  let tagMatch: RegExpExecArray | null

  YAML_TAG_VALUE_RE.lastIndex = 0
  while ((tagMatch = YAML_TAG_VALUE_RE.exec(value)) !== null) {
    const token = tagMatch[0]
    if (!token || token.toLowerCase() === 'tags') continue
    const from = valueStart + tagMatch.index
    ranges.push({
      from,
      kind: 'yaml-tag',
      text: token.startsWith('#') ? token : `#${token}`,
      to: from + token.length,
    })
  }

  return ranges
}

function collectYamlTagListItemRanges(text: string): MarkdownTokenRange[] {
  const trimmed = text.trim()
  if (!trimmed || !YAML_TAG_LIST_ITEM_RE.test(trimmed)) return []

  const from = text.indexOf(trimmed)
  return [{
    from,
    kind: 'yaml-tag',
    text: trimmed.startsWith('#') ? trimmed : `#${trimmed}`,
    to: from + trimmed.length,
  }]
}

export function collectMarkdownTokenRanges(
  text: string,
  options: CollectMarkdownTokenOptions = {},
): MarkdownTokenRange[] {
  const ranges: MarkdownTokenRange[] = []

  for (const range of collectYamlTagRanges(text)) {
    pushUniqueRange(ranges, range)
  }

  if (options.yamlListItem) {
    for (const range of collectYamlTagListItemRanges(text)) {
      pushUniqueRange(ranges, range)
    }
  }

  let wikilinkMatch: RegExpExecArray | null
  WIKILINK_RE.lastIndex = 0
  while ((wikilinkMatch = WIKILINK_RE.exec(text)) !== null) {
    pushUniqueRange(ranges, {
      from: wikilinkMatch.index,
      kind: 'wikilink',
      text: wikilinkMatch[0],
      to: wikilinkMatch.index + wikilinkMatch[0].length,
    })
  }

  let tagMatch: RegExpExecArray | null
  OBSIDIAN_TAG_RE.lastIndex = 0
  while ((tagMatch = OBSIDIAN_TAG_RE.exec(text)) !== null) {
    const token = tagMatch[2]
    const tokenStart = tagMatch.index + tagMatch[1].length
    pushUniqueRange(ranges, {
      from: tokenStart,
      kind: 'tag',
      text: token,
      to: tokenStart + token.length,
    })
  }

  return ranges.sort((a, b) => a.from - b.from || a.to - b.to)
}
