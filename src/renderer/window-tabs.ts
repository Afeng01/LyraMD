// 标签页阶段 A 第一片的渲染层：窗口级标签条的显隐与渲染。
// 显隐规则（方案 §8 阶段 A）：appSettings.tabs.enabled 且窗口内 tab 数 > 1 才渲染；
// 否则把标签条节点从 DOM 完全摘除，零 DOM 痕迹（默认关闭时与现状等价）。
// 纯逻辑（显隐判定、样式类名、未保存圆点）与 DOM 副作用分离，便于 node 环境测试。

export interface WindowTabStripItem {
  id: string
  title: string
  hasUnsaved: boolean
  isActive: boolean
}

export interface TabsStatePayload {
  enabled: boolean
  tabs: WindowTabStripItem[]
}

export interface TabStripHandlers {
  onActivate: (tabId: string) => void
}

/** 标签条显隐判定：开关开启且窗口内不止一个 tab 才显示；单文档永不显示标签条。 */
export function shouldRenderTabStrip(payload: TabsStatePayload): boolean {
  return payload?.enabled === true && Array.isArray(payload.tabs) && payload.tabs.length > 1
}

/** tab 按钮样式类名：活动 tab 高亮；未保存圆点用独立元素，不进类名。 */
export function resolveTabStripItemClassName(tab: WindowTabStripItem): string {
  const classNames = ['tab-strip-tab']
  if (tab.isActive) classNames.push('active')
  return classNames.join(' ')
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
    container.append(button)
  }
}

export interface WindowTabStripController {
  handleTabsState: (payload: TabsStatePayload) => void
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

  const detachStrip = (): void => {
    if (!strip) return
    strip.replaceChildren()
    strip.remove()
  }

  const handleTabsState = (payload: TabsStatePayload): void => {
    if (!shouldRenderTabStrip(payload)) {
      detachStrip()
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
    renderTabStripItems(strip, payload.tabs, handlers)
  }

  return {
    handleTabsState,
    isMounted: () => strip?.isConnected === true,
  }
}
