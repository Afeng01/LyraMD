export interface SearchMemoryState {
  [documentKey: string]: string
}

export interface SearchRangeLike {
  index: number
  from: number
  to: number
}

export function rememberQueryForDocument(
  state: SearchMemoryState,
  documentKey: string | null,
  query: string,
): SearchMemoryState {
  if (!documentKey) return state

  const normalizedQuery = query.trim()
  if (!normalizedQuery) {
    const { [documentKey]: _removed, ...rest } = state
    return rest
  }

  return {
    ...state,
    [documentKey]: normalizedQuery,
  }
}

export function resolveRememberedQuery(
  state: SearchMemoryState,
  documentKey: string | null,
): string {
  if (!documentKey) return ''
  return state[documentKey] ?? ''
}

export function resolveSearchCount(
  query: string,
  totalMatches: number,
  activeIndex: number,
): { activeNumber: number; totalMatches: number } {
  if (!query.trim()) {
    return {
      activeNumber: 0,
      totalMatches: 0,
    }
  }

  return {
    activeNumber: totalMatches > 0 && activeIndex >= 0 ? activeIndex + 1 : 0,
    totalMatches,
  }
}

export function resolveActiveMatchAfterRefresh(
  previousFrom: number,
  nextMatches: SearchRangeLike[],
): number {
  if (nextMatches.length === 0) return -1

  const successor = nextMatches.find((match) => match.from >= previousFrom)
  if (successor) return successor.index

  return nextMatches[nextMatches.length - 1]?.index ?? -1
}
