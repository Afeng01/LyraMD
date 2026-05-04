import { describe, expect, it, vi } from 'vitest'

import { runSaveAsMigration, shouldPromptForFormalSave, shouldRemoveSourceAfterSaveAs } from './save-as'

describe('shouldPromptForFormalSave', () => {
  it('prompts for a formal location for blank documents and drafts', () => {
    expect(shouldPromptForFormalSave('blank')).toBe(true)
    expect(shouldPromptForFormalSave('draft')).toBe(true)
  })

  it('does not prompt for formal save for an existing regular file', () => {
    expect(shouldPromptForFormalSave('file')).toBe(false)
  })
})

describe('shouldRemoveSourceAfterSaveAs', () => {
  it('keeps the original file for switch-style save as', () => {
    expect(shouldRemoveSourceAfterSaveAs({
      documentKind: 'file',
      currentPath: '/docs/original.md',
      nextPath: '/docs/renamed.md',
      saveAsMode: 'switch',
    })).toBe(false)
  })

  it('removes the original file for move-style save as', () => {
    expect(shouldRemoveSourceAfterSaveAs({
      documentKind: 'file',
      currentPath: '/docs/original.md',
      nextPath: '/docs/renamed.md',
      saveAsMode: 'move',
    })).toBe(true)
  })

  it('always removes the draft source when promoting a draft to a file', () => {
    expect(shouldRemoveSourceAfterSaveAs({
      documentKind: 'draft',
      currentPath: '/drafts/draft.md',
      nextPath: '/docs/final.md',
      saveAsMode: 'switch',
    })).toBe(true)
  })

  it('never removes the source when the path does not change', () => {
    expect(shouldRemoveSourceAfterSaveAs({
      documentKind: 'file',
      currentPath: '/docs/original.md',
      nextPath: '/docs/original.md',
      saveAsMode: 'move',
    })).toBe(false)
  })
})

describe('runSaveAsMigration', () => {
  it('saves the target and keeps the source in switch mode', async () => {
    const callOrder: string[] = []
    const saveTarget = vi.fn(async () => {
      callOrder.push('save')
    })
    const removeSource = vi.fn(async () => {
      callOrder.push('remove')
    })

    const result = await runSaveAsMigration({
      mode: 'switch',
      sourcePath: '/tmp/original.md',
      targetPath: '/tmp/copied.md',
      saveTarget,
      removeSource,
    })

    expect(result).toEqual({
      ok: true,
      sourcePath: '/tmp/original.md',
      targetPath: '/tmp/copied.md',
      sourceRemoved: false,
      sourceRemovalFailed: false,
    })
    expect(callOrder).toEqual(['save'])
    expect(removeSource).not.toHaveBeenCalled()
  })

  it('only removes the source after the target save succeeds in move mode', async () => {
    const callOrder: string[] = []
    const saveTarget = vi.fn(async () => {
      callOrder.push('save')
    })
    const removeSource = vi.fn(async () => {
      callOrder.push('remove')
    })

    const result = await runSaveAsMigration({
      mode: 'move',
      sourcePath: '/tmp/original.md',
      targetPath: '/tmp/moved.md',
      saveTarget,
      removeSource,
    })

    expect(result).toEqual({
      ok: true,
      sourcePath: '/tmp/original.md',
      targetPath: '/tmp/moved.md',
      sourceRemoved: true,
      sourceRemovalFailed: false,
    })
    expect(callOrder).toEqual(['save', 'remove'])
  })

  it('never removes the source when saving back to the same path', async () => {
    const saveTarget = vi.fn(async () => {})
    const removeSource = vi.fn(async () => {})

    const result = await runSaveAsMigration({
      mode: 'move',
      sourcePath: '/tmp/original.md',
      targetPath: '/tmp/original.md',
      saveTarget,
      removeSource,
    })

    expect(result.sourceRemoved).toBe(false)
    expect(result.sourceRemovalFailed).toBe(false)
    expect(removeSource).not.toHaveBeenCalled()
  })

  it('keeps the new target when source cleanup fails after a successful move save', async () => {
    const saveTarget = vi.fn(async () => {})
    const removeSource = vi.fn(async () => {
      throw new Error('trash failed')
    })

    const result = await runSaveAsMigration({
      mode: 'move',
      sourcePath: '/tmp/original.md',
      targetPath: '/tmp/moved.md',
      saveTarget,
      removeSource,
    })

    expect(result).toEqual({
      ok: true,
      sourcePath: '/tmp/original.md',
      targetPath: '/tmp/moved.md',
      sourceRemoved: false,
      sourceRemovalFailed: true,
    })
  })

  it('does not attempt source cleanup when target save fails', async () => {
    const saveTarget = vi.fn(async () => {
      throw new Error('save failed')
    })
    const removeSource = vi.fn(async () => {})

    await expect(runSaveAsMigration({
      mode: 'move',
      sourcePath: '/tmp/original.md',
      targetPath: '/tmp/moved.md',
      saveTarget,
      removeSource,
    })).rejects.toThrow('save failed')

    expect(removeSource).not.toHaveBeenCalled()
  })
})
