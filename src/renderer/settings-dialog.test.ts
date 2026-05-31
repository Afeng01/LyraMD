import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { resolveShortcutConflict } from './settings-dialog'

describe('settings dialog regression', () => {
  it('keeps renderer-side default app settings aligned with persisted theme support', () => {
    const file = readFileSync(join(process.cwd(), 'src/renderer/main.ts'), 'utf8')

    expect(file).toContain("themeName: 'elegant'")
  })

  it('does not depend on window.process when formatting shortcut recordings', () => {
    const file = readFileSync(join(process.cwd(), 'src/renderer/settings-dialog.ts'), 'utf8')

    expect(file).not.toContain('window.process.platform')
  })

  it('persists theme changes through the shared app settings channel', () => {
    const file = readFileSync(join(process.cwd(), 'src/renderer/settings-dialog.ts'), 'utf8')

    expect(file).toContain('api.updateSettings({ themeName')
  })

  it('persists recorded shortcut changes through the shared app settings channel', () => {
    const file = readFileSync(join(process.cwd(), 'src/renderer/settings-dialog.ts'), 'utf8')
    const html = readFileSync(join(process.cwd(), 'src/renderer/index.html'), 'utf8')

    expect(html).toContain('data-shortcut-action="cleanCjkTypography"')
    expect(html).toContain('data-shortcut-action="openAiPalette"')
    expect(file).toContain('api.updateSettings({ shortcuts:')
  })

  it('detects shortcut conflicts before persisting a recorded shortcut', () => {
    const shortcuts = {
      save: 'CmdOrCtrl+S',
      saveAs: 'CmdOrCtrl+Shift+S',
      settings: 'CmdOrCtrl+,',
      search: 'CmdOrCtrl+F',
      toggleSidebar: 'CmdOrCtrl+\\',
      toggleOutline: 'CmdOrCtrl+Shift+O',
      cleanCjkTypography: 'CmdOrCtrl+Shift+F',
      openAiPalette: 'CmdOrCtrl+J',
    }

    expect(resolveShortcutConflict(shortcuts, 'cleanCjkTypography', 'CmdOrCtrl+F')).toBe('search')
    expect(resolveShortcutConflict(shortcuts, 'search', 'CmdOrCtrl+F')).toBeNull()
  })

  it('renders an inline shortcut conflict message target', () => {
    const file = readFileSync(join(process.cwd(), 'src/renderer/settings-dialog.ts'), 'utf8')
    const html = readFileSync(join(process.cwd(), 'src/renderer/index.html'), 'utf8')

    expect(html).toContain('id="settings-shortcut-conflict"')
    expect(file).toContain('showShortcutConflict')
  })

  it('renders Codex MCP as a standalone integrations pane', () => {
    const file = readFileSync(join(process.cwd(), 'src/renderer/settings-dialog.ts'), 'utf8')
    const html = readFileSync(join(process.cwd(), 'src/renderer/index.html'), 'utf8')

    expect(html).toContain('data-settings-pane="integrations"')
    expect(html).toContain('data-settings-panel="integrations"')
    expect(html).toContain('集成与终端')
    expect(html).toContain('Codex MCP')
    expect(file).toContain("activePane === 'integrations'")
  })

  it('separates basic and advanced settings in the navigation', () => {
    const file = readFileSync(join(process.cwd(), 'src/renderer/settings-dialog.ts'), 'utf8')
    const html = readFileSync(join(process.cwd(), 'src/renderer/index.html'), 'utf8')
    const css = readFileSync(join(process.cwd(), 'src/renderer/themes/base.css'), 'utf8')

    expect(html).toContain('<div class="settings-nav-section-label">基础</div>')
    expect(html).toContain('<div class="settings-nav-section-label advanced">进阶</div>')
    expect(file).toContain("kicker: '进阶'")
    expect(css).toContain('.settings-nav-section-label')
  })

  it('renders Codex MCP usage help and keeps integration controls compact', () => {
    const html = readFileSync(join(process.cwd(), 'src/renderer/index.html'), 'utf8')
    const css = readFileSync(join(process.cwd(), 'src/renderer/themes/base.css'), 'utf8')

    expect(html).toContain('settings-integration-help')
    expect(html).toContain('LyraMD 使用指南')
    expect(html).toContain('在 LyraMD 中写笔记，保持当前文档打开')
    expect(html).toContain('在 Codex 里请求它使用 LyraMD MCP 读取或写入当前文档')
    expect(css).toContain('-webkit-app-region: drag')
    expect(css).toContain('text-overflow: ellipsis')
    expect(css).toContain('white-space: nowrap')
    expect(css).toContain('settings-usage-guide')
  })

  it('removes background controls and renders bottom status visibility control', () => {
    const file = readFileSync(join(process.cwd(), 'src/renderer/settings-dialog.ts'), 'utf8')
    const html = readFileSync(join(process.cwd(), 'src/renderer/index.html'), 'utf8')

    expect(html).not.toContain('name="settings-background-scope"')
    expect(html).not.toContain('name="settings-background-mode"')
    expect(html).not.toContain('id="settings-background-opacity"')
    expect(html).not.toContain('id="settings-background-reset"')
    expect(html).toContain('id="settings-show-document-stats"')
    expect(html).toContain('显示字数与 AI 状态')
    expect(file).toContain('updateShowDocumentStats')
    expect(file).toContain('api.updateSettings({ showDocumentStats')
  })

  it('opens settings from buttons and shortcuts instead of toggling an already open dialog closed', () => {
    const file = readFileSync(join(process.cwd(), 'src/renderer/main.ts'), 'utf8')

    expect(file).toContain('settingsDialog.open()')
    expect(file).not.toContain('settingsDialog.toggle()')
  })

  it('renders editor font controls and persists font settings through app settings', () => {
    const file = readFileSync(join(process.cwd(), 'src/renderer/settings-dialog.ts'), 'utf8')
    const html = readFileSync(join(process.cwd(), 'src/renderer/index.html'), 'utf8')
    const css = readFileSync(join(process.cwd(), 'src/renderer/themes/base.css'), 'utf8')

    expect(html).toContain('id="settings-font-preset"')
    expect(html).toContain('id="settings-font-custom"')
    expect(html).toContain('value="theme"')
    expect(html).toContain('value="custom"')
    expect(file).toContain('api.updateSettings({ font:')
    expect(css).toContain('--theme-editor-font-family')
    expect(css).toContain('--lyra-editor-font-family')
  })

  it('renders AI helper prompt template controls and persists templates through app settings', () => {
    const file = readFileSync(join(process.cwd(), 'src/renderer/settings-dialog.ts'), 'utf8')
    const html = readFileSync(join(process.cwd(), 'src/renderer/index.html'), 'utf8')
    const css = readFileSync(join(process.cwd(), 'src/renderer/themes/base.css'), 'utf8')

    expect(html).toContain('id="settings-ai-template-list"')
    expect(html).toContain('id="settings-ai-template-add"')
    expect(html).toContain('id="settings-ai-template-delete"')
    expect(html).toContain('id="settings-ai-template-title"')
    expect(html).toContain('id="settings-ai-template-prompt"')
    expect(html).not.toContain('data-settings-ai-template="polish">润色</button>')
    expect(file).toContain('renderAiTemplateButtons')
    expect(file).toContain('createCustomAiTemplate')
    expect(file).toContain('deleteSelectedCustomAiPromptTemplate')
    expect(file).toContain('isBuiltInAiTemplate')
    expect(file).toContain('updateAiHelperSettings')
    expect(file).toContain('api.updateSettings({ aiHelper')
    expect(file).toContain("id: 'expand'")
    expect(file).toContain("id: 'vivid'")
    expect(css).toContain('.settings-ai-template-list')
  })

  it('renders OpenAI-compatible AI helper provider controls', () => {
    const file = readFileSync(join(process.cwd(), 'src/renderer/settings-dialog.ts'), 'utf8')
    const html = readFileSync(join(process.cwd(), 'src/renderer/index.html'), 'utf8')

    expect(html).toContain('id="settings-ai-base-url"')
    expect(html).toContain('id="settings-ai-api-key"')
    expect(html).toContain('id="settings-ai-model"')
    expect(html).toContain('id="settings-ai-test"')
    expect(html).toContain('id="settings-ai-test-status"')
    expect(file).toContain('testAiHelperConnection')
    expect(file).toContain('updateAiHelperProviderSettings')
  })

  it('keeps the settings window draggable without the heavy pane title chrome', () => {
    const file = readFileSync(join(process.cwd(), 'src/renderer/settings-dialog.ts'), 'utf8')
    const html = readFileSync(join(process.cwd(), 'src/renderer/index.html'), 'utf8')
    const css = readFileSync(join(process.cwd(), 'src/renderer/themes/base.css'), 'utf8')

    expect(html).not.toContain('class="settings-window-controls"')
    expect(html).not.toContain('settings-window-dot')
    expect(file).toContain('initSettingsDialogDrag')
    expect(css).not.toContain('.settings-window-controls')
    expect(css).not.toContain('settings-pane-kicker')
  })

  it('explains how to use OpenAI-compatible AI helper settings', () => {
    const html = readFileSync(join(process.cwd(), 'src/renderer/index.html'), 'utf8')

    expect(html).toContain('AI 精灵怎么用')
    expect(html).toContain('OpenAI 官方账号')
    expect(html).toContain('cpa/new-api')
    expect(html).toContain('选中文本后按 Cmd/Ctrl+J')
    expect(html).not.toContain('按 Cmd/Ctrl+Y')
  })

  it('applies background settings through renderer CSS variables', () => {
    const renderer = readFileSync(join(process.cwd(), 'src/renderer/main.ts'), 'utf8')
    const css = readFileSync(join(process.cwd(), 'src/renderer/themes/base.css'), 'utf8')

    expect(renderer).toContain('function applyBackgroundSettings')
    expect(renderer).toContain("root.dataset.backgroundScope = background.scope")
    expect(renderer).toContain("--lyra-bg-image")
    expect(css).toContain(':root[data-background-scope="editor"]')
    expect(css).toContain(':root[data-background-scope="window"]')
    expect(css).toContain('#app-shell.agent-drawer-open #editor-shell')
  })
})
