import { describe, expect, it } from 'vitest'
import { decideReactivatedTabSync, recordIgnoredWatchedContent } from './file-sync'
import {
  addTab,
  canWriteTabToPath,
  closeAllTabs,
  createInitialTabCollection,
  createWindowTabState,
  detachTabWatch,
  findTabByFilePath,
  findTabById,
  getActiveTab,
  resolveTabForSave,
  serializeTabsForRenderer,
  setActiveTab,
  snapshotTabUnsavedContent,
  tabContentForActivation,
  tabDisplayTitle,
  type WindowTabState,
} from './window-tabs'

function makeLoadedTab(filePath: string, content: string): WindowTabState {
  const tab = createWindowTabState()
  tab.documentKind = 'file'
  tab.filePath = filePath
  tab.displayTitle = filePath
  tab.lastSyncedContent = content
  return tab
}

describe('window tab model', () => {
  it('初始集合只有一个 tab 且它是活动 tab（默认关闭时与单文档现状等价）', () => {
    const collection = createInitialTabCollection()
    expect(collection.tabs).toHaveLength(1)
    expect(getActiveTab(collection)).toBe(collection.tabs[0])
    expect(getActiveTab(collection).documentKind).toBe('blank')
    expect(getActiveTab(collection).filePath).toBeNull()
  })

  it('门槛一：切换 tab 只移动活动指针，不改动任何 tab 的内容字段', () => {
    const collection = createInitialTabCollection()
    const a = addTab(collection, makeLoadedTab('/tmp/a.md', 'A1'))
    const before = { aContent: a.lastSyncedContent, aTitle: a.displayTitle, aIgnored: a.ignoredWatchedContents.size }

    expect(setActiveTab(collection, collection.tabs[0].id)).toBe(true)
    expect(a.lastSyncedContent).toBe(before.aContent)
    expect(a.displayTitle).toBe(before.aTitle)
    expect(a.ignoredWatchedContents.size).toBe(before.aIgnored)
  })

  it('门槛一：切换到未知 tabId 被拒绝且活动 tab 不变', () => {
    const collection = createInitialTabCollection()
    expect(setActiveTab(collection, 'tab-nope')).toBe(false)
    expect(getActiveTab(collection)).toBe(collection.tabs[0])
  })

  it('门槛二：ignoredWatchedContents 按 tab 隔离，A 的凭证不会被 B 消费', () => {
    const collection = createInitialTabCollection()
    const a = addTab(collection, makeLoadedTab('/tmp/a.md', 'A1'))
    const b = addTab(collection, makeLoadedTab('/tmp/b.md', 'B1'))

    a.ignoredWatchedContents.set('A1', Date.now())
    expect(a.ignoredWatchedContents.has('A1')).toBe(true)
    expect(b.ignoredWatchedContents.has('A1')).toBe(false)
    expect(getActiveTab(collection)).toBe(b)
  })

  it('门槛二：findTabByFilePath 只命中路径一致的 tab，内容路由不会串文档', () => {
    const collection = createInitialTabCollection()
    const a = addTab(collection, makeLoadedTab('/tmp/a.md', 'A1'))
    addTab(collection, makeLoadedTab('/tmp/b.md', 'B1'))

    expect(findTabByFilePath(collection, '/tmp/a.md')).toBe(a)
    expect(findTabByFilePath(collection, '/tmp/c.md')).toBeNull()
    expect(canWriteTabToPath(a, '/tmp/a.md')).toBe(true)
    expect(canWriteTabToPath(a, '/tmp/b.md')).toBe(false)
  })

  it('门槛三：autosave 目标按调用时刻捕获，排队期间切换 tab 不改写落盘目标', () => {
    const collection = createInitialTabCollection()
    const a = addTab(collection, makeLoadedTab('/tmp/a.md', 'A1'))
    const b = addTab(collection, makeLoadedTab('/tmp/b.md', 'B1'))

    // autosave 发起：捕获 a（此刻它是活动 tab）
    const saveTarget = resolveTabForSave(collection, a.id)
    // 排队期间用户切到 b
    setActiveTab(collection, b.id)
    // 落盘完成：内容进 a，不进 b
    saveTarget!.lastSyncedContent = 'A2'
    expect(a.lastSyncedContent).toBe('A2')
    expect(b.lastSyncedContent).toBe('B1')
    expect(getActiveTab(collection)).toBe(b)
  })

  it('门槛三：切走时快照未保存编辑，切回时优先恢复；基线内容不被覆盖', () => {
    const collection = createInitialTabCollection()
    const a = addTab(collection, makeLoadedTab('/tmp/a.md', 'A1'))
    const b = addTab(collection, makeLoadedTab('/tmp/b.md', 'B1'))

    // 编辑器里已输入但还没 autosave 的内容
    snapshotTabUnsavedContent(a, 'A1-edited')
    setActiveTab(collection, b.id)
    expect(a.lastSyncedContent).toBe('A1')
    expect(a.unsavedContent).toBe('A1-edited')

    setActiveTab(collection, a.id)
    expect(tabContentForActivation(a)).toBe('A1-edited')

    // 编辑器恢复后 autosave 落盘：基线推进、快照清空、圆点消失
    a.lastSyncedContent = 'A1-edited'
    snapshotTabUnsavedContent(a, 'A1-edited')
    expect(a.unsavedContent).toBeNull()
  })

  it('未保存圆点：与基线一致的内容不产生圆点', () => {
    const tab = makeLoadedTab('/tmp/a.md', 'A1')
    snapshotTabUnsavedContent(tab, 'A1')
    expect(tab.unsavedContent).toBeNull()
    expect(serializeTabsForRenderer({ tabs: [tab], activeTabId: tab.id })[0].hasUnsaved).toBe(false)

    snapshotTabUnsavedContent(tab, 'A1-dirty')
    expect(serializeTabsForRenderer({ tabs: [tab], activeTabId: tab.id })[0].hasUnsaved).toBe(true)
  })

  it('门槛四：外部变更对账按 tab 生效——A 的自写凭证不会替 B 挡下外部变更', () => {
    const collection = createInitialTabCollection()
    const a = addTab(collection, makeLoadedTab('/tmp/a.md', 'A1'))
    const b = addTab(collection, makeLoadedTab('/tmp/b.md', 'B1'))
    setActiveTab(collection, a.id)

    // A 自己写入 A2（带“忽略一次”凭证），磁盘就是 A2：补读对账无事发生
    recordIgnoredWatchedContent(a.ignoredWatchedContents, 'A2')
    expect(
      decideReactivatedTabSync(a.lastSyncedContent, a.ignoredWatchedContents, 'A2').shouldHandleExternalChange,
    ).toBe(false)

    // 同样的磁盘内容对 B 是真正的外部变更：凭证按 tab 隔离，B 不会消费 A 的凭证，
    // 外部变更只作用于内容归属的那个 tab，不会污染其他 tab 的基线
    expect(
      decideReactivatedTabSync(b.lastSyncedContent, b.ignoredWatchedContents, 'A2').shouldHandleExternalChange,
    ).toBe(true)
    expect(a.lastSyncedContent).toBe('A1')
    expect(b.lastSyncedContent).toBe('B1')
    expect(getActiveTab(collection).filePath).toBe('/tmp/a.md')
  })

  it('门槛五：补读决策——磁盘一致或自写内容无事发生，落后于磁盘才走外部变更对账', () => {
    const collection = createInitialTabCollection()
    addTab(collection, makeLoadedTab('/tmp/a.md', 'A1'))
    const b = addTab(collection, makeLoadedTab('/tmp/b.md', 'B1'))
    expect(getActiveTab(collection)).toBe(b)

    // 磁盘与基线一致：无需对账
    expect(
      decideReactivatedTabSync(b.lastSyncedContent, b.ignoredWatchedContents, 'B1').shouldHandleExternalChange,
    ).toBe(false)

    // tab 自己刚写入的内容（凭证）：消费凭证后无事发生；凭证一次性，同内容再来就是外部变更
    recordIgnoredWatchedContent(b.ignoredWatchedContents, 'B2')
    expect(
      decideReactivatedTabSync(b.lastSyncedContent, b.ignoredWatchedContents, 'B2').shouldHandleExternalChange,
    ).toBe(false)
    expect(
      decideReactivatedTabSync(b.lastSyncedContent, b.ignoredWatchedContents, 'B2').shouldHandleExternalChange,
    ).toBe(true)

    // 磁盘落后于基线（切走期间被外部修改）：触发对账
    expect(
      decideReactivatedTabSync(b.lastSyncedContent, b.ignoredWatchedContents, 'B-external').shouldHandleExternalChange,
    ).toBe(true)
    // 决策是纯函数，不改动 tab 基线；落盘后 journal/revision 的 docPath 取自活动 tab 的 filePath
    expect(b.lastSyncedContent).toBe('B1')
    expect(canWriteTabToPath(b, b.filePath!)).toBe(true)
  })

  it('门槛六：关闭窗口时全部 tab 的 watcher/debounce 都被清理', () => {
    const collection = createInitialTabCollection()
    const timers: ReturnType<typeof setTimeout>[] = []
    const makeWatcherStub = () => ({ close: () => {} }) as unknown as WindowTabState['watcher']

    for (const tab of collection.tabs) {
      tab.watcher = makeWatcherStub()
      timers.push(setTimeout(() => {}, 10_000))
      tab.debounceTimer = timers[timers.length - 1]
    }
    const extra = addTab(collection)
    extra.watcher = makeWatcherStub()

    closeAllTabs(collection)
    for (const tab of collection.tabs) {
      expect(tab.watcher).toBeNull()
      expect(tab.debounceTimer).toBeNull()
    }
    for (const timer of timers) clearTimeout(timer)
  })

  it('标签条视图：标题去 .md 后缀、isActive 唯一、序列化不泄漏内容字段', () => {
    const collection = createInitialTabCollection()
    const a = addTab(collection, makeLoadedTab('/tmp/笔记.md', 'A1'))
    a.displayTitle = '笔记.md'
    const views = serializeTabsForRenderer(collection)
    expect(views).toHaveLength(2)
    expect(views[1]).toEqual({
      id: a.id,
      title: '笔记',
      documentKind: 'file',
      filePath: '/tmp/笔记.md',
      hasUnsaved: false,
      isActive: true,
    })
    expect(views.filter((view) => view.isActive)).toHaveLength(1)
    expect(JSON.stringify(views)).not.toContain('A1')
  })

  it('标签条视图：filePath 供渲染层最近文件入口排除已开 tab；blank 为 null', () => {
    const collection = createInitialTabCollection()
    addTab(collection, makeLoadedTab('/tmp/b.md', 'B1'))
    const views = serializeTabsForRenderer(collection)
    expect(views[0].filePath).toBeNull()
    expect(views[1].filePath).toBe('/tmp/b.md')
  })

  it('detachTabWatch 只清理目标 tab，不影响其他 tab 的 watcher', () => {
    const collection = createInitialTabCollection()
    const a = addTab(collection, makeLoadedTab('/tmp/a.md', 'A1'))
    const b = addTab(collection, makeLoadedTab('/tmp/b.md', 'B1'))
    a.watcher = { close: () => {} } as unknown as WindowTabState['watcher']
    b.watcher = { close: () => {} } as unknown as WindowTabState['watcher']

    detachTabWatch(a)
    expect(a.watcher).toBeNull()
    expect(b.watcher).not.toBeNull()
    detachTabWatch(b)
    expect(b.watcher).toBeNull()
  })

  it('findTabById 与 tabDisplayTitle 的边界行为', () => {
    const collection = createInitialTabCollection()
    expect(findTabById(collection, collection.activeTabId)).not.toBeNull()
    expect(findTabById(collection, 'missing')).toBeNull()
    const blank = createWindowTabState()
    expect(tabDisplayTitle(blank)).toBe('未命名文档')
  })
})
