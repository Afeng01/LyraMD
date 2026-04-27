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

function isSamePath(a: string | null, b: string | null): boolean {
  if (!a || !b) return false
  return a === b
}

function clampSidebarWidth(width: number): number {
  return Math.min(460, Math.max(220, Math.round(width)))
}

function clearElement(element: Element): void {
  while (element.firstChild) element.removeChild(element.firstChild)
}

function createTextBlock(className: string, text: string): HTMLDivElement {
  const block = document.createElement('div')
  block.className = className
  block.textContent = text
  return block
}

function createFileItem(
  filePath: string,
  title: string,
  meta: string | null,
  currentFilePath: string | null,
  extraClass = '',
): HTMLButtonElement {
  const item = document.createElement('button')
  item.type = 'button'
  item.className = `sidebar-list-item${extraClass ? ` ${extraClass}` : ''}`
  item.dataset.filePath = filePath
  item.title = filePath
  item.classList.toggle('active', isSamePath(filePath, currentFilePath))

  item.appendChild(createTextBlock('sidebar-title', title))
  if (meta) item.appendChild(createTextBlock('sidebar-meta', meta))
  return item
}

function syncSidebarState(): void {
  window.electronAPI.getSidebarState().then((state) => {
    if (state) {
      activeSidebarStateSetter?.(state)
    }
  }).catch(() => {})
}

let activeSidebarStateSetter: ((state: SidebarState) => void) | null = null

function renderEmpty(element: Element, text: string): void {
  clearElement(element)
  element.appendChild(createTextBlock('sidebar-empty', text))
}

async function init(): Promise<void> {
  const api = window.electronAPI
  const savedTheme = loadSavedTheme()
  let sidebarState: SidebarState | null = null
  let managingRecentFiles = false
  const setSidebarState = (state: SidebarState): void => {
    sidebarState = state
    if (state.recentFiles.length === 0) managingRecentFiles = false
    renderSidebar()
  }
  activeSidebarStateSetter = setSidebarState
  applyTheme(savedTheme)

  if (savedTheme.startsWith('custom:')) {
    const fileName = savedTheme.slice(7)
    const css = await api.loadThemeCSS(fileName)
    if (css) applyTheme(savedTheme, css)
  }

  await createEditor('editor')

  const appShell = document.getElementById('app-shell')
  const sidebarToggle = document.getElementById('sidebar-toggle') as HTMLButtonElement | null
  const recentFilesToggle = document.getElementById('recent-files-toggle') as HTMLButtonElement | null
  const recentFilesClear = document.getElementById('recent-files-clear') as HTMLButtonElement | null
  const workdirToggle = document.getElementById('workdir-toggle') as HTMLButtonElement | null
  const workdirChange = document.getElementById('workdir-change') as HTMLButtonElement | null
  const currentFile = document.getElementById('current-file')
  const recentFiles = document.getElementById('recent-files')
  const recentFilesSection = document.getElementById('recent-files-section')
  const workdirName = document.getElementById('workdir-name')
  const workdirBody = document.getElementById('workdir-body')
  const workdirSection = document.getElementById('workdir-section')
  const sidebarResizer = document.getElementById('sidebar-resizer')

  const renderSidebar = (): void => {
    if (!appShell || !currentFile || !recentFiles || !recentFilesSection || !workdirBody || !workdirSection || !sidebarState) return

    appShell.classList.toggle('sidebar-open', sidebarState.sidebarOpen)
    appShell.style.setProperty('--sidebar-width', `${sidebarState.sidebarWidth}px`)
    recentFilesSection.classList.toggle('collapsed', !sidebarState.recentFilesExpanded)
    workdirSection.classList.toggle('collapsed', !sidebarState.workdirExpanded)
    if (recentFilesClear) {
      recentFilesClear.textContent = managingRecentFiles ? '完成' : '清除'
      recentFilesClear.classList.toggle('active', managingRecentFiles)
      recentFilesClear.disabled = sidebarState.recentFiles.length === 0
    }

    clearElement(currentFile)
    currentFile.className = 'sidebar-list-item current-file-item'
    currentFile.appendChild(createTextBlock('sidebar-title', basename(sidebarState.currentFilePath)))
    currentFile.appendChild(createTextBlock(
      'sidebar-meta',
      sidebarState.currentFilePath ? '当前正在编辑' : '当前未打开文件',
    ))

    clearElement(recentFiles)
    if (sidebarState.recentFilesExpanded) {
      if (sidebarState.recentFiles.length === 0) {
        recentFiles.appendChild(createTextBlock('sidebar-empty', '还没有最近文件'))
      } else {
        for (const filePath of sidebarState.recentFiles) {
          const item = createFileItem(
            filePath,
            basename(filePath),
            null,
            sidebarState.currentFilePath,
          )

          if (!managingRecentFiles) {
            recentFiles.appendChild(item)
          } else {
            const row = document.createElement('div')
            row.className = 'sidebar-recent-row'
            row.appendChild(item)

            const remove = document.createElement('button')
            remove.type = 'button'
            remove.className = 'recent-remove-button'
            remove.dataset.removeRecentPath = filePath
            remove.setAttribute('aria-label', `删除 ${basename(filePath)}`)
            remove.textContent = '−'
            remove.addEventListener('click', (event) => {
              event.preventDefault()
              event.stopPropagation()
              if (!sidebarState) return
              sidebarState = {
                ...sidebarState,
                recentFiles: sidebarState.recentFiles.filter((entry) => entry !== filePath),
              }
              if (sidebarState.recentFiles.length === 0) managingRecentFiles = false
              renderSidebar()
              api.removeRecentFile(filePath).then((removed) => {
                if (!removed) syncSidebarState()
              }).catch(() => syncSidebarState())
            })
            row.appendChild(remove)
            recentFiles.appendChild(row)
          }
        }
      }
    }

    if (workdirName) {
      workdirName.textContent = sidebarState.workdirPath ? basename(sidebarState.workdirPath) : ''
      workdirName.title = sidebarState.workdirPath ?? ''
    }

    clearElement(workdirBody)
    if (!sidebarState.workdirPath) {
      const action = document.createElement('button')
      action.type = 'button'
      action.id = 'workdir-empty-action'
      action.className = 'sidebar-empty-action'
      action.textContent = '选择工作目录'
      workdirBody.appendChild(action)
      return
    }

    if (!sidebarState.workdirExpanded) {
      return
    }

    if (sidebarState.workdirEntries.length === 0) {
      renderEmpty(workdirBody, '这个目录里没有 Markdown 文件')
      return
    }

    const workdirList = document.createElement('div')
    workdirList.className = 'sidebar-list'
    for (const entry of sidebarState.workdirEntries) {
      workdirList.appendChild(createFileItem(
        entry.absolutePath,
        basename(entry.relativePath),
        null,
        sidebarState.currentFilePath,
        'workdir-item',
      ))
    }
    workdirBody.appendChild(workdirList)
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
<html><head><meta charset="utf-8"><title>LyraMD Export</title>
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
    setSidebarState(state)
  })

  sidebarToggle?.addEventListener('click', () => {
    api.toggleSidebar().catch(() => {})
  })

  recentFilesToggle?.addEventListener('click', () => {
    api.toggleRecentFilesExpanded().catch(() => {})
  })

  recentFilesClear?.addEventListener('click', () => {
    if (!sidebarState?.recentFiles.length) return
    managingRecentFiles = !managingRecentFiles
    if (!sidebarState.recentFilesExpanded) api.toggleRecentFilesExpanded().catch(() => {})
    renderSidebar()
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
      if (managingRecentFiles) return
      const filePath = fileButton.dataset.filePath
      if (filePath) api.openSidebarFile(filePath).catch(() => {})
      return
    }

    if (target?.closest('#workdir-empty-action')) {
      api.chooseWorkdir().catch(() => {})
    }
  })

  let dragOriginX = 0
  let dragOriginWidth = 0

  const handlePointerMove = (event: PointerEvent): void => {
    if (!sidebarState) return
    const nextWidth = clampSidebarWidth(dragOriginWidth + (event.clientX - dragOriginX))
    appShell?.style.setProperty('--sidebar-width', `${nextWidth}px`)
  }

  const handlePointerUp = async (event: PointerEvent): Promise<void> => {
    window.removeEventListener('pointermove', handlePointerMove)
    window.removeEventListener('pointerup', handlePointerUp)
    if (!sidebarState) return
    const nextWidth = clampSidebarWidth(dragOriginWidth + (event.clientX - dragOriginX))
    await api.setSidebarWidth(nextWidth).catch(() => {})
  }

  sidebarResizer?.addEventListener('pointerdown', (event) => {
    if (!sidebarState?.sidebarOpen) return
    dragOriginX = event.clientX
    dragOriginWidth = sidebarState.sidebarWidth
    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
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

init().catch((e) => console.error('LyraMD init failed:', e))
