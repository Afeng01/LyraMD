import mermaid from 'mermaid'

// 运行在隐藏沙箱 iframe 里。mermaid 在此静态导入，因此只打进本入口的
// chunk——主应用永远不会加载它。

type RenderRequest = { type: 'render'; id: number; code: string; theme: 'default' | 'dark'; bg?: string }

const BASE_CONFIG = {
  startOnLoad: false,
  securityLevel: 'strict' as const,
  // 沙箱 iframe 不继承应用字体；不显式指定 CJK 字体族时，mermaid 对中文
  // 标签的测量会偏小导致纵向裁切。
  fontFamily: '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif',
  themeCSS: `
    .nodeLabel { line-height: 1.45; padding: 2px 3px; }
    .edgeLabel { line-height: 1.45; padding: 1px 3px; }
  `,
}

mermaid.initialize({ ...BASE_CONFIG, theme: 'default' })

window.addEventListener('message', (event) => {
  const data = event.data as RenderRequest | undefined
  if (!data || data.type !== 'render' || typeof data.id !== 'number' || typeof data.code !== 'string') return

  // 边线标签默认带遮罩底色；对齐到编辑器的代码块背景色，避免标签显示成突兀的色块。
  mermaid.initialize({
    ...BASE_CONFIG,
    theme: data.theme === 'dark' ? 'dark' : 'default',
    themeVariables: { edgeLabelBackground: data.bg || 'transparent' },
  })
  mermaid.render(`mermaid-sandbox-${data.id}`, data.code)
    .then(({ svg }) => {
      window.parent.postMessage({ type: 'result', id: data.id, ok: true, svg }, '*')
    })
    .catch((reason: unknown) => {
      const message = reason instanceof Error ? reason.message : String(reason)
      window.parent.postMessage({ type: 'result', id: data.id, ok: false, error: message }, '*')
    })
})

window.parent.postMessage({ type: 'ready' }, '*')
