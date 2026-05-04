import { describe, expect, it } from 'vitest'

import { moveFileToTrashAndVerify } from './file-removal'

describe('moveFileToTrashAndVerify', () => {
  it('reports success only when the file disappears from its original path', async () => {
    const result = await moveFileToTrashAndVerify('/workspace/a.md', {
      trashItem: async () => {},
      exists: () => false,
    })

    expect(result).toBe(true)
  })

  it('reports failure when trashItem resolves but the file still exists', async () => {
    const result = await moveFileToTrashAndVerify('/workspace/a.md', {
      trashItem: async () => {},
      exists: () => true,
    })

    expect(result).toBe(false)
  })

  it('reports failure when the trash operation throws', async () => {
    const result = await moveFileToTrashAndVerify('/workspace/a.md', {
      trashItem: async () => {
        throw new Error('trash failed')
      },
      exists: () => true,
    })

    expect(result).toBe(false)
  })
})
