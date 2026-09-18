import type {
  SalesAgentProvider,
  SalesAgentProviderConfig,
  SalesAgentProviderInput,
  SalesAgentProviderResult,
} from './types'

function readApiKey(config: SalesAgentProviderConfig) {
  const key = process.env[config.apiKeyEnv]
  if (!key) throw new Error(`Provider ${config.provider} chưa có API key trong biến môi trường ${config.apiKeyEnv}.`)
  return key
}

async function readJson(response: Response) {
  const payload = await response.json().catch(() => null) as Record<string, any> | null
  if (!response.ok) {
    const message = payload?.error?.message || payload?.message || `Provider trả về HTTP ${response.status}.`
    throw new Error(message)
  }
  return payload ?? {}
}

function openAiResult(payload: any, config: SalesAgentProviderConfig): SalesAgentProviderResult {
  const text = payload.output?.flatMap((item: any) => item.content ?? []).find((item: any) => item.type === 'output_text')?.text
    ?? payload.choices?.[0]?.message?.content
    ?? ''
  if (!text.trim()) throw new Error('Provider không trả về nội dung văn bản.')
  return { text, provider: config.provider, model: payload.model ?? config.model, requestId: payload.id, usage: { inputTokens: payload.usage?.input_tokens ?? payload.usage?.prompt_tokens, outputTokens: payload.usage?.output_tokens ?? payload.usage?.completion_tokens } }
}

export function createOpenAiCompatibleProvider(id: SalesAgentProvider['id'] = 'openai-compatible', endpoint: 'responses' | 'chat/completions' = 'chat/completions'): SalesAgentProvider {
  return {
    id,
    async complete(input, config) {
      const response = await fetch(`${config.baseUrl}/${endpoint}`, {
        method: 'POST', signal: input.signal,
        headers: { Authorization: `Bearer ${readApiKey(config)}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(endpoint === 'responses'
          ? { model: input.model ?? config.model, input: input.messages, max_output_tokens: input.maxOutputTokens, store: false, ...(id === 'openai' ? { reasoning: { effort: process.env.SALES_AGENT_OPENAI_REASONING_EFFORT ?? 'low' }, text: { verbosity: 'low' } } : {}) }
          : { model: input.model ?? config.model, messages: input.messages, temperature: input.temperature, max_tokens: input.maxOutputTokens }),
      })
      return openAiResult(await readJson(response), config)
    },
  }
}

export const anthropicProvider: SalesAgentProvider = {
  id: 'anthropic',
  async complete(input, config) {
    const system = input.messages.filter((message) => message.role === 'system').map((message) => message.content).join('\n\n')
    const response = await fetch(`${config.baseUrl}/messages`, {
      method: 'POST', signal: input.signal,
      headers: { 'x-api-key': readApiKey(config), 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: input.model ?? config.model, system, messages: input.messages.filter((message) => message.role !== 'system'), temperature: input.temperature, max_tokens: input.maxOutputTokens ?? 1024 }),
    })
    const payload = await readJson(response)
    const text = payload.content?.filter((item: any) => item.type === 'text').map((item: any) => item.text).join('') ?? ''
    if (!text.trim()) throw new Error('Provider không trả về nội dung văn bản.')
    return { text, provider: config.provider, model: payload.model ?? config.model, requestId: payload.id, usage: { inputTokens: payload.usage?.input_tokens, outputTokens: payload.usage?.output_tokens } }
  },
}

export const geminiProvider: SalesAgentProvider = {
  id: 'gemini',
  async complete(input, config) {
    const url = `${config.baseUrl}/models/${encodeURIComponent(input.model ?? config.model)}:generateContent?key=${encodeURIComponent(readApiKey(config))}`
    const response = await fetch(url, {
      method: 'POST', signal: input.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: input.messages.filter((message) => message.role === 'system').map((message) => message.content).join('\n\n') }] }, contents: input.messages.filter((message) => message.role !== 'system').map((message) => ({ role: message.role === 'assistant' ? 'model' : 'user', parts: [{ text: message.content }] })), generationConfig: { temperature: input.temperature, maxOutputTokens: input.maxOutputTokens } }),
    })
    const payload = await readJson(response)
    const text = payload.candidates?.[0]?.content?.parts?.map((part: any) => part.text ?? '').join('') ?? ''
    if (!text.trim()) throw new Error('Provider không trả về nội dung văn bản.')
    return { text, provider: config.provider, model: config.model, usage: { inputTokens: payload.usageMetadata?.promptTokenCount, outputTokens: payload.usageMetadata?.candidatesTokenCount } }
  },
}

export const providerImplementations: Record<SalesAgentProvider['id'], SalesAgentProvider> = {
  openai: createOpenAiCompatibleProvider('openai', 'responses'),
  'openai-compatible': createOpenAiCompatibleProvider(),
  anthropic: anthropicProvider,
  gemini: geminiProvider,
  deepseek: createOpenAiCompatibleProvider('deepseek', 'chat/completions'),
}
