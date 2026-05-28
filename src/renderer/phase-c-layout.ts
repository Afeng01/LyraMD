export type AgentPanelPosition = 'auto' | 'bottom' | 'right'
export type AgentPanelPlacement = 'bottom' | 'right'
export type ContextPanelMode = 'agent' | 'outline'

export interface ResolveAgentPanelPlacementInput {
  preference: AgentPanelPosition
  width: number
  height: number
  previous: AgentPanelPlacement
}

export interface ResolveContextPanelStateInput {
  placement: AgentPanelPlacement
  activeContextPanel: ContextPanelMode
  agentPanelOpen: boolean
  outlinePanelOpen: boolean
}

export interface ContextPanelState {
  activeContextPanel: ContextPanelMode
  agentPanelOpen: boolean
  outlinePanelOpen: boolean
}

const RIGHT_PANEL_MIN_WIDTH = 1240
const RIGHT_PANEL_HYSTERESIS_WIDTH = 1190
const FORCED_RIGHT_MIN_WIDTH = 1040

export function resolveAgentPanelPlacement({
  preference,
  width,
  height,
  previous,
}: ResolveAgentPanelPlacementInput): AgentPanelPlacement {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return previous
  }

  if (preference === 'bottom') return 'bottom'
  if (preference === 'right') return width < FORCED_RIGHT_MIN_WIDTH ? 'bottom' : 'right'
  if (width >= RIGHT_PANEL_MIN_WIDTH) return 'right'
  if (previous === 'right' && width >= RIGHT_PANEL_HYSTERESIS_WIDTH) return 'right'
  return 'bottom'
}

export function resolveAgentPanelClassName(placement: AgentPanelPlacement): string {
  return placement === 'right' ? 'agent-panel-right' : 'agent-panel-bottom'
}

export function resolveContextPanelState({
  placement,
  activeContextPanel,
  agentPanelOpen,
  outlinePanelOpen,
}: ResolveContextPanelStateInput): ContextPanelState {
  let nextActiveContextPanel = activeContextPanel
  let nextAgentPanelOpen = agentPanelOpen
  let nextOutlinePanelOpen = outlinePanelOpen

  if (!nextAgentPanelOpen && nextOutlinePanelOpen && nextActiveContextPanel === 'agent') {
    nextActiveContextPanel = 'outline'
  }

  if (!nextOutlinePanelOpen && nextAgentPanelOpen && nextActiveContextPanel === 'outline') {
    nextActiveContextPanel = 'agent'
  }

  if (placement === 'right' && nextAgentPanelOpen && nextOutlinePanelOpen) {
    if (nextActiveContextPanel === 'agent') nextOutlinePanelOpen = false
    else nextAgentPanelOpen = false
  }

  return {
    activeContextPanel: nextActiveContextPanel,
    agentPanelOpen: nextAgentPanelOpen,
    outlinePanelOpen: nextOutlinePanelOpen,
  }
}
