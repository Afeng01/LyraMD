import { basename, dirname, extname, join } from 'path'

import type { TitleSyncMode } from './settings'

export interface TitleSyncDecisionInput {
  mode: TitleSyncMode
  filePath: string | null
  previousTitle: string
  nextTitle: string
}

export interface TitleSyncDecision {
  shouldRename: boolean
  nextPath: string | null
}

export function sanitizeTitleToFileStem(title: string): string {
  return title.trim().replace(/[/\\:*?"<>|]/g, '').slice(0, 60)
}

export function decideTitleSync({
  mode,
  filePath,
  previousTitle,
  nextTitle,
}: TitleSyncDecisionInput): TitleSyncDecision {
  if (!filePath) {
    return { shouldRename: false, nextPath: null }
  }

  const sanitizedStem = sanitizeTitleToFileStem(nextTitle)
  if (!sanitizedStem) {
    return { shouldRename: false, nextPath: null }
  }

  if (previousTitle === nextTitle) {
    return { shouldRename: false, nextPath: null }
  }

  if (mode === 'never' || mode === 'ask') {
    return { shouldRename: false, nextPath: null }
  }

  const currentBaseName = basename(filePath, extname(filePath))
  if (currentBaseName === sanitizedStem) {
    return { shouldRename: false, nextPath: null }
  }

  return {
    shouldRename: true,
    nextPath: join(dirname(filePath), `${sanitizedStem}${extname(filePath) || '.md'}`),
  }
}

export function buildTitleSyncPath(filePath: string, nextTitle: string): string | null {
  const sanitizedStem = sanitizeTitleToFileStem(nextTitle)
  if (!sanitizedStem) return null
  return join(dirname(filePath), `${sanitizedStem}${extname(filePath) || '.md'}`)
}
