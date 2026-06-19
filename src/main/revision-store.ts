import { mkdir, readdir, readFile, rename, rm, writeFile } from 'fs/promises'
import { join } from 'path'

export type RevisionDocumentKind = 'draft' | 'file'
export type RevisionReason = 'autosave' | 'save' | 'save-as' | 'rename' | 'image-checkpoint' | 'crash' | 'restore'

export interface RevisionSnapshotInput {
  content: string
  displayTitle: string
  documentKind: RevisionDocumentKind
  draftId: string | null
  filePath: string | null
  reason: RevisionReason
  updatedAt: number
}

export interface StoredRevisionSnapshot extends RevisionSnapshotInput {
  documentKey: string
  id: string
}

export interface CrashRecoveryState {
  reason: string
  snapshot: StoredRevisionSnapshot
  status: 'crashed'
  updatedAt: number
}

const DEFAULT_MAX_REVISIONS_PER_DOCUMENT = 40
const AUTOSAVE_REVISION_INTERVAL_MS = 15000

export function createDocumentRevisionKey(snapshot: {
  documentKind: RevisionDocumentKind
  draftId: string | null
  filePath: string | null
}): string {
  if (snapshot.documentKind === 'draft' && snapshot.draftId) {
    return `draft-${encodeKeyPart(snapshot.draftId)}`
  }

  if (snapshot.filePath) {
    return `file-${encodeKeyPart(snapshot.filePath)}`
  }

  return `orphan-${snapshot.documentKind}`
}

export async function recordRevisionSnapshot(
  revisionsRootDir: string,
  snapshot: RevisionSnapshotInput,
  maxRevisionsPerDocument = DEFAULT_MAX_REVISIONS_PER_DOCUMENT,
): Promise<StoredRevisionSnapshot> {
  const documentKey = createDocumentRevisionKey(snapshot)
  const documentDir = join(revisionsRootDir, documentKey)
  await mkdir(documentDir, { recursive: true })

  const previous = await readLatestRevisionSnapshot(revisionsRootDir, documentKey)
  if (
    previous
    && previous.content === snapshot.content
    && previous.displayTitle === snapshot.displayTitle
    && previous.filePath === snapshot.filePath
    && previous.draftId === snapshot.draftId
  ) {
    return previous
  }

  if (
    previous
    && previous.reason === 'autosave'
    && snapshot.reason === 'autosave'
    && snapshot.updatedAt - previous.updatedAt < AUTOSAVE_REVISION_INTERVAL_MS
    && (
      snapshot.content.startsWith(previous.content)
      || previous.content.startsWith(snapshot.content)
    )
  ) {
    return previous
  }

  const storedSnapshot: StoredRevisionSnapshot = {
    ...snapshot,
    documentKey,
    id: `${snapshot.updatedAt}-${Math.random().toString(36).slice(2, 10)}`,
  }

  await writeFile(
    join(documentDir, buildRevisionFileName(storedSnapshot)),
    JSON.stringify(storedSnapshot, null, 2),
    'utf-8',
  )
  await pruneRevisionSnapshots(documentDir, maxRevisionsPerDocument)
  return storedSnapshot
}

export async function readLatestRevisionSnapshot(
  revisionsRootDir: string,
  documentKey: string,
): Promise<StoredRevisionSnapshot | null> {
  const latestFileName = await listRevisionFileNames(revisionsRootDir, documentKey).then((fileNames) => fileNames.at(-1))

  if (!latestFileName) return null

  const raw = await readFile(join(revisionsRootDir, documentKey, latestFileName), 'utf-8').catch(() => null)
  if (!raw) return null

  return parseStoredRevisionSnapshot(raw)
}

export async function listRevisionSnapshots(
  revisionsRootDir: string,
  documentKey: string,
  limit = 12,
): Promise<StoredRevisionSnapshot[]> {
  const fileNames = await listRevisionFileNames(revisionsRootDir, documentKey)
  const selectedFileNames = fileNames.slice(Math.max(0, fileNames.length - limit)).reverse()
  const snapshots = await Promise.all(selectedFileNames.map(async (fileName) => {
    const raw = await readFile(join(revisionsRootDir, documentKey, fileName), 'utf-8').catch(() => null)
    return raw ? parseStoredRevisionSnapshot(raw) : null
  }))

  return snapshots.filter((snapshot): snapshot is StoredRevisionSnapshot => snapshot !== null)
}

export async function readRevisionSnapshotById(
  revisionsRootDir: string,
  documentKey: string,
  revisionId: string,
): Promise<StoredRevisionSnapshot | null> {
  if (!revisionId.trim()) return null

  const snapshots = await listRevisionSnapshots(revisionsRootDir, documentKey, DEFAULT_MAX_REVISIONS_PER_DOCUMENT)
  return snapshots.find((snapshot) => snapshot.id === revisionId) ?? null
}

export async function moveDocumentRevisionSnapshots(
  revisionsRootDir: string,
  sourceDocumentKey: string,
  targetDocumentKey: string,
): Promise<void> {
  if (!sourceDocumentKey || !targetDocumentKey || sourceDocumentKey === targetDocumentKey) return

  const sourceDir = join(revisionsRootDir, sourceDocumentKey)
  const targetDir = join(revisionsRootDir, targetDocumentKey)
  const fileNames = await listRevisionFileNames(revisionsRootDir, sourceDocumentKey)
  if (fileNames.length === 0) return

  await mkdir(targetDir, { recursive: true })

  for (const fileName of fileNames) {
    await rename(join(sourceDir, fileName), join(targetDir, fileName))
  }

  await rm(sourceDir, { recursive: true, force: true })
}

export async function writeCrashRecoveryState(
  crashRecoveryStatePath: string,
  state: CrashRecoveryState,
): Promise<void> {
  await writeFile(crashRecoveryStatePath, JSON.stringify(state, null, 2), 'utf-8')
}

export async function readCrashRecoveryState(
  crashRecoveryStatePath: string,
): Promise<CrashRecoveryState | null> {
  const raw = await readFile(crashRecoveryStatePath, 'utf-8').catch(() => null)
  if (!raw) return null

  try {
    const parsed = JSON.parse(raw) as Partial<CrashRecoveryState>
    if (parsed.status !== 'crashed' || !parsed.snapshot || typeof parsed.updatedAt !== 'number') {
      return null
    }

    const snapshot = parseStoredRevisionSnapshot(JSON.stringify(parsed.snapshot))
    if (!snapshot) return null

    return {
      reason: typeof parsed.reason === 'string' ? parsed.reason : 'crashed',
      snapshot,
      status: 'crashed',
      updatedAt: parsed.updatedAt,
    }
  } catch {
    return null
  }
}

export async function clearCrashRecoveryState(crashRecoveryStatePath: string): Promise<void> {
  await rm(crashRecoveryStatePath, { force: true })
}

function buildRevisionFileName(snapshot: StoredRevisionSnapshot): string {
  return `${String(snapshot.updatedAt).padStart(13, '0')}-${snapshot.reason}-${snapshot.id}.json`
}

function encodeKeyPart(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url')
}

async function pruneRevisionSnapshots(documentDir: string, keepCount: number): Promise<void> {
  const fileNames = (await readdir(documentDir).catch(() => []))
    .filter((fileName) => fileName.endsWith('.json'))
    .sort()

  const filesToRemove = fileNames.slice(0, Math.max(0, fileNames.length - keepCount))
  await Promise.all(filesToRemove.map((fileName) => rm(join(documentDir, fileName), { force: true })))
}

async function listRevisionFileNames(revisionsRootDir: string, documentKey: string): Promise<string[]> {
  return (await readdir(join(revisionsRootDir, documentKey)).catch(() => []))
    .filter((fileName) => fileName.endsWith('.json'))
    .sort()
}

function parseStoredRevisionSnapshot(raw: string): StoredRevisionSnapshot | null {
  try {
    const parsed = JSON.parse(raw) as Partial<StoredRevisionSnapshot>
    if (
      typeof parsed.id !== 'string'
      || typeof parsed.documentKey !== 'string'
      || typeof parsed.content !== 'string'
      || typeof parsed.displayTitle !== 'string'
      || (parsed.documentKind !== 'draft' && parsed.documentKind !== 'file')
      || typeof parsed.updatedAt !== 'number'
      || !Number.isFinite(parsed.updatedAt)
      || (parsed.draftId !== null && parsed.draftId !== undefined && typeof parsed.draftId !== 'string')
      || (parsed.filePath !== null && parsed.filePath !== undefined && typeof parsed.filePath !== 'string')
      || typeof parsed.reason !== 'string'
    ) {
      return null
    }

    return {
      content: parsed.content,
      displayTitle: parsed.displayTitle,
      documentKind: parsed.documentKind,
      documentKey: parsed.documentKey,
      draftId: parsed.draftId ?? null,
      filePath: parsed.filePath ?? null,
      id: parsed.id,
      reason: parsed.reason as RevisionReason,
      updatedAt: parsed.updatedAt,
    }
  } catch {
    return null
  }
}
