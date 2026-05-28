import { describe, expect, it } from 'vitest'

import { resolveAgentPanelClassName, resolveAgentPanelPlacement, resolveContextPanelState } from './phase-c-layout'

describe('resolveAgentPanelPlacement', () => {
  it('places the agent panel on the right for wide automatic layouts', () => {
    expect(resolveAgentPanelPlacement({
      preference: 'auto',
      width: 1500,
      height: 900,
      previous: 'bottom',
    })).toBe('right')
  })

  it('honors an explicit bottom preference even on wide windows', () => {
    expect(resolveAgentPanelPlacement({
      preference: 'bottom',
      width: 1600,
      height: 900,
      previous: 'right',
    })).toBe('bottom')
  })

  it('uses hysteresis to avoid bouncing back to bottom near the right-panel threshold', () => {
    expect(resolveAgentPanelPlacement({
      preference: 'auto',
      width: 1210,
      height: 900,
      previous: 'right',
    })).toBe('right')
  })

  it('keeps the agent panel at the bottom below the automatic threshold', () => {
    expect(resolveAgentPanelPlacement({
      preference: 'auto',
      width: 1100,
      height: 900,
      previous: 'bottom',
    })).toBe('bottom')
  })

  it('downgrades an explicit right preference when the editor would become too narrow', () => {
    expect(resolveAgentPanelPlacement({
      preference: 'right',
      width: 900,
      height: 900,
      previous: 'right',
    })).toBe('bottom')
  })

  it('keeps the previous placement for invalid window dimensions', () => {
    expect(resolveAgentPanelPlacement({
      preference: 'auto',
      width: 0,
      height: 900,
      previous: 'right',
    })).toBe('right')
  })
})

describe('resolveAgentPanelClassName', () => {
  it('maps placement to stable app-shell class names', () => {
    expect(resolveAgentPanelClassName('right')).toBe('agent-panel-right')
    expect(resolveAgentPanelClassName('bottom')).toBe('agent-panel-bottom')
  })
})

describe('resolveContextPanelState', () => {
  it('keeps both panels open on bottom placement while tracking the active one', () => {
    expect(resolveContextPanelState({
      placement: 'bottom',
      activeContextPanel: 'agent',
      agentPanelOpen: true,
      outlinePanelOpen: true,
    })).toEqual({
      activeContextPanel: 'agent',
      agentPanelOpen: true,
      outlinePanelOpen: true,
    })
  })

  it('switches active panel when the previously active bottom drawer is closed', () => {
    expect(resolveContextPanelState({
      placement: 'bottom',
      activeContextPanel: 'agent',
      agentPanelOpen: false,
      outlinePanelOpen: true,
    })).toEqual({
      activeContextPanel: 'outline',
      agentPanelOpen: false,
      outlinePanelOpen: true,
    })
  })

  it('keeps the remaining open panel visible after changing to right placement', () => {
    expect(resolveContextPanelState({
      placement: 'right',
      activeContextPanel: 'agent',
      agentPanelOpen: false,
      outlinePanelOpen: true,
    })).toEqual({
      activeContextPanel: 'outline',
      agentPanelOpen: false,
      outlinePanelOpen: true,
    })
  })

  it('allows only the active panel to remain open on right placement', () => {
    expect(resolveContextPanelState({
      placement: 'right',
      activeContextPanel: 'outline',
      agentPanelOpen: true,
      outlinePanelOpen: true,
    })).toEqual({
      activeContextPanel: 'outline',
      agentPanelOpen: false,
      outlinePanelOpen: true,
    })
  })
})
