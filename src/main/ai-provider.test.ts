import { describe, expect, it, vi } from 'vitest'

import { completeAiHelperPrompt, testAiHelperConnection } from './ai-provider'
import { DEFAULT_APP_SETTINGS } from './settings'

describe('completeAiHelperPrompt', () => {
  it('calls an OpenAI-compatible chat completions endpoint', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      choices: [
        {
          message: {
            content: '润色后的内容',
          },
        },
      ],
    }), { status: 200 }))

    const result = await completeAiHelperPrompt(
      {
        ...DEFAULT_APP_SETTINGS.aiHelper.provider,
        apiKey: 'sk-test',
        baseUrl: 'https://example.test/v1/',
        model: 'custom-model',
      },
      '请润色：原文',
      { fetchImpl },
    )

    expect(result).toEqual({
      ok: true,
      text: '润色后的内容',
    })
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://example.test/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer sk-test',
          'Content-Type': 'application/json',
        }),
      }),
    )
    expect(JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body))).toEqual({
      model: 'custom-model',
      messages: [
        {
          role: 'user',
          content: '请润色：原文',
        },
      ],
      temperature: 0.7,
    })
  })

  it('returns a configuration error when the API key is missing', async () => {
    const result = await completeAiHelperPrompt(
      {
        ...DEFAULT_APP_SETTINGS.aiHelper.provider,
        apiKey: '',
      },
      'prompt',
      { fetchImpl: vi.fn() },
    )

    expect(result).toEqual({
      ok: false,
      error: '请先在设置里填写 AI API Key。',
    })
  })
})

describe('testAiHelperConnection', () => {
  it('sends a minimal OpenAI-compatible request to verify the provider', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      choices: [
        {
          message: {
            content: 'OK',
          },
        },
      ],
    }), { status: 200 }))

    const result = await testAiHelperConnection(
      {
        ...DEFAULT_APP_SETTINGS.aiHelper.provider,
        apiKey: 'sk-test',
        baseUrl: 'https://example.test/v1/',
        model: 'custom-model',
      },
      { fetchImpl },
    )

    expect(result).toEqual({
      ok: true,
      text: 'AI 连接正常。',
    })
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://example.test/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer sk-test',
          'Content-Type': 'application/json',
        }),
      }),
    )
    expect(JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body))).toEqual({
      model: 'custom-model',
      messages: [
        {
          role: 'user',
          content: 'Reply with OK to confirm the connection.',
        },
      ],
      max_tokens: 8,
      temperature: 0,
    })
  })

  it('returns a configuration error when testing without an API key', async () => {
    const result = await testAiHelperConnection(
      {
        ...DEFAULT_APP_SETTINGS.aiHelper.provider,
        apiKey: '',
      },
      { fetchImpl: vi.fn() },
    )

    expect(result).toEqual({
      ok: false,
      error: '请先在设置里填写 AI API Key。',
    })
  })
})
