/**
 * 导出 HTML 的样式收集与文档组装。
 *
 * 设计取舍：导出件的样式不再维护一份手写子集，而是从已加载的样式表里按
 * 选择器筛选。手写子集的问题是会随编辑器新增功能持续漂移——`mark`
 * （`==高亮==`）和任务列表的样式之前就一直漏在导出之外。
 *
 * 只保留两类规则：
 *   1. 主题 token 块（:root / body / body.theme-*），决定配色与主题字体；
 *   2. 选择器落在 .ProseMirror 上的内容排版规则，覆盖标题、代码块、表格、
 *      高亮、任务列表等全部正文元素。
 * 应用外壳（标题栏、侧边栏、面板、窗口布局约束）一律不带出去，改由
 * EXPORT_SHELL_STYLES 重建一个中性的阅读排版环境。
 */

const RULE_TYPE_STYLE = 1
const RULE_TYPE_MEDIA = 4
const RULE_TYPE_SUPPORTS = 12

/** 只描述我们真正读取的 CSSOM 字段，便于在 node 环境用假对象做测试。 */
export interface MinimalCssRule {
  type: number
  selectorText?: string
  cssText?: string
  cssRules?: ArrayLike<MinimalCssRule>
  conditionText?: string
  mediaText?: string
}

export interface MinimalStyleSheet {
  cssRules?: ArrayLike<MinimalCssRule>
}

const THEME_TOKEN_SELECTOR_PATTERN = /^(?:html|body|:root|body\.theme-[a-z-]+)$/
const EDITOR_CONTENT_SELECTOR = '.ProseMirror'

/**
 * 导出件必须自建的外壳：base.css 把 html/body 锁成 `height:100%` +
 * `overflow:hidden` 的桌面应用布局，直接沿用会把导出的网页压在一屏里。
 * 这段放在收集到的样式之后，用同优先级后置覆盖把布局放回普通文档流。
 */
const EXPORT_SHELL_STYLES = `/* LyraMD 导出件外壳：还原普通网页排版，去掉应用窗口布局约束 */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html, body { height: auto; overflow: visible; }
body {
  min-width: 320px;
  background: var(--bg-color, #ffffff);
  color: var(--text-color, #24292f);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans', Helvetica, Arial, sans-serif;
}
#editor { position: static; padding: 0 40px; }
#editor .ProseMirror { min-height: 0; padding: 40px 0 60px; }`

/**
 * 判断一条样式规则是否属于导出件。选择器列表里只要有一段命中即整条保留，
 * 因为逗号列表中的各段在导出页里同样有效。
 */
export function isExportRelevantSelector(selectorText: string): boolean {
  return selectorText
    .split(',')
    .map((selectorPart) => selectorPart.replace(/\s+/g, ' ').trim())
    .some(
      (selectorPart) =>
        selectorPart.includes(EDITOR_CONTENT_SELECTOR) ||
        THEME_TOKEN_SELECTOR_PATTERN.test(selectorPart),
    )
}

function collectRuleText(rules: ArrayLike<MinimalCssRule>): string[] {
  const collectedRules: string[] = []

  for (let index = 0; index < rules.length; index += 1) {
    const rule = rules[index]

    if (rule.type === RULE_TYPE_STYLE) {
      const selectorText = rule.selectorText
      if (selectorText && isExportRelevantSelector(selectorText) && rule.cssText) {
        collectedRules.push(rule.cssText)
      }
      continue
    }

    if (rule.type === RULE_TYPE_MEDIA || rule.type === RULE_TYPE_SUPPORTS) {
      if (!rule.cssRules) continue
      // 条件块只保留命中的内层规则，避免把整段响应式外壳搬进导出件
      const innerRules = collectRuleText(rule.cssRules)
      if (innerRules.length === 0) continue
      const condition = rule.conditionText ?? rule.mediaText ?? ''
      if (!condition) continue
      const atRuleName = rule.type === RULE_TYPE_MEDIA ? '@media' : '@supports'
      collectedRules.push(`${atRuleName} ${condition} {\n${innerRules.join('\n')}\n}`)
    }
  }

  return collectedRules
}

/**
 * 从已加载的样式表里收集导出件需要的 CSS 文本。
 * 读不到规则的样式表（例如跨源）会被跳过，不影响导出。
 */
export function collectExportStyles(styleSheets: ArrayLike<MinimalStyleSheet>): string {
  const collectedChunks: string[] = []

  for (let index = 0; index < styleSheets.length; index += 1) {
    try {
      // 跨源样式表读 cssRules 会抛 SecurityError，跳过即可
      const rules = styleSheets[index]?.cssRules
      if (!rules) continue
      collectedChunks.push(...collectRuleText(rules))
    } catch {
      continue
    }
  }

  return [...collectedChunks, EXPORT_SHELL_STYLES].join('\n')
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const replacements: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }
    return replacements[character] ?? character
  })
}

export interface ExportDocumentOptions {
  title: string
  bodyClass: string
  contentHtml: string
  styles: string
}

/**
 * 组装自包含的导出页。正文包在 `#editor > .ProseMirror` 里，因为收集到的
 * 内容样式都带这个前缀。
 */
export function renderExportDocument(options: ExportDocumentOptions): string {
  const title = escapeHtml(options.title.trim() || 'LyraMD Export')

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>
${options.styles}
</style>
</head>
<body class="${escapeHtml(options.bodyClass)}">
<div id="editor"><div class="ProseMirror">${options.contentHtml}</div></div>
</body>
</html>
`
}
