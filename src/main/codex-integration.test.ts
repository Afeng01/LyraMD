import { describe, expect, it } from 'vitest'
import { join } from 'path'

import {
  CODEX_MCP_SERVER_NAME,
  createCodexMcpAddArgs,
  codexConfigHasServer,
  getCodexConfigPath,
  getMcpBridgeFilePath,
  parseCodexMcpListHasServer,
  resolveSidecarScriptPath,
} from './codex-integration'

describe('codex integration helpers', () => {
  it('uses the Codex config path that Codex CLI expects', () => {
    expect(getCodexConfigPath('/Users/cherry')).toBe('/Users/cherry/.codex/config.toml')
  })

  it('stores the bridge discovery file in app data', () => {
    expect(getMcpBridgeFilePath('/Users/cherry/.lyramd')).toBe('/Users/cherry/.lyramd/mcp-bridge.json')
  })

  it('points the sidecar at the source tree in development', () => {
    expect(resolveSidecarScriptPath({
      appPath: '/repo/ColaMD',
      isPackaged: false,
      resourcesPath: '/Applications/LyraMD.app/Contents/Resources',
    })).toBe(join('/repo/ColaMD', 'mcp', 'colamd-mcp-server.mjs'))
  })

  it('points the sidecar at extraResources when packaged', () => {
    expect(resolveSidecarScriptPath({
      appPath: '/repo/ColaMD',
      isPackaged: true,
      resourcesPath: '/Applications/LyraMD.app/Contents/Resources',
    })).toBe(join('/Applications/LyraMD.app/Contents/Resources', 'mcp', 'colamd-mcp-server.mjs'))
  })

  it('builds a Codex MCP add command for the Electron node runtime', () => {
    expect(createCodexMcpAddArgs({
      bridgeFilePath: '/Users/cherry/.lyramd/mcp-bridge.json',
      electronRunAsNode: true,
      sidecarScriptPath: '/repo/ColaMD/mcp/colamd-mcp-server.mjs',
      spawnCommand: '/Applications/LyraMD.app/Contents/MacOS/LyraMD',
    })).toEqual([
      'mcp',
      'add',
      '--env',
      'ELECTRON_RUN_AS_NODE=1',
      '--env',
      'LYRAMD_MCP_BRIDGE_FILE=/Users/cherry/.lyramd/mcp-bridge.json',
      CODEX_MCP_SERVER_NAME,
      '--',
      '/Applications/LyraMD.app/Contents/MacOS/LyraMD',
      '/repo/ColaMD/mcp/colamd-mcp-server.mjs',
    ])
  })

  it('detects an existing colamd server from Codex mcp list output', () => {
    const output = [
      'Name        Command     Args',
      'fetch       uvx         mcp-server-fetch',
      'colamd      /App/LyraMD /Resources/mcp/colamd-mcp-server.mjs',
    ].join('\n')

    expect(parseCodexMcpListHasServer(output)).toBe(true)
    expect(parseCodexMcpListHasServer(output, 'vmark')).toBe(false)
  })

  it('detects an existing colamd server from Codex config tables', () => {
    const config = [
      '[model_providers.openai]',
      'name = "OpenAI"',
      '',
      '[mcp_servers.colamd]',
      'command = "/Applications/LyraMD.app/Contents/MacOS/LyraMD"',
      'args = ["/Applications/LyraMD.app/Contents/Resources/mcp/colamd-mcp-server.mjs"]',
    ].join('\n')

    expect(codexConfigHasServer(config)).toBe(true)
    expect(codexConfigHasServer(config, 'vmark')).toBe(false)
  })

  it('detects quoted Codex MCP server names in config', () => {
    expect(codexConfigHasServer('[mcp_servers."colamd"]\ncommand = "node"')).toBe(true)
    expect(codexConfigHasServer("[mcp_servers.'colamd']\ncommand = \"node\"")).toBe(true)
  })
})
