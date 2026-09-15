import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  collectExportStyles,
  isExportRelevantSelector,
  renderExportDocument,
  type MinimalCssRule,
  type MinimalStyleSheet,
} from './export-html'

const RULE_STYLE = 1
const RULE_MEDIA = 4

function styleRule(selectorText: string, body = 'color: red;'): MinimalCssRule {
  return { type: RULE_STYLE, selectorText, cssText: `${selectorText} { ${body} }` }
}

describe('export html style selection', () => {
  it('keeps editor content rules and theme token blocks', () => {
    expect(isExportRelevantSelector('#editor .ProseMirror mark')).toBe(true)
    expect(isExportRelevantSelector('.ProseMirror')).toBe(true)
    expect(isExportRelevantSelector(':root')).toBe(true)
    expect(isExportRelevantSelector('body')).toBe(true)
    expect(isExportRelevantSelector('body.theme-elegant')).toBe(true)
    expect(isExportRelevantSelector('body, body.theme-light')).toBe(true)
    expect(isExportRelevantSelector('html, body')).toBe(true)
  })

  it('keeps a rule when any part of a comma list is relevant', () => {
    expect(
      isExportRelevantSelector('#sidebar .ProseMirror-placeholder, .ProseMirror pre'),
    ).toBe(true)
  })

  it('drops application chrome and window layout rules', () => {
    expect(isExportRelevantSelector('#titlebar')).toBe(false)
    expect(isExportRelevantSelector('.window-control')).toBe(false)
    expect(isExportRelevantSelector('#app-shell.agent-drawer-open #agent-drawer')).toBe(false)
    expect(isExportRelevantSelector('#settings-dialog')).toBe(false)
    expect(isExportRelevantSelector('body.platform-win32 #sidebar-toggle')).toBe(false)
  })
})

describe('export html stylesheet collection', () => {
  it('collects only relevant rules and appends the export shell', () => {
    const styleSheets: MinimalStyleSheet[] = [
      {
        cssRules: [
          styleRule('#editor .ProseMirror h1'),
          styleRule('#titlebar'),
          styleRule('body.theme-dark'),
        ],
      },
    ]

    const styles = collectExportStyles(styleSheets)

    expect(styles).toContain('#editor .ProseMirror h1')
    expect(styles).toContain('body.theme-dark')
    expect(styles).not.toContain('#titlebar')
    // 外壳必须在收集到的样式之后，才能用同优先级后置覆盖桌面布局
    expect(styles.indexOf('LyraMD 导出件外壳')).toBeGreaterThan(
      styles.indexOf('#editor .ProseMirror h1'),
    )
    expect(styles).toContain('html, body { height: auto; overflow: visible; }')
  })

  it('keeps only matching inner rules inside a media query', () => {
    const styleSheets: MinimalStyleSheet[] = [
      {
        cssRules: [
          {
            type: RULE_MEDIA,
            mediaText: '(max-width: 840px)',
            cssRules: [styleRule('#editor .ProseMirror'), styleRule('#sidebar')],
          },
        ],
      },
    ]

    const styles = collectExportStyles(styleSheets)

    expect(styles).toContain('@media (max-width: 840px)')
    expect(styles).toContain('#editor .ProseMirror { color: red; }')
    expect(styles).not.toContain('#sidebar')
  })

  it('omits a media query that has no relevant inner rule', () => {
    const styleSheets: MinimalStyleSheet[] = [
      {
        cssRules: [
          {
            type: RULE_MEDIA,
            mediaText: '(max-width: 600px)',
            cssRules: [styleRule('#sidebar')],
          },
        ],
      },
    ]

    expect(collectExportStyles(styleSheets)).not.toContain('@media')
  })

  it('skips stylesheets whose rules cannot be read', () => {
    const styleSheets: MinimalStyleSheet[] = [
      {
        get cssRules(): ArrayLike<MinimalCssRule> {
          throw new Error('SecurityError')
        },
      },
      { cssRules: [styleRule('.ProseMirror')] },
    ]

    expect(collectExportStyles(styleSheets)).toContain('.ProseMirror { color: red; }')
  })
})

describe('export html document', () => {
  it('wraps content in the editor subtree the collected styles target', () => {
    const html = renderExportDocument({
      title: '我的文稿',
      bodyClass: 'theme-elegant',
      contentHtml: '<p>正文</p>',
      styles: '.ProseMirror { color: red; }',
    })

    expect(html).toContain('<!doctype html>')
    expect(html).toContain('<title>我的文稿</title>')
    expect(html).toContain('<body class="theme-elegant">')
    expect(html).toContain('<div id="editor"><div class="ProseMirror"><p>正文</p></div></div>')
    expect(html).toContain('.ProseMirror { color: red; }')
  })

  it('escapes the title and body class and falls back for an empty title', () => {
    const html = renderExportDocument({
      title: '  ',
      bodyClass: 'theme-custom"><script>',
      contentHtml: '',
      styles: '',
    })

    expect(html).toContain('<title>LyraMD Export</title>')
    expect(html).not.toContain('<script>')
    expect(html).toContain('&quot;&gt;&lt;script&gt;')
  })
})

describe('export html regression against the shipped theme', () => {
  const baseCss = readFileSync(
    join(process.cwd(), 'src/renderer/themes/base.css'),
    'utf8',
  )

  it('covers highlight and task list styles that the old hand-written subset missed', () => {
    // 这两类元素之前不在导出样式里：==高亮== 的 mark 与 GFM 任务列表
    expect(isExportRelevantSelector('#editor .ProseMirror mark')).toBe(true)
    expect(
      isExportRelevantSelector('#editor .ProseMirror li[data-item-type="task"]'),
    ).toBe(true)
    expect(baseCss).toContain('#editor .ProseMirror mark')
    expect(baseCss).toContain('li[data-item-type="task"]')
  })

  it('can address every editor content selector shipped in base.css', () => {
    const selectorLines = baseCss.match(/^[^{}\n][^{}]*?\{/gm) ?? []
    const contentSelectors = selectorLines
      .map((line) => line.slice(0, -1).trim())
      .filter((selector) => selector.includes('.ProseMirror'))

    expect(contentSelectors.length).toBeGreaterThan(30)
    for (const selector of contentSelectors) {
      expect(isExportRelevantSelector(selector)).toBe(true)
    }
  })
})

describe('export html wiring', () => {
  const renderer = readFileSync(join(process.cwd(), 'src/renderer/main.ts'), 'utf8')

  it('routes HTML export through the shared module', () => {
    expect(renderer).toContain("from './export-html'")
    expect(renderer).toContain('collectExportStyles(document.styleSheets)')
    expect(renderer).toContain('renderExportDocument(')
  })

  it('no longer carries a hand-written style subset for the export', () => {
    // 旧的导出实现自己拼一段 'body{max-width:780px...' 的样式子集，
    // 并用 getElColor 逐个探元素颜色；现在全部改为从主题样式表筛选
    expect(renderer).not.toContain('body{max-width:780px')
    expect(renderer).not.toContain('getElColor')
    expect(renderer).not.toContain('getComputedStyle(document.body)')
  })
})
