import { join } from 'path'

export interface DraftEntry {
  id: string
  path: string
  createdAt: number
  updatedAt: number
  displayTitle: string
  manualTitle?: string | null
}

export interface UpsertDraftEntryInput {
  entries: DraftEntry[]
  content: string
  draftDirectoryPath: string
  now: number
  suffix?: number
  existingEntry?: DraftEntry | null
}

export interface UpsertDraftEntryResult {
  draftEntry: DraftEntry | null
  entries: DraftEntry[]
  materialized: boolean
}

export interface PromoteDraftEntriesInput {
  draftId?: string | null
  draftPath?: string | null
}

export function isBlankDocumentContent(content: string): boolean {
  return content.trim().length === 0
}

export function deriveDocumentTitle(content: string, fallback = '未命名草稿'): string {
  const lines = content.replaceAll('\r\n', '\n').split('\n')

  for (const line of lines) {
    const headingMatch = line.trim().match(/^#\s+(.+)$/)
    if (headingMatch) {
      const normalizedHeading = normalizeTitleCandidate(headingMatch[1] ?? '')
      if (normalizedHeading) return normalizedHeading
    }
  }

  for (const line of lines) {
    if (shouldSkipTitleCandidate(line)) continue
    const trimmedLine = normalizeTitleCandidate(line)
    if (trimmedLine) return trimmedLine
  }

  return fallback
}

export function deriveDraftDisplayTitle(content: string, manualTitle?: string | null): string {
  const trimmedManualTitle = manualTitle?.trim()
  if (trimmedManualTitle) return trimmedManualTitle
  return deriveDocumentTitle(content, '未命名草稿')
}

export function createDraftFileName(now: number, suffix?: number): string {
  const date = new Date(now)
  const datePart = [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, '0'),
    String(date.getUTCDate()).padStart(2, '0'),
  ].join('')
  const timePart = [
    String(date.getUTCHours()).padStart(2, '0'),
    String(date.getUTCMinutes()).padStart(2, '0'),
    String(date.getUTCSeconds()).padStart(2, '0'),
  ].join('')

  return `draft-${datePart}-${timePart}${typeof suffix === 'number' ? `-${suffix}` : ''}.md`
}

export function upsertDraftEntry({
  entries,
  content,
  draftDirectoryPath,
  now,
  suffix,
  existingEntry,
}: UpsertDraftEntryInput): UpsertDraftEntryResult {
  if (!existingEntry && isBlankDocumentContent(content)) {
    return {
      draftEntry: null,
      entries,
      materialized: false,
    }
  }

  const draftEntry = existingEntry
    ? {
        ...existingEntry,
        updatedAt: now,
        displayTitle: deriveDraftDisplayTitle(content, existingEntry.manualTitle),
      }
    : createDraftEntry(draftDirectoryPath, content, now, suffix)

  return {
    draftEntry,
    entries: existingEntry
      ? entries.map((entry) => (entry.id === draftEntry.id ? draftEntry : entry))
      : [draftEntry, ...entries],
    materialized: !existingEntry,
  }
}

export function promoteDraftEntries(entries: DraftEntry[], { draftId, draftPath }: PromoteDraftEntriesInput): DraftEntry[] {
  return entries.filter((entry) => {
    if (draftId && entry.id === draftId) return false
    if (draftPath && entry.path === draftPath) return false
    return true
  })
}

function createDraftEntry(draftDirectoryPath: string, content: string, now: number, suffix?: number): DraftEntry {
  const fileName = createDraftFileName(now, suffix)

  return {
    id: fileName.slice(0, -3),
    path: join(draftDirectoryPath, fileName),
    createdAt: now,
    updatedAt: now,
    displayTitle: deriveDraftDisplayTitle(content),
    manualTitle: null,
  }
}

function normalizeTitleCandidate(line: string): string {
  const normalized = line
    .replace(/!\[[^\]]*]\([^)]+\)/g, ' ')
    .replace(/\[([^\]]+)]\([^)]+\)/g, '$1')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\|/g, ' ')
    .replace(/[*_`~]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  if (!normalized) return ''
  if (/^:?-{3,}:?$/.test(normalized)) return ''
  return normalized
}

function shouldSkipTitleCandidate(line: string): boolean {
  const trimmed = line.trim()
  if (!trimmed) return true
  if (/^<br\s*\/?>$/i.test(trimmed)) return true
  if (/^!\[[^\]]*]\([^)]+\)$/.test(trimmed)) return true
  if (/^<[^>]+>$/.test(trimmed)) return true
  if (/^\|.*\|$/.test(trimmed)) return true
  if (/^:?-{3,}:?(?:\|:?-{3,}:?)+$/.test(trimmed.replace(/\s+/g, ''))) return true
  return false
}
