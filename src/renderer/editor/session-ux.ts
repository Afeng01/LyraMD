import type { DocumentKind } from '../../preload'

export interface AutosaveDecision {
  clearPending: boolean
  materializeDraftImmediately: boolean
  persistImmediately: boolean
  scheduleDebouncedSave: boolean
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
      clearPending: true,
      materializeDraftImmediately: false,
      persistImmediately: false,
      scheduleDebouncedSave: false,
    }
  }

  if (documentKind === 'draft') {
    return {
      clearPending: false,
      materializeDraftImmediately: false,
      persistImmediately: true,
      scheduleDebouncedSave: false,
    }
  }

  if (!hasMeaningfulContent) {
    if (documentKind === 'file') {
      return {
        clearPending: false,
        materializeDraftImmediately: false,
        persistImmediately: true,
        scheduleDebouncedSave: false,
      }
    }

    return {
      clearPending: false,
      materializeDraftImmediately: false,
      persistImmediately: false,
      scheduleDebouncedSave: false,
    }
  }

  return {
    clearPending: false,
    materializeDraftImmediately: documentKind === 'blank',
    persistImmediately: documentKind === 'file',
    scheduleDebouncedSave: false,
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
