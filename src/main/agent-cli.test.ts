import { mkdtemp, mkdir, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  buildAgentCliSpawnOptions,
  normalizeAgentCliSettings,
  resolveAgentCliCommand,
  sanitizeSelectionForPrompt,
} from './agent-cli'

describe('agent CLI backend helpers', () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'lyramd-agent-cli-'))
  })

  afterEach(() => {
    tempDir = ''
  })

  it('normalizes an empty command without producing an empty argv command', () => {
    const settings = normalizeAgentCliSettings({ command: '   ' })
    const command = resolveAgentCliCommand(settings, {
      defaultCommands: ['codex', 'gemini', 'claude'],
      env: {},
    })

    expect(settings.command).toBe(null)
    expect(command).toEqual({
      command: 'codex',
      args: [],
      source: 'default',
    })
  })

  it('keeps configured command arguments as spawn argv entries', () => {
    const settings = normalizeAgentCliSettings({
      command: 'codex --model gpt-5',
      args: ['--ask-for-approval', 'never'],
    })

    expect(resolveAgentCliCommand(settings, { env: {} })).toEqual({
      command: 'codex',
      args: ['--model', 'gpt-5', '--ask-for-approval', 'never'],
      source: 'settings',
    })
  })

  it('uses an environment command when settings do not choose one', () => {
    const settings = normalizeAgentCliSettings({})

    expect(resolveAgentCliCommand(settings, {
      env: { LYRAMD_AGENT_CLI_COMMAND: 'gemini --model flash' },
    })).toEqual({
      command: 'gemini',
      args: ['--model', 'flash'],
      source: 'environment',
    })
  })

  it('falls back from an illegal cwd to the caller fallback directory', async () => {
    const validCwd = join(tempDir, 'workspace')
    const filePath = join(tempDir, 'note.md')
    await mkdir(validCwd)
    await writeFile(filePath, '# note', 'utf8')

    const settings = normalizeAgentCliSettings({
      command: 'codex',
      cwd: filePath,
    })
    const command = resolveAgentCliCommand(settings, { env: {} })
    const spawnOptions = buildAgentCliSpawnOptions(command, settings, {
      fallbackCwd: validCwd,
    })

    expect(spawnOptions.cwd).toBe(validCwd)
    expect(spawnOptions.command).toBe('codex')
  })

  it('trims overlong selected text and marks the prompt as truncated', () => {
    const prompt = sanitizeSelectionForPrompt('abcdef', { maxChars: 4 })

    expect(prompt).toBe('abcd\n\n[Selection truncated to 4 characters.]')
  })

  it('injects selected text as a single argv entry instead of shell text', () => {
    const selection = 'hello"; rm -rf / #'
    const settings = normalizeAgentCliSettings({
      command: 'codex',
      args: ['exec'],
      selectionPromptFlag: '--prompt',
    })
    const command = resolveAgentCliCommand(settings, { env: {} })
    const spawnOptions = buildAgentCliSpawnOptions(command, settings, {
      fallbackCwd: tempDir,
      selection,
    })

    expect(spawnOptions.shell).toBe(false)
    expect(spawnOptions.args).toEqual(['exec', '--prompt', selection])
  })
})
