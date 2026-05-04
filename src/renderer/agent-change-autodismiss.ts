export const AGENT_CHANGE_AUTO_DISMISS_MS = 5000

export interface AgentChangeAutoDismiss {
  schedule: () => void
  clear: () => void
}

export function createAgentChangeAutoDismiss(
  onDismiss: () => void,
  delayMs = AGENT_CHANGE_AUTO_DISMISS_MS,
): AgentChangeAutoDismiss {
  let timer: ReturnType<typeof setTimeout> | null = null

  const clear = (): void => {
    if (!timer) return
    clearTimeout(timer)
    timer = null
  }

  const schedule = (): void => {
    clear()
    timer = setTimeout(() => {
      timer = null
      onDismiss()
    }, delayMs)
  }

  return { schedule, clear }
}
