export type SearchScope = 'current-file'

export interface SearchMatch {
  index: number
  from: number
  to: number
}

export interface SearchMatchPreview extends SearchMatch {
  previousLine: string
  before: string
  match: string
  after: string
  nextLine: string
}

export interface SearchState {
  scope: SearchScope
  query: string
  normalizedQuery: string
  sourceText: string
  matches: SearchMatchPreview[]
  activeIndex: number
  totalMatches: number
}

export type SearchPanelPreview =
  | {
    status: 'idle' | 'empty' | 'fallback'
    previousLine: string
    currentLine: string
    nextLine: string
  }
  | {
    status: 'ready'
    previousLine: string
    currentLineBefore: string
    currentLineMatch: string
    currentLineAfter: string
    nextLine: string
  }

export interface SearchOptions {
  caseSensitive?: boolean
  previousActiveIndex?: number
  scope?: SearchScope
}

export function normalizeSearchQuery(query: string): string {
  return query.replace(/\s*\n+\s*/g, ' ').replace(/\s+/g, ' ').trim()
}

export function findCurrentFileMatches(
  text: string,
  query: string,
  options: SearchOptions = {},
): SearchMatch[] {
  const normalizedQuery = normalizeSearchQuery(query)
  if (!normalizedQuery) return []

  const caseSensitive = options.caseSensitive ?? false
  const haystack = caseSensitive ? text : text.toLocaleLowerCase()
  const needle = caseSensitive ? normalizedQuery : normalizedQuery.toLocaleLowerCase()
  const matches: SearchMatch[] = []

  let cursor = 0
  while (cursor <= haystack.length - needle.length) {
    const matchAt = haystack.indexOf(needle, cursor)
    if (matchAt < 0) break

    matches.push({
      index: matches.length,
      from: matchAt,
      to: matchAt + needle.length,
    })
    cursor = matchAt + needle.length
  }

  return matches
}

export function buildSearchMatchPreview(
  text: string,
  match: SearchMatch,
): SearchMatchPreview {
  const currentLineStart = findLineStart(text, match.from)
  const currentLineEnd = findLineEnd(text, match.to)
  const previousLineStart = currentLineStart > 0 ? findLineStart(text, currentLineStart - 1) : 0
  const previousLineEnd = currentLineStart > 0 ? currentLineStart - 1 : 0
  const nextLineStart = currentLineEnd < text.length ? currentLineEnd + 1 : text.length
  const nextLineEnd = nextLineStart < text.length ? findLineEnd(text, nextLineStart) : text.length

  return {
    ...match,
    previousLine: formatPreviewLine(text.slice(previousLineStart, previousLineEnd)),
    before: formatPreviewLine(text.slice(currentLineStart, match.from)),
    match: text.slice(match.from, match.to),
    after: formatPreviewLine(text.slice(match.to, currentLineEnd)),
    nextLine: formatPreviewLine(text.slice(nextLineStart, nextLineEnd)),
  }
}

export function createSearchState(
  text: string,
  query: string,
  options: SearchOptions = {},
): SearchState {
  const matches = findCurrentFileMatches(text, query, options)
    .map((match) => buildSearchMatchPreview(text, match))

  return {
    scope: options.scope ?? 'current-file',
    query,
    normalizedQuery: normalizeSearchQuery(query),
    sourceText: text,
    matches,
    activeIndex: resolveActiveSearchMatchIndex(matches.length, options.previousActiveIndex),
    totalMatches: matches.length,
  }
}

export function getActiveSearchMatch(state: SearchState): SearchMatchPreview | null {
  if (state.activeIndex < 0 || state.activeIndex >= state.matches.length) return null
  return state.matches[state.activeIndex] ?? null
}

export function setActiveSearchMatchIndex(
  state: SearchState,
  nextIndex: number,
): SearchState {
  return {
    ...state,
    activeIndex: resolveActiveSearchMatchIndex(state.totalMatches, nextIndex),
  }
}

export function getNextSearchMatchIndex(state: Pick<SearchState, 'activeIndex' | 'totalMatches'>): number {
  if (state.totalMatches <= 0) return -1
  if (state.activeIndex < 0) return 0
  return (state.activeIndex + 1) % state.totalMatches
}

export function getPreviousSearchMatchIndex(state: Pick<SearchState, 'activeIndex' | 'totalMatches'>): number {
  if (state.totalMatches <= 0) return -1
  if (state.activeIndex < 0) return 0
  return (state.activeIndex - 1 + state.totalMatches) % state.totalMatches
}

export function resolveActiveSearchMatchIndex(
  totalMatches: number,
  preferredIndex?: number,
): number {
  if (totalMatches <= 0) return -1
  if (preferredIndex == null || !Number.isInteger(preferredIndex)) return 0
  if (preferredIndex < 0 || preferredIndex >= totalMatches) return 0
  return preferredIndex
}

function findLineStart(text: string, offset: number): number {
  const lineBreak = text.lastIndexOf('\n', Math.max(0, offset - 1))
  return lineBreak === -1 ? 0 : lineBreak + 1
}

function findLineEnd(text: string, offset: number): number {
  const lineBreak = text.indexOf('\n', offset)
  return lineBreak === -1 ? text.length : lineBreak
}

function formatPreviewLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

export function getNearbySearchMatchPreviews(
  state: SearchState,
  radius = 1,
): SearchMatchPreview[] {
  if (state.matches.length === 0 || state.activeIndex < 0) return []

  const start = Math.max(0, state.activeIndex - radius)
  const end = Math.min(state.matches.length, state.activeIndex + radius + 1)
  return state.matches.slice(start, end)
}

export function resolveSearchPanelPreview(state: SearchState): SearchPanelPreview {
  if (!state.normalizedQuery) {
    return {
      status: 'idle',
      previousLine: '',
      currentLine: '输入关键词开始搜索',
      nextLine: '',
    }
  }

  const activeMatch = getActiveSearchMatch(state)
  if (!activeMatch) {
    return {
      status: 'empty',
      previousLine: '',
      currentLine: '未找到匹配内容',
      nextLine: '',
    }
  }

  return {
    status: 'ready',
    previousLine: activeMatch.previousLine,
    currentLineBefore: activeMatch.before,
    currentLineMatch: activeMatch.match,
    currentLineAfter: activeMatch.after,
    nextLine: activeMatch.nextLine,
  }
}
