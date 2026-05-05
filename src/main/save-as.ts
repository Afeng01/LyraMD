import type { SaveAsMode } from './settings'

export interface SaveAsSourceCleanupInput {
  documentKind: 'blank' | 'draft' | 'file'
  currentPath: string | null
  nextPath: string
  saveAsMode: SaveAsMode
}

export function shouldPromptForFormalSave(documentKind: SaveAsSourceCleanupInput['documentKind']): boolean {
  return documentKind !== 'file'
}

export function shouldRemoveSourceAfterSaveAs({
  documentKind,
  currentPath,
  nextPath,
  saveAsMode,
}: SaveAsSourceCleanupInput): boolean {
  if (!currentPath || currentPath === nextPath) return false
  if (documentKind === 'draft') return true
  if (documentKind !== 'file') return false
  return saveAsMode === 'move'
}

export interface SaveAsMigrationResult {
  ok: true
  sourcePath: string | null
  targetPath: string
  sourceRemoved: boolean
  sourceRemovalFailed: boolean
}

export interface RunSaveAsMigrationInput {
  mode: SaveAsMode
  sourcePath: string | null
  targetPath: string
  saveTarget: () => Promise<void>
  removeSource: () => Promise<void>
}

export async function runSaveAsMigration({
  mode,
  sourcePath,
  targetPath,
  saveTarget,
  removeSource,
}: RunSaveAsMigrationInput): Promise<SaveAsMigrationResult> {
  await saveTarget()

  const shouldRemoveSource = mode === 'move'
    && !!sourcePath
    && sourcePath !== targetPath

  if (!shouldRemoveSource) {
    return {
      ok: true,
      sourcePath,
      targetPath,
      sourceRemoved: false,
      sourceRemovalFailed: false,
    }
  }

  try {
    await removeSource()
    return {
      ok: true,
      sourcePath,
      targetPath,
      sourceRemoved: true,
      sourceRemovalFailed: false,
    }
  } catch {
    return {
      ok: true,
      sourcePath,
      targetPath,
      sourceRemoved: false,
      sourceRemovalFailed: true,
    }
  }
}
