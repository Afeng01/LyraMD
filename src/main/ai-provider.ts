import type { AiHelperProviderSettings } from './settings'

export interface AiHelperCompletionResult {
  ok: boolean
  text?: string
  error?: string
}

export interface CompleteAiHelperPromptOptions {
  fetchImpl?: typeof fetch
}

function joinChatCompletionsUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/u, '')}/chat/completions`
}

function readOpenAiCompatibleText(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null
  const choices = (payload as { choices?: unknown }).choices
  if (!Array.isArray(choices)) return null
  const first = choices[0]
  if (!first || typeof first !== 'object') return null
  const message = (first as { message?: unknown }).message
  if (!message || typeof message !== 'object') return null
  const content = (message as { content?: unknown }).content
  return typeof content === 'string' && content.trim() ? content.trim() : null
}

export async function completeAiHelperPrompt(
  provider: AiHelperProviderSettings,
  prompt: string,
  options: CompleteAiHelperPromptOptions = {},
): Promise<AiHelperCompletionResult> {
  if (!provider.apiKey) {
    return { ok: false, error: '请先在设置里填写 AI API Key。' }
  }
  if (!prompt.trim()) {
    return { ok: false, error: '请先选中文本并生成 Prompt。' }
  }

  try {
    const fetchImpl = options.fetchImpl ?? fetch
    const response = await fetchImpl(joinChatCompletionsUrl(provider.baseUrl), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${provider.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: provider.model,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: provider.temperature,
      }),
    })

    if (!response.ok) {
      const errorText = await response.text().catch(() => '')
      return {
        ok: false,
        error: errorText.trim() || `AI 请求失败：HTTP ${response.status}`,
      }
    }

    const text = readOpenAiCompatibleText(await response.json())
    if (!text) return { ok: false, error: 'AI 返回为空。' }
    return { ok: true, text }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'AI 请求失败。',
    }
  }
}
