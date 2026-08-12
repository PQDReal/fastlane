export const SALES_AGENT_PROVIDER_IDS = [
  'openai',
  'anthropic',
  'gemini',
  'deepseek',
  'openai-compatible',
] as const

export type SalesAgentProviderId = (typeof SALES_AGENT_PROVIDER_IDS)[number]

export type SalesAgentProviderConfig = {
  id: string
  provider: SalesAgentProviderId
  displayName: string
  model: string
  baseUrl: string
  apiKeyEnv: string
  enabled: boolean
  isDefault: boolean
  updatedAt?: string
}

export type SalesAgentProviderInput = {
  messages: Array<{
    role: 'system' | 'user' | 'assistant'
    content: string
  }>
  model?: string
  temperature?: number
  maxOutputTokens?: number
  signal?: AbortSignal
}

export type SalesAgentProviderResult = {
  text: string
  provider: SalesAgentProviderId
  model: string
  requestId?: string
  usage?: {
    inputTokens?: number
    outputTokens?: number
  }
}

export interface SalesAgentProvider {
  readonly id: SalesAgentProviderId
  complete(input: SalesAgentProviderInput, config: SalesAgentProviderConfig): Promise<SalesAgentProviderResult>
}

export type SalesAgentProviderSecretResolver = (envName: string) => string | undefined
