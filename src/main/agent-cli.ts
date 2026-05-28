import { existsSync, statSync } from 'fs'

export const DEFAULT_AGENT_CLI_COMMANDS = ['codex', 'gemini', 'claude'] as const
export const DEFAULT_SELECTION_PROMPT_FLAG = '--prompt'
export const DEFAULT_SELECTION_MAX_CHARS = 12000

export interface AgentCliSettingsInput {
  command?: unknown
  args?: unknown
  cwd?: unknown
  selectionPromptFlag?: unknown
  maxSelectionChars?: unknown
}

export interface AgentCliSettings {
  command: string | null
  args: string[]
  cwd: string | null
  selectionPromptFlag: string
  maxSelectionChars: number
}

export interface ResolvedAgentCliCommand {
  command: string
  args: string[]
  source: 'settings' | 'environment' | 'default'
}

export interface ResolveAgentCliCommandOptions {
  defaultCommands?: readonly string[]
  env?: Record<string, string | undefined>
}

export interface BuildAgentCliSpawnOptionsInput {
  fallbackCwd: string
  selection?: string | null
}

export interface AgentCliSpawnOptions {
  command: string
  args: string[]
  cwd: string
  shell: false
  windowsHide: true
}

export interface SanitizeSelectionOptions {
  maxChars?: number
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is string => isNonEmptyString(item))
    .map((item) => item.trim())
}

function clampSelectionMaxChars(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_SELECTION_MAX_CHARS
  return Math.max(1, Math.min(100000, Math.floor(value)))
}

export function normalizeAgentCliSettings(input: AgentCliSettingsInput | null | undefined): AgentCliSettings {
  return {
    command: isNonEmptyString(input?.command) ? input.command.trim() : null,
    args: normalizeStringArray(input?.args),
    cwd: isNonEmptyString(input?.cwd) ? input.cwd.trim() : null,
    selectionPromptFlag: isNonEmptyString(input?.selectionPromptFlag)
      ? input.selectionPromptFlag.trim()
      : DEFAULT_SELECTION_PROMPT_FLAG,
    maxSelectionChars: clampSelectionMaxChars(input?.maxSelectionChars),
  }
}

function splitCommandLine(value: string): string[] {
  const parts: string[] = []
  let current = ''
  let quote: '"' | "'" | null = null
  let escaping = false

  for (const char of value) {
    if (escaping) {
      current += char
      escaping = false
      continue
    }

    if (char === '\\' && quote !== "'") {
      escaping = true
      continue
    }

    if ((char === '"' || char === "'") && !quote) {
      quote = char
      continue
    }

    if (char === quote) {
      quote = null
      continue
    }

    if (/\s/.test(char) && !quote) {
      if (current.length > 0) {
        parts.push(current)
        current = ''
      }
      continue
    }

    current += char
  }

  if (escaping) current += '\\'
  if (current.length > 0) parts.push(current)
  return parts
}

function firstEnvCommand(env: Record<string, string | undefined>): string | null {
  return [
    env.LYRAMD_AGENT_CLI_COMMAND,
    env.COLAMD_AGENT_CLI_COMMAND,
    env.AGENT_CLI_COMMAND,
  ].find(isNonEmptyString)?.trim() ?? null
}

export function resolveAgentCliCommand(
  settings: AgentCliSettings,
  options: ResolveAgentCliCommandOptions = {},
): ResolvedAgentCliCommand {
  const envCommand = firstEnvCommand(options.env ?? process.env)
  const defaultCommand = options.defaultCommands?.find(isNonEmptyString)
    ?? DEFAULT_AGENT_CLI_COMMANDS[0]
  const rawCommand = settings.command ?? envCommand ?? defaultCommand
  const source = settings.command
    ? 'settings'
    : envCommand
      ? 'environment'
      : 'default'
  const commandParts = splitCommandLine(rawCommand)
  const [command = defaultCommand, ...commandArgs] = commandParts

  return {
    command,
    args: [...commandArgs, ...settings.args],
    source,
  }
}

function isDirectory(path: string): boolean {
  try {
    return existsSync(path) && statSync(path).isDirectory()
  } catch {
    return false
  }
}

export function sanitizeSelectionForPrompt(
  selection: string,
  options: SanitizeSelectionOptions = {},
): string {
  const maxChars = clampSelectionMaxChars(options.maxChars)
  if (selection.length <= maxChars) return selection
  return `${selection.slice(0, maxChars)}\n\n[Selection truncated to ${maxChars} characters.]`
}

export function buildAgentCliSpawnOptions(
  resolvedCommand: ResolvedAgentCliCommand,
  settings: AgentCliSettings,
  input: BuildAgentCliSpawnOptionsInput,
): AgentCliSpawnOptions {
  const cwd = settings.cwd && isDirectory(settings.cwd)
    ? settings.cwd
    : input.fallbackCwd
  const selection = typeof input.selection === 'string' && input.selection.length > 0
    ? sanitizeSelectionForPrompt(input.selection, { maxChars: settings.maxSelectionChars })
    : null
  const args = selection
    ? [...resolvedCommand.args, settings.selectionPromptFlag, selection]
    : [...resolvedCommand.args]

  return {
    command: resolvedCommand.command,
    args,
    cwd,
    shell: false,
    windowsHide: true,
  }
}
