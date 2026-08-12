import 'server-only'

import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { DEFAULT_SALES_AGENT_PROVIDER, normalizeProviderConfig, PROVIDER_DEFAULTS } from './config'
import { providerImplementations } from './http'
import type { SalesAgentProviderConfig, SalesAgentProviderId, SalesAgentProviderInput, SalesAgentProviderResult } from './types'

const table = 'sales_agent_provider_configs'

export async function listSalesAgentProviderConfigs(): Promise<SalesAgentProviderConfig[]> {
  const { data, error } = await getSupabaseAdmin().from(table).select('id,provider,display_name,model,base_url,api_key_env,enabled,is_default,updated_at').order('provider')
  if (error) throw new Error(error.message)
  const persisted = new Map((data ?? []).map((row: any) => [row.provider, mapRow(row)]))
  return (Object.keys(PROVIDER_DEFAULTS) as SalesAgentProviderId[]).map((provider) => persisted.get(provider) ?? ({ id: `default-${provider}`, ...normalizeProviderConfig({ provider }) }))
}

export async function getDefaultSalesAgentProviderConfig() {
  const configs = await listSalesAgentProviderConfigs()
  return configs.find((config) => config.isDefault && config.enabled) ?? configs.find((config) => config.enabled) ?? { id: 'env-default', ...DEFAULT_SALES_AGENT_PROVIDER }
}

export async function saveSalesAgentProviderConfig(input: Partial<SalesAgentProviderConfig> & Pick<SalesAgentProviderConfig, 'provider'>) {
  const config = normalizeProviderConfig(input)
  const client = getSupabaseAdmin()
  if (config.isDefault) {
    const unsetDefaults = await client.from(table).update({ is_default: false, updated_at: new Date().toISOString() }).neq('provider', config.provider)
    if (unsetDefaults.error) throw new Error(unsetDefaults.error.message)
  }
  const { data, error } = await client.from(table).upsert({ provider: config.provider, display_name: config.displayName, model: config.model, base_url: config.baseUrl, api_key_env: config.apiKeyEnv, enabled: config.enabled, is_default: config.isDefault, updated_at: new Date().toISOString() }, { onConflict: 'provider' }).select('id,provider,display_name,model,base_url,api_key_env,enabled,is_default,updated_at').single()
  if (error) throw new Error(error.message)
  return mapRow(data)
}

export async function completeWithSalesAgentProvider(input: SalesAgentProviderInput, selectedProvider?: SalesAgentProviderId): Promise<SalesAgentProviderResult> {
  const config = selectedProvider
    ? (await listSalesAgentProviderConfigs()).find((item) => item.provider === selectedProvider)
    : await getDefaultSalesAgentProviderConfig()
  if (!config) throw new Error('Provider agent không tồn tại.')
  if (!config.enabled) throw new Error('Provider agent đang được tắt.')
  return providerImplementations[config.provider].complete(input, config)
}

function mapRow(row: any): SalesAgentProviderConfig {
  return { id: String(row.id), provider: row.provider, displayName: row.display_name, model: row.model, baseUrl: row.base_url, apiKeyEnv: row.api_key_env, enabled: row.enabled, isDefault: row.is_default, updatedAt: row.updated_at }
}
