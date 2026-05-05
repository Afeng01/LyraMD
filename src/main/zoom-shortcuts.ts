export type ZoomShortcutAction =
  | { kind: 'zoom-in' }
  | { kind: 'zoom-out' }
  | { kind: 'zoom-reset' }
  | { kind: 'none' }

export interface ZoomShortcutInput {
  control: boolean
  key: string
  meta: boolean
  shift: boolean
}

export function resolveZoomShortcut(input: ZoomShortcutInput): ZoomShortcutAction {
  if (!input.control && !input.meta) return { kind: 'none' }

  const key = input.key.toLowerCase()
  if (key === '=' || key === '+') return { kind: 'zoom-in' }
  if (key === '-') return { kind: 'zoom-out' }
  if (key === '0') return { kind: 'zoom-reset' }

  return { kind: 'none' }
}
