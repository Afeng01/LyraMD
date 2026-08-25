// 单个隐藏 iframe 拥有全部 Mermaid 渲染。mermaid 只运行在沙箱文档里
// （独立 chunk），主包与主线程完全不加载它；iframe 在第一个 mermaid
// 代码块出现时才懒创建。

import { isDarkBackgroundColor } from './theme-color'

const RENDER_TIMEOUT_MS = 15_000

type Pending = {
  resolve: (svg: string) => void
  reject: (reason: Error) => void
  timer: ReturnType<typeof setTimeout>
}

type SandboxMessage =
  | { type: 'ready' }
  | { type: 'result'; id: number; ok: true; svg: string }
  | { type: 'result'; id: number; ok: false; error: string }

let iframe: HTMLIFrameElement | null = null
let ready = false
let nextRenderId = 0
const pending = new Map<number, Pending>()
const waitingForReady: Array<() => void> = []

function currentTheme(): 'default' | 'dark' {
  // 以代码块底色的实际亮度为准：内置主题（如雅致的深色代码块）和自定义
  // CSS 主题都能自动匹配，不依赖硬编码的主题类名清单。
  const bg = getComputedStyle(document.body).getPropertyValue('--code-block-bg').trim()
  return isDarkBackgroundColor(bg) ? 'dark' : 'default'
}

function rejectAllPending(reason: Error): void {
  for (const entry of pending.values()) {
    clearTimeout(entry.timer)
    entry.reject(reason)
  }
  pending.clear()
}

// 一次挂死的渲染（如 mermaid gantt 已知的内存膨胀场景）不能污染后续渲染：
// 整体销毁沙箱，下一次请求时重建。
function destroyIframe(): void {
  if (iframe) {
    iframe.remove()
    iframe = null
  }
  ready = false
  waitingForReady.length = 0
}

function ensureIframe(): void {
  if (iframe) return
  iframe = document.createElement('iframe')
  // 红线：沙箱只允许脚本执行，绝不同时开放同源权限——
  // 不透明源保证即使 SVG 输出里有恶意脚本也无法触达主文档与本地存储。
  iframe.setAttribute('sandbox', 'allow-scripts')
  // 不能用 display:none——隐藏 iframe 仍需参与排版才能做文本测量，
  // 否则渲染出的 SVG 尺寸为零。
  iframe.style.position = 'fixed'
  iframe.style.left = '-9999px'
  iframe.style.width = '1024px'
  iframe.style.height = '768px'
  iframe.style.visibility = 'hidden'
  iframe.style.border = '0'
  iframe.src = './mermaid-sandbox.html'
  document.body.appendChild(iframe)
}

function dispatchRender(code: string, resolve: (svg: string) => void, reject: (reason: Error) => void): void {
  const id = ++nextRenderId
  const timer = setTimeout(() => {
    pending.delete(id)
    rejectAllPending(new Error('渲染超时，已重置渲染器'))
    destroyIframe()
  }, RENDER_TIMEOUT_MS)
  pending.set(id, { resolve, reject, timer })
  const bg = getComputedStyle(document.body).getPropertyValue('--code-block-bg').trim()
  iframe?.contentWindow?.postMessage({ type: 'render', id, code, theme: currentTheme(), bg }, '*')
}

window.addEventListener('message', (event) => {
  if (!iframe || event.source !== iframe.contentWindow) return
  const data = event.data as SandboxMessage | undefined
  if (!data) return

  if (data.type === 'ready') {
    ready = true
    const queued = waitingForReady.splice(0)
    for (const run of queued) run()
    return
  }

  if (data.type === 'result') {
    const entry = pending.get(data.id)
    if (!entry) return
    pending.delete(data.id)
    clearTimeout(entry.timer)
    if (data.ok) entry.resolve(data.svg)
    else entry.reject(new Error(data.error || '语法错误'))
  }
})

export function renderMermaid(code: string): Promise<string> {
  ensureIframe()
  return new Promise<string>((resolve, reject) => {
    if (ready) {
      dispatchRender(code, resolve, reject)
    } else {
      waitingForReady.push(() => dispatchRender(code, resolve, reject))
    }
  })
}
