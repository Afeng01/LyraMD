import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { isDarkBackgroundColor, relativeLuminance } from './theme-color'

const read = (path: string): string => readFileSync(join(process.cwd(), path), 'utf8')

describe('mermaid theme color', () => {
  it('classifies built-in code block backgrounds by luminance', () => {
    // 亮色主题的代码块底色
    expect(isDarkBackgroundColor('#f6f8fa')).toBe(false)
    expect(isDarkBackgroundColor('#eae6de')).toBe(false)
    // 深色主题与雅致主题（深色代码块）的底色
    expect(isDarkBackgroundColor('#161b22')).toBe(true)
    expect(isDarkBackgroundColor('#2c2c2c')).toBe(true)
  })

  it('parses rgb()/rgba() and falls back to light for unparseable colors', () => {
    expect(isDarkBackgroundColor('rgba(22, 27, 34, 1)')).toBe(true)
    expect(isDarkBackgroundColor('rgb(246, 248, 250)')).toBe(false)
    expect(isDarkBackgroundColor('transparent')).toBe(false)
    expect(isDarkBackgroundColor('')).toBe(false)
    expect(isDarkBackgroundColor('not-a-color')).toBe(false)
    expect(relativeLuminance('#ffffff')).toBeCloseTo(1)
  })
})

describe('mermaid sandbox renderer', () => {
  const bridge = read('src/renderer/editor/mermaid-bridge.ts')
  const sandbox = read('src/renderer/sandbox/mermaid-sandbox.ts')
  const view = read('src/renderer/editor/mermaid-view.ts')
  const viteConfig = read('electron.vite.config.ts')

  it('sandboxes the iframe with allow-scripts and never allows same-origin', () => {
    // 红线：沙箱 iframe 只开放脚本执行，绝不同时开放 allow-same-origin
    expect(bridge).toContain("iframe.setAttribute('sandbox', 'allow-scripts')")
    expect(bridge).not.toContain('allow-same-origin')
  })

  it('renders mermaid with securityLevel strict inside the isolated entry', () => {
    // strict 级别禁止 SVG 输出里的 HTML 标签/事件注入
    expect(sandbox).toContain("securityLevel: 'strict'")
    expect(sandbox).toContain("from 'mermaid'")
  })

  it('keeps mermaid out of the main bundle via a dedicated vite input', () => {
    // mermaid 只能出现在沙箱入口 chunk，主包零加载（参照 docx 的 chunks 模式）
    expect(viteConfig).toContain("'mermaid-sandbox': resolve(__dirname, 'src/renderer/mermaid-sandbox.html')")
    expect(view).not.toContain("from 'mermaid'")
    expect(bridge).not.toContain("from 'mermaid'")
    expect(read('src/renderer/editor/editor.ts')).not.toContain("from 'mermaid'")
  })

  it('debounces re-renders by 400ms and recovers from hung renders after 15s', () => {
    expect(view).toContain('const RENDER_DEBOUNCE_MS = 400')
    expect(bridge).toContain('const RENDER_TIMEOUT_MS = 15_000')
    expect(bridge).toContain('destroyIframe()')
  })

  it('ignores node-view internal mutations to prevent the CPU rebuild storm', () => {
    // 防回归红线：SVG 替换等内部 mutation 不能让 ProseMirror 重绘 node view
    expect(view).toContain('ignoreMutation: (mutation) => mutation.target !== code && !code.contains(mutation.target)')
  })

  it('only renders blocks whose language is mermaid', () => {
    expect(view).toContain("=== 'mermaid'")
  })

  it('registers the mermaid node view in the editor', () => {
    expect(read('src/renderer/editor/editor.ts')).toContain('.use(mermaidView)')
  })
})
