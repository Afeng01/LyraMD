import { basename } from 'path'

export const MARKDOWN_EXTENSIONS_ARRAY = [
  'md',
  'markdown',
  'mdown',
  'mkd',
]

export const MANUAL_EDITABLE_EXTENSIONS_ARRAY = [
  ...MARKDOWN_EXTENSIONS_ARRAY,
  'json',
  'jsonc',
  'json5',
  'yaml',
  'yml',
  'toml',
  'env',
  'ini',
  'cfg',
  'txt',
]

export const MARKDOWN_EXTENSIONS = new Set(MARKDOWN_EXTENSIONS_ARRAY)
export const MANUAL_EDITABLE_EXTENSIONS = new Set(MANUAL_EDITABLE_EXTENSIONS_ARRAY)

export const EDITABLE_FILE_FILTERS = [
  { name: 'Markdown', extensions: MARKDOWN_EXTENSIONS_ARRAY },
  { name: 'JSON', extensions: ['json', 'jsonc', 'json5'] },
  { name: 'YAML / TOML / Config', extensions: ['yaml', 'yml', 'toml', 'env', 'ini', 'cfg'] },
  { name: 'Text', extensions: ['txt'] },
  { name: 'All Files', extensions: ['*'] },
]

function getExtensionToken(fileName: string): string | null {
  const baseName = basename(fileName)
  const dotIndex = baseName.lastIndexOf('.')
  if (dotIndex === -1) return null
  return baseName.slice(dotIndex + 1).toLowerCase() || null
}

export function isManualEditableFile(fileName: string): boolean {
  const extension = getExtensionToken(fileName)
  return extension ? MANUAL_EDITABLE_EXTENSIONS.has(extension) : false
}

export function isMarkdownFile(fileName: string): boolean {
  const extension = getExtensionToken(fileName)
  return extension ? MARKDOWN_EXTENSIONS.has(extension) : false
}
