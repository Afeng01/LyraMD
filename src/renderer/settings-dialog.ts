import type { AppSettings, ElectronAPI, SaveAsMode, SidebarState, TitleSyncMode } from '../preload/index'
import { applyTheme, loadSavedTheme } from './themes/theme-manager'

const BUILT_IN_THEMES = [
  { id: 'elegant', label: 'Elegant' },
  { id: 'newsprint', label: 'Newsprint' },
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
] as const

function getThemeSummary(themeName: string): string {
  if (themeName.startsWith('custom:')) {
    return `自定义主题 · ${themeName.slice(7)}`
  }

  const builtin = BUILT_IN_THEMES.find((theme) => theme.id === themeName)
  return builtin ? `当前主题 · ${builtin.label}` : `当前主题 · ${themeName}`
}

export interface SettingsDialogController {
  close: () => void
  isOpen: () => boolean
  open: () => void
  refresh: () => void
  toggle: () => void
}

interface CreateSettingsDialogControllerOptions {
  api: ElectronAPI
  getAppSettings: () => AppSettings
  getSidebarState: () => SidebarState | null
  onAppSettingsChange: (settings: AppSettings) => void
  onSidebarStateChange: (state: SidebarState) => void
}

type SettingsPaneId = 'general' | 'workspace' | 'shortcuts'

const SETTINGS_PANE_META: Record<
  SettingsPaneId,
  { description: string; kicker: string; title: string }
> = {
  general: {
    description: '决定标题和文件名如何一起工作，以及另存为后的切换方式。',
    kicker: '通用',
    title: '编辑器行为',
  },
  workspace: {
    description: '管理草稿落点与视觉主题，让编辑器保持稳定且顺手。',
    kicker: '工作区',
    title: '文件与外观',
  },
  shortcuts: {
    description: '把最常用的动作收拢成一页速查，减少在菜单里来回寻找。',
    kicker: '快捷键',
    title: '键盘操作',
  },
}

export function createSettingsDialogController({
  api,
  getAppSettings,
  getSidebarState,
  onAppSettingsChange,
  onSidebarStateChange,
}: CreateSettingsDialogControllerOptions): SettingsDialogController {
  const overlay = document.getElementById('settings-overlay') as HTMLDivElement | null
  const closeButton = document.getElementById('settings-close') as HTMLButtonElement | null
  const draftPreview = document.getElementById('settings-draft-preview') as HTMLDivElement | null
  const draftChooseButton = document.getElementById('settings-draft-choose') as HTMLButtonElement | null
  const paneDescription = document.getElementById('settings-pane-description') as HTMLParagraphElement | null
  const paneKicker = document.getElementById('settings-pane-kicker') as HTMLParagraphElement | null
  const paneTitle = document.getElementById('settings-pane-title') as HTMLHeadingElement | null
  const panePanels = Array.from(
    document.querySelectorAll<HTMLElement>('[data-settings-panel]'),
  )
  const paneTabs = Array.from(
    document.querySelectorAll<HTMLButtonElement>('[data-settings-pane]'),
  )
  const themeSummary = document.getElementById('settings-theme-summary') as HTMLDivElement | null
  const importThemeButton = document.getElementById('settings-theme-import') as HTMLButtonElement | null
  const themeButtons = Array.from(
    document.querySelectorAll<HTMLButtonElement>('[data-settings-theme]'),
  )
  const titleSyncInputs = Array.from(
    document.querySelectorAll<HTMLInputElement>('input[name="settings-title-sync-mode"]'),
  )
  const saveAsInputs = Array.from(
    document.querySelectorAll<HTMLInputElement>('input[name="settings-save-as-mode"]'),
  )
  const shortcutKeys = Array.from(
    document.querySelectorAll<HTMLElement>('.settings-shortcut-key'),
  )

  let dialogOpen = false
  let activePane: SettingsPaneId = 'general'
  let recordingShortcut: HTMLElement | null = null

  const renderPane = (): void => {
    const meta = SETTINGS_PANE_META[activePane]

    if (paneKicker) paneKicker.textContent = meta.kicker
    if (paneTitle) paneTitle.textContent = meta.title
    if (paneDescription) paneDescription.textContent = meta.description

    for (const tab of paneTabs) {
      const isActive = tab.dataset.settingsPane === activePane
      tab.classList.toggle('active', isActive)
      tab.setAttribute('aria-pressed', isActive ? 'true' : 'false')
    }

    for (const panel of panePanels) {
      const isActive = panel.dataset.settingsPanel === activePane
      panel.hidden = !isActive
      panel.classList.toggle('active', isActive)
    }
  }

  const stopRecording = (): void => {
    if (recordingShortcut) {
      recordingShortcut.classList.remove('recording')
      recordingShortcut = null
    }
  }

  const formatKeyCombo = (event: KeyboardEvent): string => {
    const parts: string[] = []
    if (event.metaKey || (event.ctrlKey && !parts.includes('Ctrl'))) {
      parts.push(window.process.platform === 'darwin' ? '⌘' : 'Ctrl')
    }
    if (event.shiftKey) parts.push('Shift')
    if (event.altKey) parts.push('Alt')
    
    let key = event.key
    if (key === ' ') key = 'Space'
    if (key.length === 1) key = key.toUpperCase()
    if (!['Control', 'Shift', 'Alt', 'Meta'].includes(key)) {
      parts.push(key)
    }
    return parts.join('+')
  }

  const render = (): void => {
    const appSettings = getAppSettings()
    const sidebarState = getSidebarState()
    const activeTheme = loadSavedTheme()

    for (const input of titleSyncInputs) {
      input.checked = input.value === appSettings.titleSyncMode
    }

    for (const input of saveAsInputs) {
      input.checked = input.value === appSettings.saveAsMode
    }

    if (draftPreview) {
      draftPreview.textContent = sidebarState?.draftDirectoryPath ?? 'Documents/LyraMD Drafts'
    }

    if (themeSummary) {
      themeSummary.textContent = getThemeSummary(activeTheme)
    }

    for (const button of themeButtons) {
      button.classList.toggle('active', button.dataset.settingsTheme === activeTheme)
    }

    renderPane()
  }

  const open = (): void => {
    dialogOpen = true
    render()
    if (!overlay) return
    overlay.hidden = false
    overlay.setAttribute('aria-hidden', 'false')
    queueMicrotask(() => {
      closeButton?.focus()
    })
  }

  const close = (): void => {
    dialogOpen = false
    stopRecording()
    if (!overlay) return
    overlay.hidden = true
    overlay.setAttribute('aria-hidden', 'true')
  }

  const toggle = (): void => {
    if (dialogOpen) {
      close()
      return
    }
    open()
  }

  const updateTitleSyncMode = async (mode: TitleSyncMode): Promise<void> => {
    const current = getAppSettings()
    const next = (await api.updateSettings({ titleSyncMode: mode }).catch(() => null)) ?? {
      ...current,
      titleSyncMode: mode,
    }
    onAppSettingsChange(next)
    render()
  }

  const updateSaveAsMode = async (mode: SaveAsMode): Promise<void> => {
    const current = getAppSettings()
    const next = (await api.updateSettings({ saveAsMode: mode }).catch(() => null)) ?? {
      ...current,
      saveAsMode: mode,
    }
    onAppSettingsChange(next)
    render()
  }

  overlay?.addEventListener('click', (event) => {
    if (event.target === overlay) close()
  })

  closeButton?.addEventListener('click', () => {
    close()
  })

  window.addEventListener('keydown', (event) => {
    if (!dialogOpen || !recordingShortcut) return

    event.preventDefault()
    event.stopPropagation()

    if (event.key === 'Escape') {
      stopRecording()
      return
    }

    const combo = formatKeyCombo(event)
    // Only save if a non-modifier key was pressed
    if (!['Control', 'Shift', 'Alt', 'Meta'].includes(event.key)) {
      recordingShortcut.textContent = combo
      // Here you would typically call api.updateShortcut(...)
      stopRecording()
    }
  }, true)

  for (const key of shortcutKeys) {
    key.addEventListener('click', (event) => {
      event.stopPropagation()
      if (recordingShortcut === key) {
        stopRecording()
      } else {
        stopRecording()
        recordingShortcut = key
        key.classList.add('recording')
        key.textContent = '录制中...'
      }
    })
  }

  for (const input of titleSyncInputs) {
    input.addEventListener('change', () => {
      if (!input.checked) return
      void updateTitleSyncMode(input.value as TitleSyncMode)
    })
  }

  for (const input of saveAsInputs) {
    input.addEventListener('change', () => {
      if (!input.checked) return
      void updateSaveAsMode(input.value as SaveAsMode)
    })
  }

  for (const tab of paneTabs) {
    tab.addEventListener('click', () => {
      const nextPane = tab.dataset.settingsPane as SettingsPaneId | undefined
      if (!nextPane || nextPane === activePane) return
      activePane = nextPane
      renderPane()
    })
  }

  draftChooseButton?.addEventListener('click', () => {
    api.chooseDraftDirectory().then((state) => {
      if (!state) return
      onSidebarStateChange(state)
      render()
    }).catch(() => {})
  })

  for (const button of themeButtons) {
    button.addEventListener('click', () => {
      const themeName = button.dataset.settingsTheme
      if (!themeName) return
      applyTheme(themeName)
      render()
    })
  }

  importThemeButton?.addEventListener('click', () => {
    api.loadCustomTheme().then((result) => {
      if (!result) return
      applyTheme(`custom:${result.name}`, result.css)
      render()
    }).catch(() => {})
  })

  return {
    close,
    isOpen: () => dialogOpen,
    open,
    refresh: render,
    toggle,
  }
}
