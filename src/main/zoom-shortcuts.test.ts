import { describe, expect, it } from 'vitest'

import { resolveZoomShortcut } from './zoom-shortcuts'

describe('resolveZoomShortcut', () => {
  it('maps primary zoom shortcuts to editor-only zoom actions', () => {
    expect(resolveZoomShortcut({ control: true, meta: false, shift: false, key: '=' })).toEqual({ kind: 'zoom-in' })
    expect(resolveZoomShortcut({ control: true, meta: false, shift: true, key: '+' })).toEqual({ kind: 'zoom-in' })
    expect(resolveZoomShortcut({ control: true, meta: false, shift: false, key: '-' })).toEqual({ kind: 'zoom-out' })
    expect(resolveZoomShortcut({ control: false, meta: true, shift: false, key: '0' })).toEqual({ kind: 'zoom-reset' })
  })

  it('ignores non-primary key presses', () => {
    expect(resolveZoomShortcut({ control: false, meta: false, shift: false, key: '=' })).toEqual({ kind: 'none' })
    expect(resolveZoomShortcut({ control: false, meta: false, shift: false, key: '0' })).toEqual({ kind: 'none' })
  })
})
