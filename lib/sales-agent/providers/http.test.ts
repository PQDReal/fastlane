import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createOpenAiCompatibleProvider } from './http'

describe('Sales Agent OpenAI Responses adapter', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    process.env.OPENAI_API_KEY = 'test-key'
    process.env.SALES_AGENT_OPENAI_REASONING_EFFORT = 'low'
  })

  it('uses reasoning settings and does not send unsupported temperature to GPT-5.6 Luna', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ id: 'resp_1', model: 'gpt-5.6-luna', output: [{ type: 'message', content: [{ type: 'output_text', text: 'Đã rõ.' }] }] }), { status: 200 }))
    await createOpenAiCompatibleProvider('openai', 'responses').complete({ messages: [{ role: 'user', content: 'Xin chào' }], temperature: 0.2, maxOutputTokens: 64 }, { id: '1', provider: 'openai', displayName: 'OpenAI', model: 'gpt-5.6-luna', baseUrl: 'https://api.openai.com/v1', apiKeyEnv: 'OPENAI_API_KEY', enabled: true, isDefault: true })
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body))
    expect(body.temperature).toBeUndefined()
    expect(body.reasoning).toEqual({ effort: 'low' })
    expect(body.text).toEqual({ verbosity: 'low' })
  })

  it('rejects an empty provider message', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ output: [] }), { status: 200 }))
    await expect(createOpenAiCompatibleProvider('openai', 'responses').complete({ messages: [{ role: 'user', content: 'Xin chào' }] }, { id: '1', provider: 'openai', displayName: 'OpenAI', model: 'gpt-5.6-luna', baseUrl: 'https://api.openai.com/v1', apiKeyEnv: 'OPENAI_API_KEY', enabled: true, isDefault: true })).rejects.toThrow('không trả về nội dung')
  })
})
