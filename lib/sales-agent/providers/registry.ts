import 'server-only'

import { generateText } from 'ai'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { DEFAULT_SALES_AGENT_PROVIDER, normalizeProviderConfig, PROVIDER_DEFAULTS } from './config'
import { createSalesAgentLanguageModel, type SalesAgentLanguageModel } from './ai-sdk'
import { apiKeyPoolManager } from './key-pool'
import { providerImplementations } from './http'
import type { SalesAgentProviderConfig, SalesAgentProviderId, SalesAgentProviderInput, SalesAgentProviderResult } from './types'

let cachedProviderConfigs: SalesAgentProviderConfig[] | null = null
let lastProviderConfigsFetchedAt = 0
const PROVIDER_CACHE_TTL_MS = 10 * 60 * 1000 // 10 minutes
const table = 'sales_agent_provider_configs'

const SEEDED_ROUTER_INSTANCES: SalesAgentProviderConfig[] = [
  {
    id: 'openai-primary',
    provider: 'openai',
    displayName: 'OpenAI GPT-5.6 (Chính)',
    model: process.env.SALES_AGENT_OPENAI_MODEL?.trim() || 'gpt-5.6-luna',
    baseUrl: 'https://api.openai.com/v1',
    apiKeyEnv: 'OPENAI_API_KEY',
    priority: 1,
    timeoutMs: 5000,
    enabled: true,
    isDefault: true,
  },
  {
    id: 'openai-backup',
    provider: 'openai',
    displayName: 'OpenAI GPT-4o (Dự phòng 1)',
    model: 'gpt-4o',
    baseUrl: 'https://api.openai.com/v1',
    apiKeyEnv: 'OPENAI_API_KEY',
    priority: 2,
    timeoutMs: 4000,
    enabled: true,
    isDefault: false,
  },
  {
    id: 'deepseek-v3',
    provider: 'deepseek',
    displayName: 'DeepSeek-V3 (Dự phòng 2)',
    model: 'deepseek-chat',
    baseUrl: 'https://api.deepseek.com/v1',
    apiKeyEnv: 'DEEPSEEK_API_KEY',
    priority: 3,
    timeoutMs: 5000,
    enabled: false,
    isDefault: false,
  },
  {
    id: 'anthropic-claude',
    provider: 'anthropic',
    displayName: 'Claude 3.5 Sonnet',
    model: 'claude-sonnet-4-5',
    baseUrl: 'https://api.anthropic.com/v1',
    apiKeyEnv: 'ANTHROPIC_API_KEY',
    priority: 4,
    timeoutMs: 5000,
    enabled: false,
    isDefault: false,
  },
  {
    id: 'gemini-flash',
    provider: 'gemini',
    displayName: 'Google Gemini 2.5 Flash',
    model: 'gemini-2.5-flash',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    apiKeyEnv: 'GEMINI_API_KEY',
    priority: 5,
    timeoutMs: 5000,
    enabled: false,
    isDefault: false,
  },
  {
    id: 'openai-compatible-local',
    provider: 'openai-compatible',
    displayName: 'Local Gateway (Ollama/vLLM)',
    model: 'local-model',
    baseUrl: 'http://localhost:11434/v1',
    apiKeyEnv: 'OPENAI_COMPATIBLE_API_KEY',
    priority: 6,
    timeoutMs: 8000,
    enabled: false,
    isDefault: false,
  },
]

export async function listSalesAgentProviderConfigs(): Promise<SalesAgentProviderConfig[]> {
  const now = Date.now()
  if (cachedProviderConfigs && now - lastProviderConfigsFetchedAt < PROVIDER_CACHE_TTL_MS) {
    return cachedProviderConfigs
  }

  try {
    const timeoutPromise = new Promise<{ data: null; error: Error }>((resolve) =>
      setTimeout(() => resolve({ data: null, error: new Error('Supabase provider config fetch timeout') }), 2500),
    )
    const fetchPromise = getSupabaseAdmin()
      .from(table)
      .select('id,provider,display_name,model,base_url,api_key_env,enabled,is_default,updated_at')
      .order('is_default', { ascending: false })

    const { data, error } = await Promise.race([fetchPromise, timeoutPromise])

    if (error || !data || data.length === 0) {
      cachedProviderConfigs = SEEDED_ROUTER_INSTANCES
      lastProviderConfigsFetchedAt = now
      return cachedProviderConfigs
    }

    const configs = data.map((row: any, idx: number) => mapRow(row, idx + 1))
    // Sort by priority ASC
    configs.sort((a: any, b: any) => (a.priority ?? 99) - (b.priority ?? 99))

    cachedProviderConfigs = configs
    lastProviderConfigsFetchedAt = now
    return configs
  } catch (err: any) {
    console.warn('[SALES_AGENT_REGISTRY] Network exception fetching provider configs; falling back to router defaults:', err?.message)
    cachedProviderConfigs = SEEDED_ROUTER_INSTANCES
    return cachedProviderConfigs
  }
}

export async function getDefaultSalesAgentProviderConfig(): Promise<SalesAgentProviderConfig> {
  const configs = await listSalesAgentProviderConfigs()
  return (
    configs.find((config) => config.isDefault && config.enabled) ??
    configs.find((config) => config.enabled) ??
    SEEDED_ROUTER_INSTANCES[0]
  )
}

export function invalidateProviderCache() {
  cachedProviderConfigs = null
  lastProviderConfigsFetchedAt = 0
}

export async function saveSalesAgentProviderConfig(input: Partial<SalesAgentProviderConfig> & Pick<SalesAgentProviderConfig, 'provider'>) {
  const normalized = normalizeProviderConfig(input)
  const id = input.id?.trim() || `${normalized.provider}-${Date.now().toString(36)}`
  const client = getSupabaseAdmin()

  if (normalized.isDefault) {
    try {
      await client.from(table).update({ is_default: false, updated_at: new Date().toISOString() }).neq('id', id)
    } catch {
      // Ignore DB write errors
    }
  }

  const payload: any = {
    id,
    provider: normalized.provider,
    display_name: normalized.displayName,
    model: normalized.model,
    base_url: normalized.baseUrl,
    api_key_env: normalized.apiKeyEnv,
    enabled: normalized.enabled,
    is_default: normalized.isDefault,
    updated_at: new Date().toISOString(),
  }

  let data: any = null
  let error: any = null
  try {
    const res = await client.from(table).upsert(payload, { onConflict: 'id' }).select('*').single()
    data = res.data
    error = res.error
  } catch (err: any) {
    error = err
  }
  
  if (error || !data) {
    console.warn('[SALES_AGENT_REGISTRY] Could not upsert to DB; saving in-memory:', error?.message)
    const existing = cachedProviderConfigs || [...SEEDED_ROUTER_INSTANCES]
    const idx = existing.findIndex((e) => e.id === id || e.provider === normalized.provider)
    const savedConfig: SalesAgentProviderConfig = {
      id,
      ...normalized,
      updatedAt: new Date().toISOString(),
    }
    if (idx >= 0) {
      existing[idx] = savedConfig
    } else {
      existing.push(savedConfig)
    }
    if (savedConfig.isDefault) {
      for (const item of existing) {
        if (item.id !== id) item.isDefault = false
      }
    }
    cachedProviderConfigs = existing
    return savedConfig
  }

  invalidateProviderCache()
  return mapRow(data, input.priority ?? 1)
}

export async function deleteSalesAgentProviderConfig(id: string): Promise<boolean> {
  const client = getSupabaseAdmin()
  try {
    await client.from(table).delete().eq('id', id)
  } catch {
    // Ignore DB error
  }
  if (cachedProviderConfigs) {
    cachedProviderConfigs = cachedProviderConfigs.filter((c) => c.id !== id)
  }
  invalidateProviderCache()
  return true
}

export async function testSalesAgentProviderConnection(config: SalesAgentProviderConfig): Promise<{
  ok: boolean
  latencyMs: number
  response?: string
  error?: string
}> {
  const start = Date.now()
  try {
    const lm = createSalesAgentLanguageModel(config)
    const result = await generateText({
      model: lm.model,
      prompt: 'Trả lời đúng 1 từ "FASTLANE_OK".',
      maxOutputTokens: 20,
      abortSignal: AbortSignal.timeout(config.timeoutMs || 6000),
    })

    const latencyMs = Date.now() - start
    return {
      ok: true,
      latencyMs,
      response: result.text.trim(),
    }
  } catch (err: any) {
    const latencyMs = Date.now() - start
    return {
      ok: false,
      latencyMs,
      error: err?.message || 'Không thể kết nối đến Provider API',
    }
  }
}

export async function completeWithSalesAgentProvider(input: SalesAgentProviderInput, selectedProvider?: SalesAgentProviderId): Promise<SalesAgentProviderResult> {
  const config = selectedProvider
    ? (await listSalesAgentProviderConfigs()).find((item) => item.provider === selectedProvider || item.id === (selectedProvider as string))
    : await getDefaultSalesAgentProviderConfig()
  if (!config) throw new Error('Provider agent không tồn tại.')
  if (!config.enabled) throw new Error('Provider agent đang được tắt.')
  return providerImplementations[config.provider].complete(input, config)
}

export async function getSalesAgentLanguageModel(selectedIdOrProvider?: string): Promise<SalesAgentLanguageModel> {
  const configs = await listSalesAgentProviderConfigs()
  const config = selectedIdOrProvider
    ? configs.find((item) => item.id === selectedIdOrProvider || item.provider === selectedIdOrProvider)
    : await getDefaultSalesAgentProviderConfig()
  if (!config) throw new Error('Provider agent không tồn tại.')
  if (!config.enabled) throw new Error('Provider agent đang được tắt.')
  return createSalesAgentLanguageModel(config)
}

export async function getAvailableFallbackLanguageModels(primaryProviderOrId?: string): Promise<SalesAgentLanguageModel[]> {
  const configs = await listSalesAgentProviderConfigs()
  const fallbacks: SalesAgentLanguageModel[] = []

  // Sort by priority ASC
  const sorted = [...configs].sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99))

  for (const config of sorted) {
    if (config.id === primaryProviderOrId || config.provider === primaryProviderOrId) continue
    if (!config.enabled) continue

    const rawKeys = apiKeyPoolManager.parseKeysFromEnv(config.apiKeyEnv)
    const customKeys = config.customApiKeys || []
    if (rawKeys.length > 0 || customKeys.length > 0) {
      try {
        const lm = createSalesAgentLanguageModel(config)
        fallbacks.push(lm)
      } catch {
        // Skip if provider initialization fails
      }
    }
  }

  return fallbacks
}

function mapRow(row: any, fallbackPriority: number = 1): SalesAgentProviderConfig {
  return {
    id: String(row.id || row.provider),
    provider: row.provider,
    displayName: row.display_name,
    model: row.model,
    baseUrl: row.base_url,
    apiKeyEnv: row.api_key_env,
    customApiKeys: Array.isArray(row.custom_api_keys) ? row.custom_api_keys : [],
    priority: typeof row.priority === 'number' ? row.priority : fallbackPriority,
    timeoutMs: typeof row.timeout_ms === 'number' ? row.timeout_ms : 5000,
    enabled: Boolean(row.enabled),
    isDefault: Boolean(row.is_default),
    updatedAt: row.updated_at,
  }
}
