import { appendFile, mkdir, rename, stat } from 'fs/promises'
import { dirname } from 'node:path'

// append-only 文稿事件日志（P0-B）：
// 目标不是替代 revision 快照，而是提供事件级事实面——就算 UI 崩了，
// 也能从底层事实链回放「哪一次写入把正文改成了什么」。
// 铁律：journal 任何失败都不能阻断正文保存链，所有异常就地吞掉。

export const DOCUMENT_JOURNAL_DEFAULT_MAX_BYTES = 5 * 1024 * 1024

export type DocumentJournalEventType =
  | 'autosave'
  | 'manual-save'
  | 'save-as'
  | 'rename'
  | 'image-checkpoint'
  | 'external-change-detected'
  | 'external-change-blocked'
  | 'external-change-accepted'
  | 'external-change-restored'
  | 'crash-recovery-generated'
  | 'crash-recovery-restored'
  | 'revision-restored'

export interface DocumentJournalContentStats {
  checksum: string
  chars: number
  lines: number
}

export interface DocumentJournalEvent {
  type: DocumentJournalEventType
  docPath?: string | null
  draftId?: string | null
  displayTitle?: string | null
  source?: 'internal' | 'external' | 'user'
  risk?: { isDestructive: boolean; reason: string | null } | null
  previous?: DocumentJournalContentStats | null
  next?: DocumentJournalContentStats | null
  detail?: string
}

export interface DocumentJournalRecord extends DocumentJournalEvent {
  ts: string
  appVersion?: string
}

export interface DocumentJournal {
  record: (event: DocumentJournalEvent) => Promise<void>
}

// FNV-1a 32 位校验和。用途是区分「哪一次写入改了内容」，
// 不是密码学摘要，碰撞概率对事故回放场景足够低。
export function checksumContent(content: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < content.length; index += 1) {
    hash ^= content.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

export function describeJournalContent(content: string): DocumentJournalContentStats {
  return {
    checksum: checksumContent(content),
    chars: content.length,
    lines: content.length === 0 ? 0 : content.replaceAll('\r\n', '\n').split('\n').length,
  }
}

export function createDocumentJournal(
  journalPath: string,
  options: { maxBytes?: number; appVersion?: string } = {},
): DocumentJournal {
  const maxBytes = Math.max(1024, options.maxBytes ?? DOCUMENT_JOURNAL_DEFAULT_MAX_BYTES)

  return {
    async record(event: DocumentJournalEvent): Promise<void> {
      try {
        const record: DocumentJournalRecord = {
          ...event,
          ts: new Date().toISOString(),
          ...(options.appVersion ? { appVersion: options.appVersion } : {}),
        }
        const payload = `${JSON.stringify(record)}\n`
        const fileSize = await stat(journalPath).then((info) => info.size).catch(() => 0)
        if (fileSize >= maxBytes) {
          // 按大小滚动切分，保留一份旧档；不按次数淘汰（P0 计划 §4.2）
          await rename(journalPath, `${journalPath}.1`).catch(async () => {})
        }
        await mkdir(dirname(journalPath), { recursive: true })
        await appendFile(journalPath, payload, 'utf-8')
      } catch {
        // journal 失败绝不能阻断保存链
      }
    },
  }
}
