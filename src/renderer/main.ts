import { createEditor, getMarkdown, getHTML, setMarkdown } from './editor/editor'
import { applyTheme, loadSavedTheme } from './themes/theme-manager'
import type { SidebarState } from '../preload/index'
import './themes/base.css'

function basename(filePath: string | null): string {
  if (!filePath) return 'Untitled'
  const normalized = filePath.replaceAll('\\', '/')
  return normalized.slice(normalized.lastIndexOf('/') + 1)
}

function dirname(filePath: string | null): string {
  if (!filePath) return ''
  const normalized = filePath.replaceAll('\\', '/')
  const lastSlash = normalized.lastIndexOf('/')
  return lastSlash === -1 ? '' : normalized.slice(0, lastSlash)
}

async function init(): Promise<void> {
  const api = window.electronAPI
  const savedTheme = loadSavedTheme()
  let sidebarState: SidebarState | null = null
  applyTheme(savedTheme)

  if (savedTheme.startsWith('custom:')) {
    const fileName = savedTheme.slice(7)
    const css = await api.loadThemeCSS(fileName)
    if (css) applyTheme(savedTheme, css)
  }

  await createEditor('editor')

  const appShell = document.getElementById('app-shell')
  const sidebarToggle = document.getElementById('sidebar-toggle') as HTMLButtonElement | null
  const workdirToggle = document.getElementById('workdir-toggle') as HTMLButtonElement | null
  const workdirChange = document.getElementById('workdir-change') as HTMLButtonElement | null
  const currentFile = document.getElementById('current-file')
  const recentFiles = document.getElementById('recent-files')
  const workdirPath = document.getElementById('workdir-path')
  const workdirBody = document.getElementById('workdir-body')
  const workdirSection = document.getElementById('workdir-section')

  const renderSidebar = (): void => {
    if (!appShell || !currentFile || !recentFiles || !workdirPath || !workdirBody || !workdirSection || !sidebarState) return

    appShell.classList.toggle('sidebar-open', sidebarState.sidebarOpen)
    workdirSection.classList.toggle('collapsed', !sidebarState.workdirExpanded)

    currentFile.innerHTML = `
      <div class="sidebar-title">${basename(sidebarState.currentFilePath)}</div>
      <div class="sidebar-meta">${sidebarState.currentFilePath ? dirname(sidebarState.currentFilePath) || '当前窗口文件' : '当前未打开文件'}</div>
    `

    const recentMarkup = sidebarState.recentFiles.map((filePath) => `
      <button type="button" class="sidebar-list-item${filePath === sidebarState?.currentFilePath ? ' active' : ''}" data-file-path="${filePath}">
        <span class="sidebar-title">${basename(filePath)}</span>
        <span class="sidebar-meta">${dirname(filePath)}</span>
      </button>
    `).join('')
    recentFiles.innerHTML = recentMarkup || '<div class="sidebar-empty">还没有最近文件</div>'

    workdirPath.textContent = sidebarState.workdirPath ?? '尚未选择工作目录'
    workdirPath.title = sidebarState.workdirPath ?? ''

    if (!sidebarState.workdirPath) {
      workdirBody.innerHTML = '<button type="button" id="workdir-empty-action" class="sidebar-empty-action">选择工作目录</button>'
      return
    }

    if (!sidebarState.workdirExpanded) {
      workdirBody.innerHTML = ''
      return
    }

    const workdirMarkup = sidebarState.workdirEntries.map((entry) => `
      <button type="button" class="sidebar-list-item workdir-item${entry.absolutePath === sidebarState?.currentFilePath ? ' active' : ''}" data-file-path="${entry.absolutePath}">
        <span class="sidebar-title">${entry.relativePath}</span>
      </button>
    `).join('')
    workdirBody.innerHTML = workdirMarkup || '<div class="sidebar-empty">这个目录里没有 Markdown 文件</div>'
  }

  sidebarState = await api.getSidebarState()
  if (sidebarState) renderSidebar()

  api.onMenuOpen(async () => {
    await api.openFile()
  })

  api.onMenuSave(() => api.saveFile(getMarkdown()))
  api.onMenuSaveAs(() => api.saveFileAs(getMarkdown()))
  api.onMenuExportPDF(() => api.exportPDF())
  api.onMenuExportHTML(() => {
    const s = getComputedStyle(document.body)
    const v = (name: string) => s.getPropertyValue(name).trim()
    const bgColor = v('--bg-color')
    const textColor = v('--text-color')
    const textMuted = v('--text-muted')
    const borderColor = v('--border-color')
    const linkColor = v('--link-color')
    const codeBg = v('--code-bg')
    const codeBlockBg = v('--code-block-bg')
    const codeBlockText = v('--code-block-text') || textColor
    const blockquoteBorder = v('--blockquote-border')
    const blockquoteBg = v('--blockquote-bg') || 'transparent'
    const tableHeaderBg = v('--table-header-bg')
    const selectionBg = v('--selection-bg')

    const editor = document.querySelector('#editor .ProseMirror')
    const fontFamily = editor ? getComputedStyle(editor).fontFamily : '-apple-system,BlinkMacSystemFont,sans-serif'

    const getElColor = (selector: string, fallback: string): string => {
      const el = document.querySelector(`#editor .ProseMirror ${selector}`)
      return el ? getComputedStyle(el).color : fallback
    }
    const strongColor = getElColor('strong', textColor)
    const codeColor = getElColor('code', textColor)

    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>ColaMD Export</title>
<style>
body{max-width:780px;margin:40px auto;padding:20px;font-family:${fontFamily};line-height:1.75;background:${bgColor};color:${textColor}}
h1{font-size:2em;font-weight:700;border-bottom:1px solid ${borderColor};padding-bottom:.3em}
h2{font-size:1.5em;font-weight:600;border-bottom:1px solid ${borderColor};padding-bottom:.25em}
h3{font-size:1.25em;font-weight:600}
strong{color:${strongColor}}
a{color:${linkColor};text-decoration:none}
code{background:${codeBg};color:${codeColor};padding:2px 6px;border-radius:3px;font-size:.875em;font-family:'SF Mono','Fira Code',Menlo,monospace}
pre{background:${codeBlockBg};color:${codeBlockText};padding:16px;border-radius:6px;overflow-x:auto;margin:1em 0}
pre code{background:none;padding:0;color:inherit}
blockquote{border-left:4px solid ${blockquoteBorder};background:${blockquoteBg};padding-left:16px;margin:1em 0;color:${textMuted}}
table{border-collapse:collapse;width:100%;margin:1em 0}
th,td{border:1px solid ${borderColor};padding:8px 12px}
th{background:${tableHeaderBg};font-weight:600}
hr{border:none;border-top:2px solid ${borderColor};margin:2em 0}
img{max-width:100%}
::selection{background:${selectionBg}}
</style>
</head><body>${getHTML()}</body></html>`
    api.exportHTML(html)
  })
  api.onNewFile(() => setMarkdown(''))
  api.onFileOpened((data) => setMarkdown(data.content))
  api.onFileChanged((content) => setMarkdown(content))
  api.onSetTheme((theme) => applyTheme(theme))
  api.onSetCustomCSS((css) => {
    const theme = loadSavedTheme()
    applyTheme(theme, css)
  })

  api.onMenuImportTheme(async () => {
    const result = await api.loadCustomTheme()
    if (result) applyTheme(`custom:${result.name}`, result.css)
  })

  const agentDot = document.getElementById('agent-dot')
  api.onAgentActivity((state) => {
    if (agentDot) agentDot.className = state === 'idle' ? '' : state
  })

  api.onSidebarState((state) => {
    sidebarState = state
    renderSidebar()
  })

  sidebarToggle?.addEventListener('click', () => {
    api.toggleSidebar().catch(() => {})
  })

  workdirToggle?.addEventListener('click', () => {
    api.toggleWorkdirExpanded().catch(() => {})
  })

  workdirChange?.addEventListener('click', () => {
    api.chooseWorkdir().catch(() => {})
  })

  document.addEventListener('click', (event) => {
    const target = event.target as HTMLElement | null
    const fileButton = target?.closest('[data-file-path]') as HTMLElement | null
    if (fileButton) {
      const filePath = fileButton.dataset.filePath
      if (filePath) api.openSidebarFile(filePath).catch(() => {})
      return
    }

    if (target?.closest('#workdir-empty-action')) {
      api.chooseWorkdir().catch(() => {})
    }
  })

  document.addEventListener('dragover', (e) => e.preventDefault())
  document.addEventListener('drop', async (e) => {
    e.preventDefault()
    const file = e.dataTransfer?.files[0]
    if (!file) return
    const filePath = api.getPathForFile(file)
    if (!filePath) return
    await api.openFilePath(filePath)
  })
}

init().catch((e) => console.error('ColaMD init failed:', e))
