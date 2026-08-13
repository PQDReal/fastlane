import 'server-only'

import { createAnthropic } from '@ai-sdk/anthropic'
import { createDeepSeek } from '@ai-sdk/deepseek'
import { createGoogle } from '@ai-sdk/google'
import { createOpenAI } from '@ai-sdk/openai'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import type { LanguageModel } from 'ai'

import type { SalesAgentProviderConfig } from './types'

export type SalesAgentLanguageModel = {
  model: LanguageModel
  provider: SalesAgentProviderConfig['provider']
  modelId: string
}

function readApiKey(config: SalesAgentProviderConfig) {
  const key = process.env[config.apiKeyEnv]
  if (!key) throw new Error(`Provider ${config.provider} chưa có API key trong biến môi trường ${config.apiKeyEnv}.`)
  return key
}

/**
 * Adapts the provider configuration stored by Fastlane to the Vercel AI SDK.
 * The harness owns policy and execution; this module only translates provider
 * identity, endpoint and credentials into a language model instance.
 */
export function createSalesAgentLanguageModel(config: SalesAgentProviderConfig): SalesAgentLanguageModel {
  const apiKey = readApiKey(config)

  switch (config.provider) {
    case 'openai': {
      const provider = createOpenAI({ apiKey, baseURL: config.baseUrl })
      return { model: provider.responses(config.model), provider: config.provider, modelId: config.model }
    }
    case 'anthropic': {
      const provider = createAnthropic({ apiKey, baseURL: config.baseUrl })
      return { model: provider.messages(config.model), provider: config.provider, modelId: config.model }
    }
    case 'gemini': {
      const provider = createGoogle({ apiKey, baseURL: config.baseUrl })
      return { model: provider.chat(config.model), provider: config.provider, modelId: config.model }
    }
    case 'deepseek': {
      const provider = createDeepSeek({ apiKey, baseURL: config.baseUrl })
      return { model: provider.chat(config.model), provider: config.provider, modelId: config.model }
    }
    case 'openai-compatible': {
      const provider = createOpenAICompatible({ apiKey, baseURL: config.baseUrl, name: 'fastlane-openai-compatible' })
      return { model: provider.chatModel(config.model), provider: config.provider, modelId: config.model }
    }
  }
}
