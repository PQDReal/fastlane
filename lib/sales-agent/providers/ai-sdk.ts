import 'server-only'

import { createAnthropic } from '@ai-sdk/anthropic'
import { createDeepSeek } from '@ai-sdk/deepseek'
import { createGoogle } from '@ai-sdk/google'
import { createOpenAI } from '@ai-sdk/openai'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import type { LanguageModel } from 'ai'

import { type SalesAgentDebugContext } from '../debug-log'
import type { SalesAgentProviderConfig } from './types'
import { apiKeyPoolManager } from './key-pool'
import { createObservedProviderFetch } from './observed-fetch'

export type SalesAgentLanguageModel = {
  model: LanguageModel
  provider: SalesAgentProviderConfig['provider']
  modelId: string
  config: SalesAgentProviderConfig
  usedApiKey: string
  setActiveProviderCallKey?: (modelCallKey: string | undefined) => void
}

/**
 * Adapts the provider configuration stored by Fastlane to the Vercel AI SDK.
 * The harness owns policy and execution; this module translates provider
 * identity, endpoint and rotated credentials into a language model instance.
 */
export function createSalesAgentLanguageModel(
  config: SalesAgentProviderConfig,
  explicitApiKey?: string,
  debugContext?: SalesAgentDebugContext,
): SalesAgentLanguageModel {
  const apiKey = explicitApiKey || apiKeyPoolManager.getNextKey(config.provider, config.apiKeyEnv)
  const observedFetch = createObservedProviderFetch({ config, debugContext })

  switch (config.provider) {
    case 'openai': {
      const provider = createOpenAI({ apiKey, baseURL: config.baseUrl, fetch: observedFetch })
      return {
        model: provider.responses(config.model),
        provider: config.provider,
        modelId: config.model,
        config,
        usedApiKey: apiKey,
        setActiveProviderCallKey: observedFetch.setActiveModelCallKey,
      }
    }
    case 'anthropic': {
      const provider = createAnthropic({ apiKey, baseURL: config.baseUrl })
      return {
        model: provider.messages(config.model),
        provider: config.provider,
        modelId: config.model,
        config,
        usedApiKey: apiKey,
        setActiveProviderCallKey: observedFetch.setActiveModelCallKey,
      }
    }
    case 'gemini': {
      const provider = createGoogle({ apiKey, baseURL: config.baseUrl })
      return {
        model: provider.chat(config.model),
        provider: config.provider,
        modelId: config.model,
        config,
        usedApiKey: apiKey,
      }
    }
    case 'deepseek': {
      const provider = createDeepSeek({ apiKey, baseURL: config.baseUrl })
      return {
        model: provider.chat(config.model),
        provider: config.provider,
        modelId: config.model,
        config,
        usedApiKey: apiKey,
      }
    }
    case 'openai-compatible': {
      const provider = createOpenAICompatible({ apiKey, baseURL: config.baseUrl, name: 'fastlane-openai-compatible', fetch: observedFetch })
      return {
        model: provider.chatModel(config.model),
        provider: config.provider,
        modelId: config.model,
        config,
        usedApiKey: apiKey,
      }
    }
  }
}
