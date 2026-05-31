import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('CJK typography cleanup integration', () => {
  it('ships an Edit menu command through preload to the renderer', () => {
    const mainProcess = readFileSync(join(process.cwd(), 'src/main/index.ts'), 'utf8')
    const preload = readFileSync(join(process.cwd(), 'src/preload/index.ts'), 'utf8')
    const renderer = readFileSync(join(process.cwd(), 'src/renderer/main.ts'), 'utf8')

    expect(mainProcess).toContain('清理中英排版')
    expect(mainProcess).toContain("shortcutFor('cleanCjkTypography')")
    expect(mainProcess).toContain("sendToFocused('menu-clean-cjk-typography')")
    expect(preload).toContain('onMenuCleanCjkTypography')
    expect(renderer).toContain('formatCjkTypography(')
    expect(renderer).toContain('api.onMenuCleanCjkTypography')
  })

  it('lives under Format menu, not Tools or AI', () => {
    const mainProcess = readFileSync(join(process.cwd(), 'src/main/index.ts'), 'utf8')
    const html = readFileSync(join(process.cwd(), 'src/renderer/index.html'), 'utf8')

    // CJK menu is under 格式 (Format), not under 工具 (Tools)
    const formatMenuStart = mainProcess.indexOf('label: \'格式\'')
    const toolsMenuStart = mainProcess.indexOf('label: \'工具\'')
    const cjkPosition = mainProcess.indexOf('清理中英排版')
    expect(formatMenuStart).toBeLessThan(cjkPosition)
    expect(toolsMenuStart).toBeGreaterThan(cjkPosition)

    // Windows menu: CJK is under format panel, not tools panel
    const formatPanelStart = html.indexOf('data-windows-panel="format"')
    const toolsPanelStart = html.indexOf('data-windows-panel="tools"')
    const cleanCjkPos = html.indexOf('data-windows-action="clean-cjk"')
    expect(formatPanelStart).toBeLessThan(cleanCjkPos)
    expect(toolsPanelStart).toBeGreaterThan(cleanCjkPos)
  })

  it('is not included in default AI palette templates', () => {
    const renderer = readFileSync(join(process.cwd(), 'src/renderer/main.ts'), 'utf8')

    // Default AI templates: polish, expand, summarize — no CJK
    const defaultTemplates = renderer.match(/templates:\s*\[[\s\S]*?\n\s*\]/g)
    if (defaultTemplates && defaultTemplates.length > 0) {
      for (const templateBlock of defaultTemplates) {
        expect(templateBlock).not.toMatch(/cjk|中英|排版|清理|typography/i)
      }
    }

    // cleanCjk and aiPalette shortcuts are separate
    expect(renderer).toContain("cleanCjkTypography:")
    expect(renderer).toContain("openAiPalette:")
  })
})
