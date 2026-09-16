import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  hasUnsavedDot,
  renderTabStripItems,
  resolveTabStripItemClassName,
  shouldRenderTabStrip,
  type WindowTabStripItem,
} from './window-tabs'

const tab = (overrides: Partial<WindowTabStripItem> = {}): WindowTabStripItem => ({
  id: 'tab-1',
  title: '笔记',
  hasUnsaved: false,
  isActive: false,
  ...overrides,
})

describe('标签条显隐（阶段 A：enabled 且多文档才渲染）', () => {
  it('开关关闭时永不显示，即使有多个 tab', () => {
    expect(shouldRenderTabStrip({ enabled: false, tabs: [tab(), tab({ id: 'tab-2' })] })).toBe(false)
  })

  it('开关开启但单 tab 时不显示（单文档零 DOM 痕迹）', () => {
    expect(shouldRenderTabStrip({ enabled: true, tabs: [tab()] })).toBe(false)
  })

  it('开关开启且 tab 数 > 1 时显示', () => {
    expect(shouldRenderTabStrip({ enabled: true, tabs: [tab(), tab({ id: 'tab-2' })] })).toBe(true)
    expect(shouldRenderTabStrip({ enabled: true, tabs: [tab(), tab({ id: 'tab-2' }), tab({ id: 'tab-3' })] })).toBe(true)
  })

  it('缺省 payload 安全收敛为不显示', () => {
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

describe('标签条 DOM 渲染（jsdom 不可用，用最小桩验证结构）', () => {
  class FakeNode {
    children: FakeNode[] = []
    listeners = new Map<string, () => void>()
    attributes = new Map<string, string>()
    className = ''
    dataset: Record<string, string> = {}
    textContent = ''
    type = ''
    constructor(public tagName: string, public id = '') {}
    appendChild(child: FakeNode): void {
      this.children.push(child)
    }
    append(child: FakeNode): void {
      this.children.push(child)
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
    const [active, inactive] = container.children
    expect(active.className).toBe('tab-strip-tab active')
    expect(active.attributes.get('aria-selected')).toBe('true')
    // 未保存圆点是独立子元素
    expect(active.children.some((child) => child.className === 'tab-strip-unsaved-dot')).toBe(true)
    expect(inactive.className).toBe('tab-strip-tab')
    expect(inactive.attributes.get('aria-selected')).toBe('false')
    expect(inactive.children.some((child) => child.className === 'tab-strip-unsaved-dot')).toBe(false)
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
    container.children[0].listeners.get('click')?.()
    expect(activated).toBe('tab-7')
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

  it('base.css 提供标签条样式：容器、活动高亮、未保存圆点', () => {
    expect(css).toContain('#tab-strip {')
    expect(css).toContain('#tab-strip .tab-strip-tab.active')
    expect(css).toContain('#tab-strip .tab-strip-unsaved-dot')
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
