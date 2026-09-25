// 标签页阶段 A 第一片的渲染层：窗口级标签条的显隐与渲染。
// 显隐规则（方案 §8 阶段 C：单一顶栏）：appSettings.tabs.enabled 开启即常驻渲染——
// 单文档也是一个 tab，最近文件入口随标签常驻；开关关闭时把标签条节点从 DOM
// 完全摘除，零 DOM 痕迹（关闭态与阶段 A 前现状等价）。
// 纯逻辑（显隐判定、样式类名、未保存圆点）与 DOM 副作用分离，便于 node 环境测试。

export interface WindowTabStripItem {
  id: string
  title: string
  hasUnsaved: boolean
  isActive: boolean
  /** 主进程序列化补充：供最近文件入口排除已在 tab 中打开的文稿 */
  filePath?: string | null
}

export interface TabsStatePayload {
  enabled: boolean
  tabs: WindowTabStripItem[]
}

export interface TabStripHandlers {
  onActivate: (tabId: string) => void
  onClose?: (tabId: string) => void
  /** 最近文件入口：点选未打开的最近文稿，先 flushAutoSave 再走 openTabDocument */
  onOpenRecent?: (filePath: string) => void
}

/**
 * 标签条显隐判定（阶段 C：单一顶栏）：开关开启即常驻显示——单文档也是一个 tab；
 * 关闭时（或异常空集合）不显示，零 DOM 痕迹回退机制原样保留。
 */
export function shouldRenderTabStrip(payload: TabsStatePayload): boolean {
  return payload?.enabled === true && Array.isArray(payload.tabs) && payload.tabs.length > 0
}

/** tab 按钮样式类名：活动 tab 高亮；未保存圆点用独立元素，不进类名。 */
export function resolveTabStripItemClassName(tab: WindowTabStripItem): string {
  const classNames = ['tab-strip-tab']
  if (tab.isActive) classNames.push('active')
  return classNames.join(' ')
}

/**
 * 最近文件入口的候选过滤（阶段 A 第二片）：排除已在当前窗口 tab 中打开的文稿，
 * 保持原有顺序并按路径去重；非字符串/空路径静默丢弃。
 */
export function filterRecentFilesForTabStrip(
  recentFiles: string[],
  tabs: Array<{ filePath?: string | null }>,
): string[] {
  const openPaths = new Set(
    (Array.isArray(tabs) ? tabs : [])
      .map((tab) => tab?.filePath)
      .filter((filePath): filePath is string => typeof filePath === 'string' && filePath.length > 0),
  )
  const seen = new Set<string>()
  const candidates: string[] = []
  for (const filePath of recentFiles) {
    if (typeof filePath !== 'string' || filePath.length === 0) continue
    if (openPaths.has(filePath) || seen.has(filePath)) continue
    seen.add(filePath)
    candidates.push(filePath)
  }
  return candidates
}

/** 最近文件菜单项标题：文档名去 .md 后缀（与标签条标题规则一致，兼容 Windows 分隔符）。 */
export function recentFileDisplayName(filePath: string): string {
  const name = filePath.split(/[\\/]/).pop() ?? filePath
  return name.replace(/\.md$/i, '') || filePath
}

/** Esc 关闭最近文件下拉。 */
export function recentMenuKeyCloses(key: string | undefined): boolean {
  return key === 'Escape'
}

/** 未保存小圆点 = 内部脏状态（unsavedContent 快照）；外部修改提示保留文字，两者不共用。 */
export function hasUnsavedDot(tab: WindowTabStripItem): boolean {
  return tab.hasUnsaved === true
}

export function renderTabStripItems(
  container: HTMLElement,
  tabs: WindowTabStripItem[],
  handlers: TabStripHandlers,
  doc: Document = document,
): void {
  container.replaceChildren()
  for (const tab of tabs) {
    const item = doc.createElement('div')
    item.className = tab.isActive ? 'tab-strip-item active' : 'tab-strip-item'
    item.dataset.tabId = tab.id
    item.setAttribute('role', 'presentation')

    const button = doc.createElement('button')
    button.type = 'button'
    button.className = resolveTabStripItemClassName(tab)
    button.dataset.tabId = tab.id
    button.setAttribute('role', 'tab')
    button.setAttribute('aria-selected', tab.isActive ? 'true' : 'false')
    button.title = tab.title

    const titleSpan = doc.createElement('span')
    titleSpan.className = 'tab-strip-title'
    titleSpan.textContent = tab.title
    button.append(titleSpan)

    if (hasUnsavedDot(tab)) {
      const dot = doc.createElement('span')
      dot.className = 'tab-strip-unsaved-dot'
      dot.setAttribute('aria-label', '未保存')
      button.append(dot)
    }

    button.addEventListener('click', () => {
      handlers.onActivate(tab.id)
    })

    const closeButton = doc.createElement('button')
    closeButton.type = 'button'
    closeButton.className = 'tab-strip-close'
    closeButton.title = `关闭 ${tab.title}`
    closeButton.setAttribute('aria-label', `关闭标签 ${tab.title}`)
    closeButton.textContent = '×'
    closeButton.addEventListener('click', (event) => {
      event.stopPropagation()
      handlers.onClose?.(tab.id)
    })

    item.append(button, closeButton)
    container.append(item)
  }
}

export interface WindowTabStripController {
  handleTabsState: (payload: TabsStatePayload) => void
  /** 侧边栏最近文件列表更新时喂给标签条（main.ts onSidebarState 接线） */
  handleRecentFiles: (recentFiles: string[]) => void
  /** 测试与调试用：当前是否已挂载标签条节点 */
  isMounted: () => boolean
}

/**
 * 标签条控制器：挂载点固定在 #workspace 之前（index.html 里预置了空容器 #tab-strip）。
 * 不满足显隐条件时把容器从 DOM 摘除并清空子节点——保证「零 DOM 痕迹」；
 * 再次满足时把同一容器节点插回原位。
 */
export function createWindowTabStripController(handlers: TabStripHandlers): WindowTabStripController {
  let strip: HTMLElement | null = null
  // 最近文件下拉（阶段 A 第二片）：时钟按钮仅在标签条可见时渲染，Esc/点击外部关闭
  let recentMenu: HTMLElement | null = null
  let recentButton: HTMLButtonElement | null = null
  let recentFiles: string[] = []
  let currentTabs: WindowTabStripItem[] = []
  let outsideCloseAttached = false

  const onDocumentKeydown = (event: KeyboardEvent): void => {
    if (!recentMenuKeyCloses(event.key)) return
    closeRecentMenu()
  }

  const onDocumentPointerDown = (event: PointerEvent): void => {
    const target = event.target as Node | null
    if (target && ((recentMenu?.contains(target)) || (recentButton?.contains(target) ?? false))) return
    closeRecentMenu()
  }

  function attachOutsideClose(): void {
    if (outsideCloseAttached) return
    document.addEventListener('keydown', onDocumentKeydown)
    document.addEventListener('pointerdown', onDocumentPointerDown, true)
    outsideCloseAttached = true
  }

  function detachOutsideClose(): void {
    if (!outsideCloseAttached) return
    document.removeEventListener('keydown', onDocumentKeydown)
    document.removeEventListener('pointerdown', onDocumentPointerDown, true)
    outsideCloseAttached = false
  }

  function closeRecentMenu(): void {
    detachOutsideClose()
    if (recentMenu) recentMenu.hidden = true
    recentButton?.setAttribute('aria-expanded', 'false')
  }

  function renderRecentMenuItems(): void {
    if (!recentMenu) return
    recentMenu.replaceChildren()
    const candidates = filterRecentFilesForTabStrip(recentFiles, currentTabs)
    const heading = document.createElement('div')
    heading.className = 'tab-strip-recent-heading'
    heading.textContent = '最近打开的文稿'
    recentMenu.append(heading)
    if (candidates.length === 0) {
      const empty = document.createElement('div')
      empty.className = 'tab-strip-recent-empty'
      empty.textContent = recentFiles.length === 0
        ? '还没有最近文件记录'
        : '最近记录中的文稿都已在标签页中打开'
      recentMenu.append(empty)
      return
    }
    for (const filePath of candidates) {
      const item = document.createElement('button')
      item.type = 'button'
      item.className = 'tab-strip-recent-item'
      item.title = filePath
      item.setAttribute('role', 'menuitem')
      item.textContent = recentFileDisplayName(filePath)
      item.addEventListener('click', () => {
        closeRecentMenu()
        handlers.onOpenRecent?.(filePath)
      })
      recentMenu.append(item)
    }
  }

  function openRecentMenu(): void {
    if (!recentMenu) return
    renderRecentMenuItems()
    recentMenu.hidden = false
    attachOutsideClose()
  }

  /** 标签条末尾的时钟按钮 + 下拉容器；每次重渲染都会重建，旧引用随之作废。 */
  function renderRecentControl(container: HTMLElement): void {
    const wrapper = document.createElement('div')
    wrapper.className = 'tab-strip-recent'
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'tab-strip-recent-button'
    button.title = '打开最近文件（未在标签页中的文稿）'
    button.setAttribute('aria-label', '打开最近文件')
    button.setAttribute('aria-haspopup', 'menu')
    button.setAttribute('aria-expanded', 'false')
    button.innerHTML =
      '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><circle cx="8" cy="8" r="6.4" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M8 4.6V8l2.4 1.6" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>'
    button.addEventListener('click', () => {
      if (!recentMenu) return
      const willOpen = recentMenu.hidden
      if (willOpen) {
        openRecentMenu()
      } else {
        closeRecentMenu()
      }
      button.setAttribute('aria-expanded', willOpen ? 'true' : 'false')
    })
    const menu = document.createElement('div')
    menu.className = 'tab-strip-recent-menu'
    menu.hidden = true
    menu.setAttribute('role', 'menu')
    menu.setAttribute('aria-label', '最近打开的文稿')
    wrapper.append(button, menu)
    container.append(wrapper)
    recentButton = button
    recentMenu = menu
  }

  const detachStrip = (): void => {
    if (!strip) return
    strip.replaceChildren()
    strip.remove()
  }

  const handleTabsState = (payload: TabsStatePayload): void => {
    if (!shouldRenderTabStrip(payload)) {
      detachStrip()
      closeRecentMenu()
      recentMenu = null
      recentButton = null
      return
    }
    if (!strip) {
      strip = document.getElementById('tab-strip')
    }
    if (!strip) {
      const workspace = document.getElementById('workspace')
      if (!workspace) return
      strip = document.createElement('div')
      strip.id = 'tab-strip'
      strip.setAttribute('role', 'tablist')
      strip.setAttribute('aria-label', '文稿标签页')
      workspace.before(strip)
    }
    if (!strip.isConnected) {
      const workspace = document.getElementById('workspace')
      if (!workspace) {
        strip = null
        return
      }
      workspace.before(strip)
    }
    strip.hidden = false
    closeRecentMenu()
    currentTabs = payload.tabs
    renderTabStripItems(strip, payload.tabs, handlers)
    renderRecentControl(strip)
  }

  const handleRecentFiles = (nextRecentFiles: string[]): void => {
    recentFiles = Array.isArray(nextRecentFiles) ? nextRecentFiles : []
    // 下拉打开中且列表变化：就地刷新候选项，不关菜单
    if (recentMenu && recentMenu.hidden === false) renderRecentMenuItems()
  }

  return {
    handleTabsState,
    handleRecentFiles,
    isMounted: () => strip?.isConnected === true,
  }
}
