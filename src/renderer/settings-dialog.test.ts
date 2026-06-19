import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { buildFeedbackIssueUrl, resolveShortcutConflict } from './settings-dialog'

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

  it('applies detached settings theme updates in editor windows', () => {
    const renderer = readFileSync(join(process.cwd(), 'src/renderer/main.ts'), 'utf8')

    expect(renderer).toContain('async function applyConfiguredTheme')
    expect(renderer).toContain('await applyConfiguredTheme(appSettings.themeName)')
    expect(renderer).toContain('api.onSettingsChanged((settings) => {')
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

  it('renders feedback as a standalone settings pane below integrations', () => {
    const file = readFileSync(join(process.cwd(), 'src/renderer/settings-dialog.ts'), 'utf8')
    const html = readFileSync(join(process.cwd(), 'src/renderer/index.html'), 'utf8')

    expect(html).toContain('data-settings-pane="integrations"')
    expect(html).toContain('data-settings-pane="feedback"')
    expect(html.indexOf('data-settings-pane="feedback"')).toBeGreaterThan(html.indexOf('data-settings-pane="integrations"'))
    expect(html).toContain('data-settings-panel="feedback"')
    expect(html).toContain('id="settings-feedback-submit"')
    expect(file).toContain("feedback: {")
  })

  it('renders release notes as a settings pane below feedback', () => {
    const file = readFileSync(join(process.cwd(), 'src/renderer/settings-dialog.ts'), 'utf8')
    const html = readFileSync(join(process.cwd(), 'src/renderer/index.html'), 'utf8')
    const css = readFileSync(join(process.cwd(), 'src/renderer/themes/base.css'), 'utf8')

    expect(html).toContain('data-settings-pane="feedback"')
    expect(html).toContain('data-settings-pane="release-notes"')
    expect(html.indexOf('data-settings-pane="release-notes"')).toBeGreaterThan(html.indexOf('data-settings-pane="feedback"'))
    expect(html).toContain('data-settings-panel="release-notes"')
    expect(html).toContain('更新日志')
    expect(html).toContain('LyraMD 1.3.7')
    expect(html).toContain('LyraMD 1.3.6')
    expect(html).toContain('LyraMD 1.3.5')
    expect(html).toContain('LyraMD 1.3.0')
    expect(html).toContain('LyraMD 1.2.1')
    expect(html).toContain('LyraMD 1.2.0')
    expect(html).toContain('LyraMD 1.0.3')
    expect(html).toContain('LyraMD 没有单独发布 1.1.x 公开 tag')
    expect(file).toContain("'release-notes'")
    expect(css).toContain('.settings-release-notes')
  })

  it('builds a prefilled GitHub issue URL without requiring a local GitHub token', () => {
    const url = buildFeedbackIssueUrl({
      type: 'bug',
      title: '侧栏拖拽异常',
      description: '拖动侧栏时会选中文本。',
      includeDiagnostics: true,
      diagnostics: {
        themeName: 'elegant',
        userAgent: 'Vitest',
      },
    })

    expect(url.startsWith('https://github.com/Afeng01/LyraMD/issues/new?')).toBe(true)
    expect(decodeURIComponent(url)).toContain('侧栏拖拽异常')
    expect(decodeURIComponent(url)).toContain('拖动侧栏时会选中文本。')
    expect(decodeURIComponent(url)).toContain('主题：elegant')
    expect(decodeURIComponent(url)).toContain('User Agent：Vitest')
    expect(url).not.toContain('token')
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

  it('documents recent backup and crash recovery entry points in general settings', () => {
    const file = readFileSync(join(process.cwd(), 'src/renderer/settings-dialog.ts'), 'utf8')
    const html = readFileSync(join(process.cwd(), 'src/renderer/index.html'), 'utf8')

    expect(file).toContain('本地备份和恢复入口')
    expect(html).toContain('本地备份与恢复怎么找')
    expect(html).toContain('点击“最近备份”即可展开当前文稿的本地历史')
    expect(html).toContain('点“恢复为草稿”会新建一份草稿，不覆盖当前文稿')
    expect(html).toContain('点“恢复为新草稿”即可把崩溃前最后一次快照找回来')
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
    expect(html).toContain('class="settings-ai-template-actions"')
    expect(html).toContain('class="settings-ai-template-delete-zone"')
    expect(html).toContain('settings-ai-template-action add')
    expect(html).toContain('settings-ai-template-action delete')
    expect(html).toContain('id="settings-ai-template-title"')
    expect(html).toContain('id="settings-ai-template-prompt"')
    expect(html).not.toContain('data-settings-ai-template="polish">润色</button>')
    expect(file).toContain('renderAiTemplateButtons')
    expect(file).toContain('getAiTemplateCategory')
    expect(file).toContain('settings-ai-template-group')
    expect(file).toContain('createCustomAiTemplate')
    expect(file).toContain('deleteSelectedCustomAiPromptTemplate')
    expect(file).toContain('isBuiltInAiTemplate')
    expect(file).toContain('updateAiHelperSettings')
    expect(file).toContain('api.updateSettings({ aiHelper')
    expect(file).toContain("id: 'expand'")
    expect(file).toContain("id: 'vivid'")
    expect(css).toContain('.settings-ai-template-list')
    expect(css).toContain('.settings-ai-template-group')
    expect(css).toContain('.settings-ai-template-delete-zone')
  })

  it('renders OpenAI-compatible AI helper provider controls', () => {
    const file = readFileSync(join(process.cwd(), 'src/renderer/settings-dialog.ts'), 'utf8')
    const html = readFileSync(join(process.cwd(), 'src/renderer/index.html'), 'utf8')

    expect(html).toContain('id="settings-ai-base-url"')
    expect(html).toContain('id="settings-ai-api-key"')
    expect(html).toContain('id="settings-ai-model"')
    expect(html).toContain('id="settings-ai-test"')
    expect(html).toContain('id="settings-ai-test-status"')
    expect(html).toContain('id="settings-ai-provider-panel"')
    expect(html).toContain('data-ai-provider-preset="openai"')
    expect(html).toContain('data-ai-provider-preset="claude-gateway"')
    expect(html).toContain('data-ai-provider-preset="custom-gateway"')
    expect(html).toContain('id="settings-ai-test-toast"')
    expect(html).toContain('id="settings-ai-test-toast-close"')
    expect(file).toContain('testAiHelperConnection')
    expect(file).toContain('aiTestToastOpen')
    expect(file).toContain('applyAiProviderPreset')
    expect(file).toContain('resolveAiProviderPreset')
    expect(file).toContain('customProvider')
    expect(file).toContain("resolveAiProviderPreset(provider) === 'custom-gateway'")
    expect(file).toContain('const currentProvider = readAiProviderSettingsFromInputs()')
    expect(file).toContain('updateAiHelperProviderSettings')
  })

  it('shows AI connection progress and results in a top toast instead of blocking the settings pane', () => {
    const file = readFileSync(join(process.cwd(), 'src/renderer/settings-dialog.ts'), 'utf8')
    const css = readFileSync(join(process.cwd(), 'src/renderer/themes/base.css'), 'utf8')

    expect(file).toContain('aiTestStatus.hidden = true')
    expect(file).toContain('showAiTestToast')
    expect(css).toContain('#settings-dialog {\n  position: relative;')
    expect(css).toContain('.settings-ai-test-toast {\n  position: absolute;')
    expect(css).toContain('top: 48px')
    expect(css).toContain('transform: translateX(-50%)')
    expect(css).toContain('.settings-ai-test-toast.error')
  })

  it('opens settings in a detached resizable window instead of scaling with the editor', () => {
    const file = readFileSync(join(process.cwd(), 'src/renderer/settings-dialog.ts'), 'utf8')
    const renderer = readFileSync(join(process.cwd(), 'src/renderer/main.ts'), 'utf8')
    const html = readFileSync(join(process.cwd(), 'src/renderer/index.html'), 'utf8')
    const css = readFileSync(join(process.cwd(), 'src/renderer/themes/base.css'), 'utf8')
    const main = readFileSync(join(process.cwd(), 'src/main/index.ts'), 'utf8')
    const preload = readFileSync(join(process.cwd(), 'src/preload/index.ts'), 'utf8')

    expect(html).not.toContain('class="settings-window-controls"')
    expect(html).not.toContain('settings-window-dot')
    expect(file).not.toContain('initSettingsDialogDrag')
    expect(renderer).toContain('openSettingsSurface')
    expect(renderer).toContain('api.openSettingsWindow')
    expect(renderer).toContain('api.onSettingsChanged')
    expect(preload).toContain('openSettingsWindow: (pane?: string) => ipcRenderer.invoke(\'open-settings-window\', pane)')
    expect(preload).toContain('onSettingsChanged: (callback: (settings: AppSettings) => void) => {')
    expect(main).toContain('function openSettingsWindow')
    expect(main).toContain("ipcMain.handle('open-settings-window'")
    expect(main).toContain("win.webContents.send('settings-updated', appSettings)")
    expect(css).toContain('body.settings-window-mode #settings-overlay')
    expect(css).toContain('body.settings-window-mode #settings-dialog::before')
    expect(css).toContain('body.settings-window-mode .settings-top-bar {\n  display: none;')
    expect(css).toContain('-webkit-app-region: drag')
    expect(css).toContain('body.settings-window-mode #settings-dialog {')
    expect(css).toContain('position: relative')
    expect(css).toContain('grid-template-columns: 190px minmax(0, 1fr)')
    expect(css).toContain('grid-template-rows: 1fr')
    expect(css).toContain('padding-top: 38px')
    expect(css).toContain('body:not(.settings-window-mode) #settings-dialog')
    expect(css).toContain('body:not(.settings-window-mode) .settings-nav-list')
    expect(css).not.toMatch(/#settings-dialog\s*\{[\s\S]*transform:\s*scale\(var\(--app-zoom/)
    expect(css).not.toContain('.settings-window-controls')
    expect(css).not.toContain('settings-pane-kicker')
    expect(css).not.toContain('cursor: move')
  })

  it('explains how to use OpenAI-compatible AI helper settings', () => {
    const html = readFileSync(join(process.cwd(), 'src/renderer/index.html'), 'utf8')

    expect(html).toContain('AI 精灵怎么用')
    expect(html).toContain('OpenAI 官方账号')
    expect(html).toContain('cpa/new-api')
    expect(html).toContain('选中文本后按 Cmd/Ctrl+J')
    expect(html).not.toContain('按 Cmd/Ctrl+Y')
  })

  it('keeps wide markdown tables scrollable instead of squeezing columns', () => {
    const css = readFileSync(join(process.cwd(), 'src/renderer/themes/base.css'), 'utf8')
    const tableRules = Array.from(css.matchAll(/#editor \.ProseMirror table\s*\{[\s\S]*?\n\}/g))
    const tableRule = tableRules.at(-1)?.[0] ?? ''

    expect(css).toContain('#editor .ProseMirror table')
    expect(tableRule).toContain('overflow-x: auto')
    expect(tableRule).toContain('width: 100%')
    expect(tableRule).toContain('max-width: 100%')
    expect(tableRule).not.toContain('width: max-content')
    expect(tableRule).toContain('scrollbar-width: none')
    expect(css).toContain('#editor .ProseMirror table::-webkit-scrollbar')
    expect(tableRule).toContain('white-space: nowrap')
    expect(css).toContain('#editor .ProseMirror table :is(thead, tbody)')
    expect(css).toContain('width: max-content')
    expect(css).toContain('min-width: 100%')
    expect(css).toContain('#editor .ProseMirror table tr')
    expect(css).toContain('display: table-row')
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
