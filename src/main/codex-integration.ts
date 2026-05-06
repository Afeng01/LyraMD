import { execFile } from 'child_process'
import { existsSync } from 'fs'
import { readFile } from 'fs/promises'
import { homedir } from 'os'
import { join } from 'path'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

export const CODEX_MCP_SERVER_NAME = 'colamd'

export interface CodexIntegrationPaths {
  bridgeFilePath: string
  codexConfigPath: string
  sidecarScriptPath: string
}

export interface CodexCliDetection {
  command: string | null
  version: string | null
}

export interface CodexIntegrationStatus {
  bridgeFilePath: string
  bridgePort: number | null
  bridgeRunning: boolean
  codexCommand: string | null
  codexConfigPath: string
  codexInstalled: boolean
  codexMcpConfigured: boolean
  error: string | null
  serverName: string
  sidecarScriptPath: string
  version: string | null
}

export interface CodexMcpCommandConfig {
  bridgeFilePath: string
  electronRunAsNode: boolean
  serverName?: string
  sidecarScriptPath: string
  spawnCommand: string
}

export function getCodexConfigPath(homeDir: string): string {
  return join(homeDir, '.codex', 'config.toml')
}

export function getMcpBridgeFilePath(appDataDir: string): string {
  return join(appDataDir, 'mcp-bridge.json')
}

export function resolveSidecarScriptPath(options: {
  appPath: string
  isPackaged: boolean
  resourcesPath: string
}): string {
  if (options.isPackaged) {
    return join(options.resourcesPath, 'mcp', 'colamd-mcp-server.mjs')
  }
  return join(options.appPath, 'mcp', 'colamd-mcp-server.mjs')
}

export function createCodexMcpAddArgs(config: CodexMcpCommandConfig): string[] {
  const args = ['mcp', 'add']
  if (config.electronRunAsNode) {
    args.push('--env', 'ELECTRON_RUN_AS_NODE=1')
  }
  args.push('--env', `LYRAMD_MCP_BRIDGE_FILE=${config.bridgeFilePath}`)
  args.push(config.serverName ?? CODEX_MCP_SERVER_NAME)
  args.push('--', config.spawnCommand, config.sidecarScriptPath)
  return args
}

export function parseCodexMcpListHasServer(output: string, serverName = CODEX_MCP_SERVER_NAME): boolean {
  return output
    .split(/\r?\n/)
    .some((line) => line.trim().split(/\s+/)[0] === serverName)
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function codexConfigHasServer(config: string, serverName = CODEX_MCP_SERVER_NAME): boolean {
  const server = escapeRegExp(serverName)
  const tablePattern = new RegExp(
    `^\\s*\\[\\s*mcp_servers\\s*\\.\\s*(?:${server}|"${server}"|'${server}')\\s*\\]\\s*$`,
    'im',
  )
  const inlinePattern = new RegExp(
    `^\\s*(?:${server}|"${server}"|'${server}')\\s*=\\s*\\{[^\\n]*(?:command|url)\\s*=`,
    'im',
  )
  return tablePattern.test(config) || inlinePattern.test(config)
}

async function codexConfigFileHasServer(configPath: string, serverName = CODEX_MCP_SERVER_NAME): Promise<boolean> {
  try {
    const config = await readFile(configPath, 'utf8')
    return codexConfigHasServer(config, serverName)
  } catch {
    return false
  }
}

function getCodexCommandCandidates(homeDir = homedir()): string[] {
  if (process.platform === 'win32') return []
  return [
    join(homeDir, '.bun', 'bin', 'codex'),
    join(homeDir, '.npm-global', 'bin', 'codex'),
    join(homeDir, '.local', 'bin', 'codex'),
    '/opt/homebrew/bin/codex',
    '/usr/local/bin/codex',
  ]
}

async function shellResolveCommand(command: string): Promise<string | null> {
  try {
    const { stdout } = process.platform === 'win32'
      ? await execFileAsync('where', [command], { timeout: 5000 })
      : await execFileAsync('/bin/zsh', ['-lc', `command -v ${command}`], { timeout: 5000 })
    const resolved = stdout.trim()
    return resolved.length > 0 ? resolved.split(/\r?\n/)[0] : null
  } catch {
    return null
  }
}

export async function detectCodexCli(): Promise<CodexCliDetection> {
  const command = await shellResolveCommand('codex')
    ?? getCodexCommandCandidates().find((candidate) => existsSync(candidate))
    ?? null
  if (!command) return { command: null, version: null }

  try {
    const { stdout } = await execFileAsync(command, ['--version'], { timeout: 5000 })
    return {
      command,
      version: stdout.trim() || null,
    }
  } catch {
    return {
      command,
      version: null,
    }
  }
}

export async function isCodexMcpConfigured(codexCommand: string | null, codexConfigPath?: string): Promise<boolean> {
  if (codexConfigPath && await codexConfigFileHasServer(codexConfigPath)) return true
  if (!codexCommand) return false
  try {
    const { stdout } = await execFileAsync(codexCommand, ['mcp', 'list'], { timeout: 8000 })
    return parseCodexMcpListHasServer(stdout)
  } catch {
    return codexConfigPath ? codexConfigFileHasServer(codexConfigPath) : false
  }
}

export async function installCodexMcpServer(
  codexCommand: string,
  config: CodexMcpCommandConfig,
): Promise<void> {
  if (!existsSync(config.sidecarScriptPath)) {
    throw new Error(`MCP sidecar script not found: ${config.sidecarScriptPath}`)
  }

  await execFileAsync(codexCommand, ['mcp', 'remove', config.serverName ?? CODEX_MCP_SERVER_NAME], {
    timeout: 8000,
  }).catch(() => {})

  await execFileAsync(codexCommand, createCodexMcpAddArgs(config), {
    timeout: 10000,
  })
}

export async function removeCodexMcpServer(codexCommand: string, serverName = CODEX_MCP_SERVER_NAME): Promise<void> {
  await execFileAsync(codexCommand, ['mcp', 'remove', serverName], {
    timeout: 8000,
  })
}
