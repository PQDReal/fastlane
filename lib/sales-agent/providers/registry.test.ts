import { describe, expect, it } from 'vitest'
import { DEFAULT_SALES_AGENT_PROVIDER, normalizeBaseUrl, normalizeEnvName, PROVIDER_DEFAULTS } from './config'

describe('sales agent provider configuration', () => {
  it('defaults to OpenAI GPT-5.6 Luna without exposing a key', () => {
    expect(DEFAULT_SALES_AGENT_PROVIDER.provider).toBe('openai')
    expect(DEFAULT_SALES_AGENT_PROVIDER.model).toBe('gpt-5.6-luna')
    expect(DEFAULT_SALES_AGENT_PROVIDER.apiKeyEnv).toBe('OPENAI_API_KEY')
    expect(Object.values(DEFAULT_SALES_AGENT_PROVIDER)).not.toContain(process.env.OPENAI_API_KEY)
  })

  it('declares all supported providers with disabled non-defaults', () => {
    expect(Object.keys(PROVIDER_DEFAULTS)).toEqual(['openai', 'anthropic', 'gemini', 'deepseek', 'openai-compatible'])
    expect(PROVIDER_DEFAULTS.anthropic.enabled).toBe(false)
    expect(PROVIDER_DEFAULTS['openai-compatible'].enabled).toBe(false)
  })

  it('rejects insecure remote endpoints and malformed secret names', () => {
    expect(() => normalizeBaseUrl('http://api.example.com/v1')).toThrow()
    expect(normalizeBaseUrl('http://localhost:11434/v1')).toContain('localhost')
    expect(() => normalizeEnvName('api-key')).toThrow()
  })
})
