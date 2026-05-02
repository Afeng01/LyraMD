import { describe, expect, it } from 'vitest'

import {
  decideAutosaveBehavior,
  getDocumentViewportKey,
  resolveCenteredViewportScrollTop,
  resolveSearchNavigationFocusMode,
  shouldShowEmptyEditorPlaceholder,
} from './session-ux'

describe('decideAutosaveBehavior', () => {
  it('materializes a blank document immediately on the first real user edit', () => {
    expect(decideAutosaveBehavior('user', 'blank', 'Hello')).toEqual({
      clearPending: false,
      materializeDraftImmediately: true,
      persistImmediately: false,
      scheduleDebouncedSave: false,
    })
  })

  it('does not autosave blank whitespace-only user input', () => {
    expect(decideAutosaveBehavior('user', 'blank', ' \n\t')).toEqual({
      clearPending: false,
      materializeDraftImmediately: false,
      persistImmediately: false,
      scheduleDebouncedSave: false,
    })
  })

  it('still persists clearing an existing file immediately', () => {
    expect(decideAutosaveBehavior('user', 'file', ' \n\t')).toEqual({
      clearPending: false,
      materializeDraftImmediately: false,
      persistImmediately: true,
      scheduleDebouncedSave: false,
    })
  })

  it('clears pending autosave state on programmatic updates', () => {
    expect(decideAutosaveBehavior('programmatic', 'file', 'Incoming update')).toEqual({
      clearPending: true,
      materializeDraftImmediately: false,
      persistImmediately: false,
      scheduleDebouncedSave: false,
    })
  })

  it('persists regular file edits immediately', () => {
    expect(decideAutosaveBehavior('user', 'file', 'Updated text')).toEqual({
      clearPending: false,
      materializeDraftImmediately: false,
      persistImmediately: true,
      scheduleDebouncedSave: false,
    })
  })

  it('persists draft edits immediately instead of waiting for debounce', () => {
    expect(decideAutosaveBehavior('user', 'draft', 'Updated draft text')).toEqual({
      clearPending: false,
      materializeDraftImmediately: false,
      persistImmediately: true,
      scheduleDebouncedSave: false,
    })
  })

  it('still persists clearing a draft immediately so switching never loses the latest state', () => {
    expect(decideAutosaveBehavior('user', 'draft', ' \n\t')).toEqual({
      clearPending: false,
      materializeDraftImmediately: false,
      persistImmediately: true,
      scheduleDebouncedSave: false,
    })
  })
})

describe('getDocumentViewportKey', () => {
  it('prefers a draft id for drafts', () => {
    expect(getDocumentViewportKey('draft', '/tmp/draft.md', 'draft-1')).toBe('draft:draft-1')
  })

  it('falls back to file path for regular files', () => {
    expect(getDocumentViewportKey('file', '/tmp/file.md', null)).toBe('file:/tmp/file.md')
  })

  it('returns null for blank documents', () => {
    expect(getDocumentViewportKey('blank', null, null)).toBeNull()
  })
})

describe('shouldShowEmptyEditorPlaceholder', () => {
  it('shows the placeholder only for effectively empty content', () => {
    expect(shouldShowEmptyEditorPlaceholder('')).toBe(true)
    expect(shouldShowEmptyEditorPlaceholder(' \n')).toBe(true)
    expect(shouldShowEmptyEditorPlaceholder('# Title')).toBe(false)
  })
})

describe('resolveSearchNavigationFocusMode', () => {
  it('keeps focus in the panel for search input and button navigation', () => {
    expect(resolveSearchNavigationFocusMode('input', true)).toBe('panel')
    expect(resolveSearchNavigationFocusMode('input', false)).toBe('panel')
    expect(resolveSearchNavigationFocusMode('button', false)).toBe('panel')
    expect(resolveSearchNavigationFocusMode('editor', false)).toBe('editor')
  })
})

describe('resolveCenteredViewportScrollTop', () => {
  it('centers the target block using its current viewport offset when possible', () => {
    expect(resolveCenteredViewportScrollTop({
      currentScrollTop: 120,
      viewportHeight: 400,
      targetTop: 520,
      targetHeight: 40,
    })).toBe(460)
  })

  it('clamps negative centered offsets back to the top of the document', () => {
    expect(resolveCenteredViewportScrollTop({
      currentScrollTop: 40,
      viewportHeight: 400,
      targetTop: 80,
      targetHeight: 40,
    })).toBe(0)
  })
})
