import { watch, type FSWatcher } from 'fs'
import { basename, dirname } from 'path'

export interface WatchedContentDecision {
  nextSyncedContent: string
  shouldPropagate: boolean
}

export interface WatchEventDecision {
  shouldReadFile: boolean
}

export function normalizeChangedName(changedName: string | Buffer | null | undefined): string | null {
  if (typeof changedName === 'string') return changedName
  if (changedName && Buffer.isBuffer(changedName)) return changedName.toString()
  return null
}

export function recordIgnoredWatchedContent(
  ignoredWatchedContents: Map<string, number>,
  content: string,
): void {
  ignoredWatchedContents.set(content, (ignoredWatchedContents.get(content) ?? 0) + 1)
}

export function consumeIgnoredWatchedContent(
  ignoredWatchedContents: Map<string, number>,
  content: string,
): boolean {
  const currentCount = ignoredWatchedContents.get(content) ?? 0
  if (currentCount <= 0) return false
  if (currentCount === 1) {
    ignoredWatchedContents.delete(content)
  } else {
    ignoredWatchedContents.set(content, currentCount - 1)
  }
  return true
}

export function reconcileWatchedContent(
  lastSyncedContent: string | null,
  nextContent: string,
): WatchedContentDecision {
  return {
    nextSyncedContent: nextContent,
    shouldPropagate: lastSyncedContent !== nextContent,
  }
}

export interface ReactivatedTabSyncDecision {
  /** true → 磁盘内容与该 tab 基线不一致，须走外部变更对账（自动采纳 / blocked 决策面） */
  shouldHandleExternalChange: boolean
}

/** tab 上记录的“已处理过的被拦外部变更”凭证：当次磁盘内容 + 当时的同步基线。 */
export interface HandledExternalContentRecord {
  diskContent: string
  baseline: string | null
}

/**
 * tab 重新激活后的磁盘补读决策（门槛五）。
 *
 * watcher 在 tab 切走期间被卸载，fs.watch 重挂不会回放历史事件，
 * 所以切回时必须补读一次磁盘。决策复用与 watcher 事件完全相同的对账语义：
 * 先消费本 tab 自己写入留下的“忽略一次”凭证，再用 reconcileWatchedContent
 * 判断基线是否落后于磁盘。返回 false 表示磁盘与基线一致（或就是自己刚写入的内容），无事发生。
 */
export function decideReactivatedTabSync(
  lastSyncedContent: string | null,
  ignoredWatchedContents: Map<string, number>,
  diskContent: string,
): ReactivatedTabSyncDecision {
  if (consumeIgnoredWatchedContent(ignoredWatchedContents, diskContent)) {
    return { shouldHandleExternalChange: false }
  }
  return {
    shouldHandleExternalChange: reconcileWatchedContent(lastSyncedContent, diskContent).shouldPropagate,
  }
}

/**
 * 被拦决策面去重判断：同一次外部内容 + 基线未变（用户既没接受也没改本地）时，
 * watcher 重放 / 重新激活补读不再重复弹决策面；基线一旦推进或内容再变即重新对账。
 */
export function isAlreadyHandledExternalContent(
  handled: HandledExternalContentRecord | null | undefined,
  diskContent: string,
  lastSyncedContent: string | null,
): boolean {
  return handled !== null && handled !== undefined
    && handled.diskContent === diskContent
    && handled.baseline === lastSyncedContent
}

export function decideWatchEvent(eventType: string): WatchEventDecision {
  if (eventType === 'rename') {
    return {
      shouldReadFile: true,
    }
  }

  if (eventType === 'change') {
    return {
      shouldReadFile: true,
    }
  }

  return {
    shouldReadFile: false,
  }
}

export function shouldHandleTargetFileWatchEvent(
  eventType: string,
  changedName: string | Buffer | null | undefined,
  targetName: string,
): boolean {
  const normalizedChangedName = normalizeChangedName(changedName)
  if (normalizedChangedName && normalizedChangedName !== targetName) {
    return false
  }

  return decideWatchEvent(eventType).shouldReadFile
}

export function watchTargetFile(
  filePath: string,
  onEvent: (eventType: string) => void,
): FSWatcher {
  const parentDir = dirname(filePath)
  const targetName = basename(filePath)

  return watch(parentDir, (eventType, changedName) => {
    if (!shouldHandleTargetFileWatchEvent(eventType, changedName, targetName)) return
    onEvent(eventType)
  })
}
