// 主题背景亮度判断：Mermaid 渲染需要根据代码块底色选择 light/dark 配色。
// 纯字符串解析（无 DOM 依赖），便于在 node 环境下直接单测。

function parseColorChannel(value: string): number | null {
  const parsed = Number.parseInt(value.trim(), 10)
  return Number.isFinite(parsed) ? Math.max(0, Math.min(255, parsed)) : null
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

// 相对亮度（WCAG）：>0.5 视为浅色底。
export function relativeLuminance(cssColor: string): number | null {
  const color = cssColor.trim().toLowerCase()
  if (!color || color === 'transparent' || color === 'none') return null

  // #rgb / #rrggbb
  if (color.startsWith('#')) {
    const hex = color.slice(1)
    if (hex.length === 3) {
      const channels = [...hex].map((ch) => Number.parseInt(ch + ch, 16))
      if (channels.some((ch) => !Number.isFinite(ch))) return null
      return clamp01((0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!) / 255)
    }
    if (hex.length === 6 || hex.length === 8) {
      const r = Number.parseInt(hex.slice(0, 2), 16)
      const g = Number.parseInt(hex.slice(2, 4), 16)
      const b = Number.parseInt(hex.slice(4, 6), 16)
      if ([r, g, b].some((ch) => !Number.isFinite(ch))) return null
      // 忽略 alpha 通道：代码块底色的透明度不影响明暗判断的主观一致性
      return clamp01((0.2126 * r + 0.7152 * g + 0.0722 * b) / 255)
    }
    return null
  }

  // rgb()/rgba()
  const rgbMatch = /^rgba?\(([^)]+)\)$/.exec(color)
  if (rgbMatch?.[1]) {
    const parts = rgbMatch[1].split(/[\s,/]+/).filter(Boolean)
    if (parts.length < 3) return null
    const r = parseColorChannel(parts[0]!)
    const g = parseColorChannel(parts[1]!)
    const b = parseColorChannel(parts[2]!)
    if (r == null || g == null || b == null) return null
    return clamp01((0.2126 * r + 0.7152 * g + 0.0722 * b) / 255)
  }

  return null
}

// 判断给定的 CSS 颜色是否属于深色背景。解析失败时按浅色处理（回退 default 主题）。
export function isDarkBackgroundColor(cssColor: string): boolean {
  const luminance = relativeLuminance(cssColor)
  return luminance != null && luminance < 0.5
}
