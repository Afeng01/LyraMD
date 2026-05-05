import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  AGENT_CHANGE_AUTO_DISMISS_MS,
  createAgentChangeAutoDismiss,
} from './agent-change-autodismiss'

describe('createAgentChangeAutoDismiss', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('dismisses the agent change panel after three seconds', () => {
    vi.useFakeTimers()
    const onDismiss = vi.fn()
    const autoDismiss = createAgentChangeAutoDismiss(onDismiss)

    autoDismiss.schedule()
    vi.advanceTimersByTime(AGENT_CHANGE_AUTO_DISMISS_MS - 1)
    expect(onDismiss).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('restarts the three-second timer for a newer external update', () => {
    vi.useFakeTimers()
    const onDismiss = vi.fn()
    const autoDismiss = createAgentChangeAutoDismiss(onDismiss)

    autoDismiss.schedule()
    vi.advanceTimersByTime(2000)
    autoDismiss.schedule()
    vi.advanceTimersByTime(2000)
    expect(onDismiss).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1000)
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('does not dismiss after the timer is cleared manually', () => {
    vi.useFakeTimers()
    const onDismiss = vi.fn()
    const autoDismiss = createAgentChangeAutoDismiss(onDismiss)

    autoDismiss.schedule()
    autoDismiss.clear()
    vi.advanceTimersByTime(AGENT_CHANGE_AUTO_DISMISS_MS)

    expect(onDismiss).not.toHaveBeenCalled()
  })
})
