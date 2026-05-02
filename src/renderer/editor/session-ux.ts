import type { DocumentKind } from '../../preload'

export interface AutosaveDecision {
  materializeDraftImmediately: boolean
  persistImmediately: boolean
}

export type SearchNavigationSource = 'input' | 'button' | 'editor'
export type SearchNavigationFocusMode = 'panel' | 'editor'
export interface CenteredViewportScrollTarget {
  currentScrollTop: number
  viewportHeight: number
  targetTop: number
  targetHeight: number
}

export function decideAutosaveBehavior(
  origin: 'user' | 'programmatic',
  documentKind: DocumentKind,
  content: string,
): AutosaveDecision {
  const hasMeaningfulContent = content.trim().length > 0

  if (origin === 'programmatic') {
    return {
      materializeDraftImmediately: false,
      persistImmediately: false,
    }
  }

  if (documentKind === 'draft') {
    return {
      materializeDraftImmediately: false,
      persistImmediately: true,
    }
  }

  if (!hasMeaningfulContent) {
    if (documentKind === 'file') {
      return {
        materializeDraftImmediately: false,
        persistImmediately: true,
      }
    }

    return {
      materializeDraftImmediately: false,
      persistImmediately: false,
    }
  }

  return {
    materializeDraftImmediately: documentKind === 'blank',
    persistImmediately: documentKind === 'file',
  }
}

export function getDocumentViewportKey(
  documentKind: DocumentKind,
  filePath: string | null,
  draftId: string | null,
): string | null {
  if (documentKind === 'draft' && draftId) return `draft:${draftId}`
  if ((documentKind === 'draft' || documentKind === 'file') && filePath) return `${documentKind}:${filePath}`
  return null
}

export function shouldShowEmptyEditorPlaceholder(content: string): boolean {
  return content.trim().length === 0
}

export function resolveSearchNavigationFocusMode(
  source: SearchNavigationSource,
  withModifier: boolean,
): SearchNavigationFocusMode {
  if (source === 'editor') return 'editor'
  return 'panel'
}

export function resolveCenteredViewportScrollTop(
  target: CenteredViewportScrollTarget,
): number {
  const centeredTop = target.currentScrollTop + target.targetTop - ((target.viewportHeight - target.targetHeight) / 2)
  return Math.max(0, Math.round(centeredTop))
}
