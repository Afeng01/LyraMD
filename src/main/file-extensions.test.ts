import { describe, expect, it } from 'vitest'

import {
  EDITABLE_FILE_FILTERS,
  MANUAL_EDITABLE_EXTENSIONS_ARRAY,
  MARKDOWN_EXTENSIONS_ARRAY,
  isManualEditableFile,
  isMarkdownFile,
} from './file-extensions'

describe('file-extensions', () => {
  it('recognizes manually editable files case-insensitively without widening into code formats', () => {
    expect(isManualEditableFile('note.md')).toBe(true)
    expect(isManualEditableFile('settings.JSONC')).toBe(true)
    expect(isManualEditableFile('/repo/.env')).toBe(true)
    expect(isManualEditableFile('notes.txt')).toBe(true)
    expect(isManualEditableFile('component.tsx')).toBe(false)
    expect(isManualEditableFile('index.html')).toBe(false)
    expect(isManualEditableFile('archive.tar.gz')).toBe(false)
    expect(isManualEditableFile('README')).toBe(false)
  })

  it('keeps workdir support markdown-only', () => {
    expect(isMarkdownFile('note.md')).toBe(true)
    expect(isMarkdownFile('draft.markdown')).toBe(true)
    expect(isMarkdownFile('settings.yaml')).toBe(false)
    expect(isMarkdownFile('notes.txt')).toBe(false)
    expect(isMarkdownFile('/repo/.env')).toBe(false)
  })

  it('keeps dialog filters aligned with manual editable extensions', () => {
    const filterExtensions = EDITABLE_FILE_FILTERS
      .flatMap(filter => filter.extensions)
      .filter(extension => extension !== '*')
      .sort()

    expect(filterExtensions).toEqual([...MANUAL_EDITABLE_EXTENSIONS_ARRAY].sort())
  })

  it('keeps markdown extensions as a strict subset of manual editable extensions', () => {
    expect(MARKDOWN_EXTENSIONS_ARRAY.every((extension) => (
      MANUAL_EDITABLE_EXTENSIONS_ARRAY.includes(extension)
    ))).toBe(true)
  })
})
