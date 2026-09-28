export type AgentPanelPosition = 'auto' | 'bottom' | 'right'
export type AgentPanelPlacement = 'bottom' | 'right'

export interface ResolveAgentPanelPlacementInput {
  preference: AgentPanelPosition
  width: number
  height: number
  previous: AgentPanelPlacement
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
