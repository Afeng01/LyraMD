import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createWindowTabStripController,
  normalizeRecentFilesForTabStrip,
  hasUnsavedDot,
  recentFileDisplayName,
  recentMenuKeyCloses,
  renderTabStripItems,
  resolveTabDropPlaceBefore,
  resolveTabStripItemClassName,
  shouldRenderTabStrip,
  TAB_DRAG_MIME,
  type WindowTabStripItem,
} from './window-tabs'

const tab = (overrides: Partial<WindowTabStripItem> = {}): WindowTabStripItem => ({
  id: 'tab-1',
  title: '笔记',
  hasUnsaved: false,
  isActive: false,
  ...overrides,
})

describe('标签条显隐（阶段 C：单一顶栏，开关开启即常驻）', () => {
  it('开关关闭时永不显示，即使有多个 tab', () => {
    expect(shouldRenderTabStrip({ enabled: false, tabs: [tab(), tab({ id: 'tab-2' })] })).toBe(false)
  })

  it('开关开启但单 tab 时也显示（阶段 C：标签条常驻，单文档也是一个 tab）', () => {
    expect(shouldRenderTabStrip({ enabled: true, tabs: [tab()] })).toBe(true)
  })

  it('开关开启且 tab 数 > 1 时显示', () => {
    expect(shouldRenderTabStrip({ enabled: true, tabs: [tab(), tab({ id: 'tab-2' })] })).toBe(true)
    expect(shouldRenderTabStrip({ enabled: true, tabs: [tab(), tab({ id: 'tab-2' }), tab({ id: 'tab-3' })] })).toBe(true)
  })

  it('开关开启但 tabs 空数组时不显示（防御空集合；缺省 payload 同样安全收敛）', () => {
    expect(shouldRenderTabStrip({ enabled: true, tabs: [] })).toBe(false)
    expect(shouldRenderTabStrip(undefined as unknown as { enabled: boolean; tabs: WindowTabStripItem[] })).toBe(false)
  })
})

describe('tab 按钮样式与未保存圆点', () => {
  it('活动 tab 带 active 高亮类，非活动不带', () => {
    expect(resolveTabStripItemClassName(tab({ isActive: true }))).toBe('tab-strip-tab active')
    expect(resolveTabStripItemClassName(tab({ isActive: false }))).toBe('tab-strip-tab')
  })

  it('未保存圆点只看内部脏状态 hasUnsaved', () => {
    expect(hasUnsavedDot(tab({ hasUnsaved: true }))).toBe(true)
    expect(hasUnsavedDot(tab({ hasUnsaved: false }))).toBe(false)
  })
})

const makeFakeClassList = (owner: { className: string }) => ({
  add(...names: string[]): void {
    const set = new Set(owner.className.split(/\s+/).filter(Boolean))
    names.forEach((name) => set.add(name))
    owner.className = [...set].join(' ')
  },
  remove(...names: string[]): void {
    const set = new Set(owner.className.split(/\s+/).filter(Boolean))
    names.forEach((name) => set.delete(name))
    owner.className = [...set].join(' ')
  },
  toggle(name: string, force?: boolean): boolean {
    const set = new Set(owner.className.split(/\s+/).filter(Boolean))
    const on = force ?? !set.has(name)
    if (on) set.add(name)
    else set.delete(name)
    owner.className = [...set].join(' ')
    return on
  },
  contains(name: string): boolean {
    return owner.className.split(/\s+/).includes(name)
  },
})

describe('标签条 DOM 渲染（jsdom 不可用，用最小桩验证结构）', () => {
  class FakeNode {
    children: FakeNode[] = []
    listeners = new Map<string, () => void>()
    attributes = new Map<string, string>()
    className = ''
    classList = makeFakeClassList(this as unknown as { className: string })
    dataset: Record<string, string> = {}
    textContent = ''
    type = ''
    draggable = false
    title = ''
    constructor(public tagName: string, public id = '') {}
    appendChild(child: FakeNode): void {
      this.children.push(child)
    }
    append(...children: FakeNode[]): void {
      this.children.push(...children)
    }
    replaceChildren(): void {
      this.children = []
    }
    addEventListener(type: string, listener: () => void): void {
      this.listeners.set(type, listener)
    }
    setAttribute(name: string, value: string): void {
      this.attributes.set(name, value)
    }
  }

  class FakeDocument {
    constructor(public nodes: FakeNode[] = []) {}
    createElement(tagName: string): FakeNode {
      const node = new FakeNode(tagName)
      this.nodes.push(node)
      return node
    }
  }

  const renderWith = (tabs: WindowTabStripItem[]): { container: FakeNode; document: FakeDocument } => {
    const document = new FakeDocument()
    const container = new FakeNode('div', 'tab-strip')
    renderTabStripItems(
      container as unknown as HTMLElement,
      tabs,
      { onActivate: () => {} },
      document as unknown as Document,
    )
    return { container, document }
  }

  it('为每个 tab 渲染按钮：活动高亮、未保存圆点、点击回调', () => {
    const { container } = renderWith([
      tab({ id: 'tab-1', title: '笔记.md'.replace(/\.md$/, ''), isActive: true, hasUnsaved: true }),
      tab({ id: 'tab-2', title: '草稿', isActive: false, hasUnsaved: false }),
    ])
    expect(container.children).toHaveLength(2)
    const [activeItem, inactiveItem] = container.children
    const active = activeItem.children[0]!
    const inactive = inactiveItem.children[0]!
    expect(activeItem.className).toBe('tab-strip-item active')
    expect(active.className).toBe('tab-strip-tab active')
    expect(active.attributes.get('aria-selected')).toBe('true')
    // 未保存圆点是独立子元素
    expect(active.children.some((child) => child.className === 'tab-strip-unsaved-dot')).toBe(true)
    expect(activeItem.children[1]?.className).toBe('tab-strip-close')
    expect(inactiveItem.className).toBe('tab-strip-item')
    expect(inactive.className).toBe('tab-strip-tab')
    expect(inactive.attributes.get('aria-selected')).toBe('false')
    expect(inactive.children.some((child) => child.className === 'tab-strip-unsaved-dot')).toBe(false)
    expect(inactiveItem.children[1]?.className).toBe('tab-strip-close')
  })

  it('重渲染前清空旧按钮（tabs-state 每次全量刷新）', () => {
    const { container, document } = renderWith([tab(), tab({ id: 'tab-2' })])
    expect(container.children).toHaveLength(2)
    renderTabStripItems(
      container as unknown as HTMLElement,
      [tab()],
      { onActivate: () => {} },
      document as unknown as Document,
    )
    expect(container.children).toHaveLength(1)
  })

  it('点击 tab 按钮触发 onActivate 并带 tabId', () => {
    const document = new FakeDocument()
    const container = new FakeNode('div', 'tab-strip')
    let activated: string | null = null
    renderTabStripItems(
      container as unknown as HTMLElement,
      [tab({ id: 'tab-7' })],
      { onActivate: (tabId) => { activated = tabId } },
      document as unknown as Document,
    )
    container.children[0]!.children[0]!.listeners.get('click')?.()
    expect(activated).toBe('tab-7')
  })

  it('点击独立关闭按钮触发 onClose，不走标签切换', () => {
    const document = new FakeDocument()
    const container = new FakeNode('div', 'tab-strip')
    let activated: string | null = null
    let closed: string | null = null
    renderTabStripItems(
      container as unknown as HTMLElement,
      [tab({ id: 'tab-9' })],
      {
        onActivate: (tabId) => { activated = tabId },
        onClose: (tabId) => { closed = tabId },
      },
      document as unknown as Document,
    )
    const closeButton = container.children[0]!.children[1]!
    const closeHandler = closeButton.listeners.get('click') as unknown as (event: { stopPropagation: () => void }) => void
    closeHandler({ stopPropagation: () => {} })
    expect(closed).toBe('tab-9')
    expect(activated).toBeNull()
    expect(closeButton.attributes.get('aria-label')).toBe('关闭标签 笔记')
  })
})

describe('标签条挂载与零痕迹回退（阶段 C：单 tab 常驻）', () => {
  let mountRoot: FakeMountNode

  class FakeMountNode {
    children: FakeMountNode[] = []
    parent: FakeMountNode | null = null
    className = ''
    classList = makeFakeClassList(this as unknown as { className: string })
    dataset: Record<string, string> = {}
    textContent = ''
    type = ''
    hidden = false
    innerHTML = ''
    title = ''
    attributes = new Map<string, string>()
    listeners = new Map<string, () => void>()
    constructor(public tagName: string, public id = '') {}
    get isConnected(): boolean {
      let node: FakeMountNode | null = this
      while (node.parent) node = node.parent
      return node === mountRoot
    }
    appendChild(child: FakeMountNode): void {
      child.parent = this
      this.children.push(child)
    }
    append(...children: FakeMountNode[]): void {
      for (const child of children) this.appendChild(child)
    }
    replaceChildren(): void {
      for (const child of this.children) child.parent = null
      this.children = []
    }
    remove(): void {
      if (!this.parent) return
      this.parent.children = this.parent.children.filter((child) => child !== this)
      this.parent = null
    }
    before(node: FakeMountNode): void {
      if (!this.parent) return
      const index = this.parent.children.indexOf(this)
      this.parent.children.splice(index, 0, node)
      node.parent = this.parent
    }
    addEventListener(type: string, listener: () => void): void {
      this.listeners.set(type, listener)
    }
    setAttribute(name: string, value: string): void {
      this.attributes.set(name, value)
    }
  }

  const findById = (node: FakeMountNode, id: string): FakeMountNode | null => {
    if (node.id === id) return node
    for (const child of node.children) {
      const found = findById(child, id)
      if (found) return found
    }
    return null
  }

  const findByClass = (node: FakeMountNode, className: string): FakeMountNode | null => {
    if (node.className === className) return node
    for (const child of node.children) {
      const found = findByClass(child, className)
      if (found) return found
    }
    return null
  }

  const collectClassNames = (node: FakeMountNode, acc: string[] = []): string[] => {
    if (node.className) acc.push(node.className)
    for (const child of node.children) collectClassNames(child, acc)
    return acc
  }

  beforeEach(() => {
    mountRoot = new FakeMountNode('#root')
    mountRoot.append(new FakeMountNode('div', 'workspace'), new FakeMountNode('div', 'tab-strip'))
    vi.stubGlobal('document', {
      getElementById: (id: string) => findById(mountRoot, id),
      createElement: (tagName: string) => new FakeMountNode(tagName),
      addEventListener: () => {},
      removeEventListener: () => {},
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('单 tab 渲染：条挂载且含时钟按钮与最近文件下拉容器（阶段 C：⑤ 最近文件入口随标签常驻）', () => {
    const controller = createWindowTabStripController({ onActivate: () => {} })
    controller.handleTabsState({ enabled: true, tabs: [tab({ isActive: true })] })
    expect(controller.isMounted()).toBe(true)
    const stripNode = findById(mountRoot, 'tab-strip')
    expect(stripNode).not.toBeNull()
    const classNames = collectClassNames(stripNode!)
    expect(stripNode!.children[0]?.className).toBe('tab-strip-tabs')
    expect(stripNode!.children[1]?.className).toBe('tab-strip-controls')
    expect(stripNode!.children[1]?.children.map((child) => child.className)).toEqual([
      'tab-strip-new-button',
      'tab-strip-recent',
    ])
    expect(classNames).toContain('tab-strip-tabs')
    expect(classNames).toContain('tab-strip-controls')
    expect(classNames).not.toContain('tab-strip-close-active')
    expect(classNames).toContain('tab-strip-tab active')
    expect(classNames).toContain('tab-strip-recent-button')
    expect(classNames).toContain('tab-strip-recent-menu')
  })

  it('活动标签自身带 ×，非活动标签也带 ×', () => {
    let closed: string | null = null
    const controller = createWindowTabStripController({
      onActivate: () => {},
      onClose: (tabId) => { closed = tabId },
    })
    controller.handleTabsState({
      enabled: true,
      tabs: [
        tab({ id: 'older', title: '旧文稿', isActive: false }),
        tab({ id: 'current', title: '当前文稿', isActive: true }),
      ],
    })
    const strip = findById(mountRoot, 'tab-strip')!
    const tabsViewport = findByClass(strip, 'tab-strip-tabs')!
    const [olderItem, currentItem] = tabsViewport.children
    expect(olderItem!.children[1]?.className).toBe('tab-strip-close')
    const activeClose = currentItem!.children[1]!
    expect(activeClose.className).toBe('tab-strip-close')
    expect(activeClose.title).toBe('关闭 当前文稿')
    const click = activeClose.listeners.get('click') as unknown as (event: { stopPropagation: () => void }) => void
    click({ stopPropagation: () => {} })
    expect(closed).toBe('current')
  })

  it('拖拽排序：drop 事件把拖拽标签和落点交给 onReorder', () => {
    let reorder: { dragged: string; target: string; before: boolean } | null = null
    const controller = createWindowTabStripController({
      onActivate: () => {},
      onReorder: (draggedTabId, targetTabId, placeBefore) => {
        reorder = { dragged: draggedTabId, target: targetTabId, before: placeBefore }
      },
    })
    controller.handleTabsState({
      enabled: true,
      tabs: [tab({ id: 'a', isActive: true }), tab({ id: 'b' })],
    })
    const strip = findById(mountRoot, 'tab-strip')!
    const targetItem = findByClass(strip, 'tab-strip-tabs')!.children[1]!
    const dataTransfer = {
      types: [TAB_DRAG_MIME],
      getData: (mime: string) => (mime === TAB_DRAG_MIME ? 'a' : ''),
      dropEffect: '',
    }
    const dragover = targetItem.listeners.get('dragover') as unknown as (event: unknown) => void
    dragover({ clientX: 2, preventDefault: () => {}, dataTransfer })
    expect(targetItem.className).toContain('tab-drop-before')
    const drop = targetItem.listeners.get('drop') as unknown as (event: unknown) => void
    drop({ clientX: 2, preventDefault: () => {}, dataTransfer })
    expect(reorder).toEqual({ dragged: 'a', target: 'b', before: true })
  })

  it('历史按钮展示完整最近记录（含已打开文件），点击后交给上层激活或打开', () => {
    let openedPath: string | null = null
    const controller = createWindowTabStripController({
      onActivate: () => {},
      onOpenRecent: (filePath) => { openedPath = filePath },
    })
    controller.handleRecentFiles(['/tmp/open.md', '/tmp/recent.md'])
    controller.handleTabsState({
      enabled: true,
      tabs: [tab({ id: 'open', filePath: '/tmp/open.md', isActive: true })],
    })

    const strip = findById(mountRoot, 'tab-strip')!
    const button = findByClass(strip, 'tab-strip-recent-button')!
    const menu = findByClass(strip, 'tab-strip-recent-menu')!
    button.listeners.get('click')?.()
    expect(menu.hidden).toBe(false)
    expect(button.attributes.get('aria-expanded')).toBe('true')

    const item = findByClass(menu, 'tab-strip-recent-item')!
    expect(item.children[0]?.textContent).toBe('open')
    expect(item.children[1]?.textContent).toBe('已打开')
    item.listeners.get('click')?.()
    expect(openedPath).toBe('/tmp/open.md')
    expect(menu.hidden).toBe(true)
    expect(button.attributes.get('aria-expanded')).toBe('false')
  })

  it('历史按钮可显示已打开文稿而不是报空态', () => {
    const controller = createWindowTabStripController({ onActivate: () => {} })
    controller.handleRecentFiles(['/tmp/open.md'])
    controller.handleTabsState({
      enabled: true,
      tabs: [tab({ id: 'open', filePath: '/tmp/open.md', isActive: true })],
    })
    const strip = findById(mountRoot, 'tab-strip')!
    const button = findByClass(strip, 'tab-strip-recent-button')!
    const menu = findByClass(strip, 'tab-strip-recent-menu')!
    button.listeners.get('click')?.()
    expect(menu.hidden).toBe(false)
    expect(findByClass(menu, 'tab-strip-recent-item')?.children[1]?.textContent).toBe('已打开')
    expect(findByClass(menu, 'tab-strip-recent-empty')).toBeNull()
  })

  it('从单 tab 常驻切回关闭：节点被摘除（零痕迹回退，与阶段 A 前等价）', () => {
    const controller = createWindowTabStripController({ onActivate: () => {} })
    controller.handleTabsState({ enabled: true, tabs: [tab({ isActive: true })] })
    expect(controller.isMounted()).toBe(true)
    controller.handleTabsState({ enabled: false, tabs: [] })
    expect(controller.isMounted()).toBe(false)
    // 再次开启可重新挂载（新节点插回 workspace 前原位）
    controller.handleTabsState({ enabled: true, tabs: [tab({ isActive: true })] })
    expect(controller.isMounted()).toBe(true)
  })
})

describe('最近文件入口（阶段 A 第二片）', () => {
  it('最近记录保序去重，不隐藏当前已打开的文稿', () => {
    expect(
      normalizeRecentFilesForTabStrip(['/tmp/a.md', '/tmp/b.md', '/tmp/a.md', '/tmp/c.md']),
    ).toEqual(['/tmp/a.md', '/tmp/b.md', '/tmp/c.md'])
  })

  it('最近记录过滤非法输入并安全收敛', () => {
    expect(normalizeRecentFilesForTabStrip(['', 42 as unknown as string])).toEqual([])
    expect(normalizeRecentFilesForTabStrip(undefined as unknown as string[])).toEqual([])
  })

  it('菜单项标题：文档名去 .md 后缀，兼容 Windows 分隔符与无后缀回退', () => {
    expect(recentFileDisplayName('/tmp/笔记.md')).toBe('笔记')
    expect(recentFileDisplayName('C:\\notes\\研究.MD')).toBe('研究')
    expect(recentFileDisplayName('/tmp/.md')).toBe('/tmp/.md')
  })

  it('下拉关闭：仅 Esc 键触发', () => {
    expect(recentMenuKeyCloses('Escape')).toBe(true)
    expect(recentMenuKeyCloses('Enter')).toBe(false)
    expect(recentMenuKeyCloses(undefined)).toBe(false)
  })

  it('拖拽落点判定：前半段插前、后半段插后、异常宽度回退到插前', () => {
    expect(resolveTabDropPlaceBefore(10, 100)).toBe(true)
    expect(resolveTabDropPlaceBefore(60, 100)).toBe(false)
    expect(resolveTabDropPlaceBefore(0, 0)).toBe(true)
    expect(resolveTabDropPlaceBefore(Number.NaN, 100)).toBe(true)
  })

  it('CSS 提供最近文件入口样式：时钟按钮、下拉菜单、菜单项、空态', () => {
    const css = readFileSync(join(process.cwd(), 'src/renderer/themes/base.css'), 'utf8')
    expect(css).toContain('#tab-strip .tab-strip-recent-button')
    expect(css).toContain('#tab-strip .tab-strip-recent-menu')
    expect(css).toContain('#tab-strip .tab-strip-recent-item')
    expect(css).toContain('#tab-strip .tab-strip-recent-empty')
  })

  it('main.ts 接线：onOpenRecent 走 flushAutoSave → openTabDocument，侧边栏 recentFiles 喂给标签条', () => {
    const mainSource = readFileSync(join(process.cwd(), 'src/renderer/main.ts'), 'utf8')
    expect(mainSource).toContain('onOpenRecent: (filePath) => {')
    expect(mainSource).toContain('.then(() => api.openTabDocument({ filePath, content: getMarkdown() }))')
    expect(mainSource).toContain('tabStrip.handleRecentFiles(state.recentFiles ?? [])')
  })
})

describe('标签条接线与挂载点（字符串断言）', () => {
  const html = readFileSync(join(process.cwd(), 'src/renderer/index.html'), 'utf8')
  const css = readFileSync(join(process.cwd(), 'src/renderer/themes/base.css'), 'utf8')
  const moduleSource = readFileSync(join(process.cwd(), 'src/renderer/window-tabs.ts'), 'utf8')
  const mainSource = readFileSync(join(process.cwd(), 'src/renderer/main.ts'), 'utf8')

  it('index.html 在 #workspace 前预置空标签条容器', () => {
    expect(html).toContain('<div id="tab-strip" hidden></div>')
    expect(html.indexOf('id="tab-strip"')).toBeGreaterThan(-1)
    expect(html.indexOf('id="tab-strip"')).toBeLessThan(html.indexOf('<div id="workspace">'))
  })

  it('base.css 提供标签条样式和 24×24 关闭热区', () => {
    expect(css).toContain('#tab-strip {')
    expect(css).toContain('#tab-strip .tab-strip-tab.active')
    expect(css).toContain('#tab-strip .tab-strip-unsaved-dot')
    expect(css).toMatch(/#tab-strip \.tab-strip-close\s*\{[\s\S]*?width:\s*24px[\s\S]*?height:\s*24px/)
    const stripStyle = css.match(/#tab-strip\s*\{([^}]*)\}/)?.[1] ?? ''
    const tabsViewportStyle = css.match(/#tab-strip \.tab-strip-tabs\s*\{([^}]*)\}/)?.[1] ?? ''
    expect(stripStyle).toContain('overflow: visible')
    expect(stripStyle).not.toContain('overflow-x: auto')
    expect(tabsViewportStyle).toContain('overflow-x: auto')
    expect(css).toContain('#tab-strip .tab-strip-controls {')
    expect(css).toContain('#tab-strip .tab-strip-item.tab-drop-before')
    expect(css).toContain('#tab-strip .tab-strip-item.tab-drop-after')
    expect(css).toContain('.tab-strip-item:hover .tab-strip-close')
  })

  it('渲染层模块零痕迹策略：不满足条件时摘除节点', () => {
    expect(moduleSource).toContain('shouldRenderTabStrip')
    expect(moduleSource).toContain("document.getElementById('tab-strip')")
    expect(moduleSource).toContain('strip.remove()')
  })

  it('main.ts 接线：onTabsState 刷新标签条，四类 tab IPC 先 flushAutoSave 再回调', () => {
    expect(mainSource).toContain('createWindowTabStripController({')
    expect(mainSource).toContain('api.onTabsState(')
    expect(mainSource).toContain('api.onTabNewRequest(')
    expect(mainSource).toContain('api.onTabActivateRequest(')
    expect(mainSource).toContain('api.onTabOpenRequest(')
    expect(mainSource).toContain('onClose: (tabId) => {')
    expect(mainSource).toContain('.then(() => api.closeTab(tabId, getMarkdown()))')
    // 每个 tab 交互都先 flush 未保存编辑再带快照回调主进程
    expect(mainSource).toContain('.then(() => api.switchTab(tabId, getMarkdown()))')
    expect(mainSource).toContain('.then(() => api.createTab(getMarkdown()))')
    expect(mainSource).toContain('api.openTabDocument({')
    // tab 监听器必须在 renderer-ready 握手前注册，避免主进程早期推送丢失
    expect(mainSource.indexOf('api.onTabsState(')).toBeLessThan(mainSource.indexOf('api.signalRendererReady()'))
    // 内容同步不走 tabs-state：不引入第二条投递路径，不重复投递
    const tabsStateHandler = mainSource.match(/api\.onTabsState\(\(payload\) => \{[\s\S]*?\n  \}\)/)?.[0] ?? ''
    expect(tabsStateHandler).toContain('tabStrip.handleTabsState')
    expect(tabsStateHandler).not.toContain('applyOpenedDocument')
  })
})
