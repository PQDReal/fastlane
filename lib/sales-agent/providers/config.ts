import type { SalesAgentProviderConfig, SalesAgentProviderId } from './types'

export const DEFAULT_SALES_AGENT_PROVIDER: Omit<SalesAgentProviderConfig, 'id' | 'updatedAt'> = {
  provider: 'openai',
  displayName: 'OpenAI',
  model: process.env.SALES_AGENT_OPENAI_MODEL?.trim() || 'gpt-5.6-luna',
  baseUrl: 'https://api.openai.com/v1',
  apiKeyEnv: 'OPENAI_API_KEY',
  enabled: true,
  isDefault: true,
}

export const PROVIDER_DEFAULTS: Record<SalesAgentProviderId, Omit<SalesAgentProviderConfig, 'id' | 'updatedAt'>> = {
  openai: DEFAULT_SALES_AGENT_PROVIDER,
  anthropic: {
    provider: 'anthropic',
    displayName: 'Anthropic',
    model: 'claude-sonnet-4-5',
    baseUrl: 'https://api.anthropic.com/v1',
    apiKeyEnv: 'ANTHROPIC_API_KEY',
    enabled: false,
    isDefault: false,
  },
  gemini: {
    provider: 'gemini',
    displayName: 'Google Gemini',
    model: 'gemini-2.5-flash',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    apiKeyEnv: 'GEMINI_API_KEY',
    enabled: false,
    isDefault: false,
  },
  deepseek: {
    provider: 'deepseek',
    displayName: 'DeepSeek',
    model: 'deepseek-chat',
    baseUrl: 'https://api.deepseek.com/v1',
    apiKeyEnv: 'DEEPSEEK_API_KEY',
    enabled: false,
    isDefault: false,
  },
  'openai-compatible': {
    provider: 'openai-compatible',
    displayName: 'OpenAI Compatible',
    model: 'local-model',
    baseUrl: 'http://localhost:11434/v1',
    apiKeyEnv: 'OPENAI_COMPATIBLE_API_KEY',
    enabled: false,
    isDefault: false,
  },
}

export const SALES_AGENT_PROVIDER_ENV_KEYS: Record<SalesAgentProviderId, string> = {
  openai: 'OPENAI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  gemini: 'GEMINI_API_KEY',
  deepseek: 'DEEPSEEK_API_KEY',
  'openai-compatible': 'OPENAI_COMPATIBLE_API_KEY',
}

export function providerDisplayName(provider: SalesAgentProviderId) {
  return PROVIDER_DEFAULTS[provider].displayName
}

export function isSalesAgentProviderId(value: unknown): value is SalesAgentProviderId {
  return typeof value === 'string' && value in PROVIDER_DEFAULTS
}

export function normalizeProviderConfig(input: Partial<SalesAgentProviderConfig> & Pick<SalesAgentProviderConfig, 'provider'>): Omit<SalesAgentProviderConfig, 'id' | 'updatedAt'> {
  const defaults = PROVIDER_DEFAULTS[input.provider] || DEFAULT_SALES_AGENT_PROVIDER
  return {
    ...defaults,
    displayName: typeof input.displayName === 'string' && input.displayName.trim() ? input.displayName.trim().slice(0, 80) : defaults.displayName,
    model: typeof input.model === 'string' && input.model.trim() ? input.model.trim().slice(0, 160) : defaults.model,
    baseUrl: normalizeBaseUrl(typeof input.baseUrl === 'string' && input.baseUrl.trim() ? input.baseUrl : defaults.baseUrl),
    apiKeyEnv: normalizeEnvName(typeof input.apiKeyEnv === 'string' && input.apiKeyEnv.trim() ? input.apiKeyEnv : defaults.apiKeyEnv),
    customApiKeys: Array.isArray(input.customApiKeys) ? input.customApiKeys.filter((k) => typeof k === 'string' && k.length > 5) : [],
    priority: typeof input.priority === 'number' ? Math.max(1, Math.min(99, input.priority)) : 1,
    timeoutMs: typeof input.timeoutMs === 'number' ? Math.max(1000, Math.min(60000, input.timeoutMs)) : 5000,
    enabled: typeof input.enabled === 'boolean' ? input.enabled : defaults.enabled,
    isDefault: typeof input.isDefault === 'boolean' ? input.isDefault : defaults.isDefault,
    provider: input.provider,
  }
}

export function normalizeBaseUrl(value: string) {
  const url = new URL(value)
  if (url.protocol !== 'https:' && !isLocalhost(url.hostname)) {
    throw new Error('Base URL của provider phải dùng HTTPS, trừ endpoint localhost.')
  }
  return url.toString().replace(/\/$/, '')
}

export function normalizeEnvName(value: string) {
  if (!/^[A-Z][A-Z0-9_]{1,127}$/.test(value)) throw new Error('Tên biến môi trường API key không hợp lệ.')
  return value
}

function isLocalhost(hostname: string) {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1'
}
