import { describe, expect, it } from 'vitest'

import {
  decodeImageTitleMetadata,
  encodeImageTitleMetadata,
} from './image-title-metadata'

describe('image title metadata', () => {
  it('round-trips display title and stored width', () => {
    const encoded = encodeImageTitleMetadata('封面图', 486)
    expect(decodeImageTitleMetadata(encoded)).toEqual({
      displayTitle: '封面图',
      width: 486,
    })
  })

  it('leaves legacy titles untouched when no width metadata is present', () => {
    expect(decodeImageTitleMetadata('plain title')).toEqual({
      displayTitle: 'plain title',
      width: null,
    })
    expect(encodeImageTitleMetadata('plain title', null)).toBe('plain title')
  })
})
