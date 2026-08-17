import 'server-only'

import type { SalesAgentProviderId } from './types'

export interface ManagedApiKey {
  key: string
  maskedKey: string
  isCooldown: boolean
  cooldownUntil: number
  errorCount: number
  successCount: number
  lastUsedAt: number
}

export class ApiKeyPoolManager {
  private static instance: ApiKeyPoolManager
  private pools: Map<string, ManagedApiKey[]> = new Map()
  private roundRobinIndices: Map<string, number> = new Map()

  private constructor() {}

  public static getInstance(): ApiKeyPoolManager {
    if (!ApiKeyPoolManager.instance) {
      ApiKeyPoolManager.instance = new ApiKeyPoolManager()
    }
    return ApiKeyPoolManager.instance
  }

  /**
   * Parses raw env strings supporting single keys, comma-separated keys, or multiline keys.
   */
  public parseKeysFromEnv(envName: string): string[] {
    const rawKeys: string[] = []
    
    // Check primary env name (e.g. OPENAI_API_KEY)
    const primary = process.env[envName]
    if (primary) {
      rawKeys.push(...primary.split(/[\n,;]+/))
    }

    // Check plural env name (e.g. OPENAI_API_KEYS)
    const pluralName = envName.endsWith('S') ? envName : `${envName}S`
    const plural = process.env[pluralName]
    if (plural && plural !== primary) {
      rawKeys.push(...plural.split(/[\n,;]+/))
    }

    const uniqueKeys = Array.from(
      new Set(
        rawKeys
          .map((k) => k.trim().replace(/^["']|["']$/g, ''))
          .filter((k) => k.length > 5),
      ),
    )

    return uniqueKeys
  }

  private maskKey(key: string): string {
    if (key.length <= 10) return '***'
    return `${key.slice(0, 4)}...${key.slice(-4)}`
  }

  /**
   * Initializes or syncs keys in the pool from environment variables and custom keys.
   */
  public syncPool(providerKey: string, envName?: string, customKeys?: string[]): ManagedApiKey[] {
    const rawKeys: string[] = []
    if (envName) {
      rawKeys.push(...this.parseKeysFromEnv(envName))
    }
    if (Array.isArray(customKeys)) {
      for (const k of customKeys) {
        if (typeof k === 'string' && k.trim().length > 5) {
          rawKeys.push(k.trim().replace(/^["']|["']$/g, ''))
        }
      }
    }

    const uniqueKeys = Array.from(new Set(rawKeys.filter((k) => k.length > 5)))
    const existingList = this.pools.get(providerKey) || []
    const existingMap = new Map(existingList.map((k) => [k.key, k]))

    const updatedList: ManagedApiKey[] = uniqueKeys.map((key) => {
      const existing = existingMap.get(key)
      if (existing) return existing
      return {
        key,
        maskedKey: this.maskKey(key),
        isCooldown: false,
        cooldownUntil: 0,
        errorCount: 0,
        successCount: 0,
        lastUsedAt: 0,
      }
    })

    this.pools.set(providerKey, updatedList)
    return updatedList
  }

  /**
   * Retrieves the next available API key using Round-Robin across healthy keys.
   */
  public getNextKey(providerKey: string, envName?: string, customKeys?: string[]): string {
    const pool = this.syncPool(providerKey, envName, customKeys)
    if (pool.length === 0) {
      throw new Error(`Provider ${providerKey} chưa có API key nào trong biến môi trường ${envName || ''} hoặc danh sách Custom Keys.`)
    }

    const now = Date.now()
    // 1. Filter healthy keys not in cooldown
    const healthyKeys = pool.filter((k) => k.cooldownUntil <= now)

    let selectedKeyItem: ManagedApiKey

    if (healthyKeys.length > 0) {
      const currentIndex = this.roundRobinIndices.get(providerKey) ?? 0
      const nextIndex = currentIndex % healthyKeys.length
      selectedKeyItem = healthyKeys[nextIndex]
      this.roundRobinIndices.set(providerKey, (nextIndex + 1) % healthyKeys.length)
    } else {
      // 2. All keys are in cooldown; fallback to the one expiring soonest
      selectedKeyItem = pool.slice().sort((a, b) => a.cooldownUntil - b.cooldownUntil)[0]
      console.warn(`[API_KEY_POOL] All keys for provider ${providerKey} are in cooldown. Reusing earliest expiring key (${selectedKeyItem.maskedKey}).`)
    }

    selectedKeyItem.lastUsedAt = now
    return selectedKeyItem.key
  }

  public resetForTesting(): void {
    this.pools.clear()
    this.roundRobinIndices.clear()
  }

  /**
   * Marks a key into temporary cooldown (e.g. 60 seconds) when a 429 / Quota / 5xx error is received.
   */
  public markKeyError(providerKey: string, key: string, cooldownMs: number = 60_000): void {
    const pool = this.pools.get(providerKey) || []
    let item = pool.find((k) => k.key === key)
    if (!item) {
      item = {
        key,
        maskedKey: this.maskKey(key),
        isCooldown: true,
        cooldownUntil: Date.now() + cooldownMs,
        errorCount: 1,
        successCount: 0,
        lastUsedAt: Date.now(),
      }
      pool.push(item)
      this.pools.set(providerKey, pool)
    } else {
      item.errorCount++
      item.isCooldown = true
      item.cooldownUntil = Date.now() + cooldownMs
    }
    console.warn(`[API_KEY_POOL] Provider ${providerKey} key ${item.maskedKey} placed in cooldown for ${cooldownMs / 1000}s (Error count: ${item.errorCount}).`)
  }

  /**
   * Records success for a key.
   */
  public markKeySuccess(providerKey: string, key: string): void {
    const pool = this.pools.get(providerKey) || []
    let item = pool.find((k) => k.key === key)
    if (!item) {
      item = {
        key,
        maskedKey: this.maskKey(key),
        isCooldown: false,
        cooldownUntil: 0,
        errorCount: 0,
        successCount: 1,
        lastUsedAt: Date.now(),
      }
      pool.push(item)
      this.pools.set(providerKey, pool)
    } else {
      item.successCount++
      item.isCooldown = false
      item.cooldownUntil = 0
    }
  }

  /**
   * Returns health summary for provider key pool.
   */
  public getPoolStatus(providerKey: string, envName?: string, customKeys?: string[]) {
    const pool = this.syncPool(providerKey, envName, customKeys)
    const now = Date.now()
    return {
      providerKey,
      totalKeys: pool.length,
      activeKeys: pool.filter((k) => k.cooldownUntil <= now).length,
      coolingDownKeys: pool.filter((k) => k.cooldownUntil > now).length,
      keys: pool.map((k) => ({
        maskedKey: k.maskedKey,
        isCooldown: k.cooldownUntil > now,
        cooldownRemainingSec: Math.max(0, Math.ceil((k.cooldownUntil - now) / 1000)),
        successCount: k.successCount,
        errorCount: k.errorCount,
      })),
    }
  }
}

export const apiKeyPoolManager = ApiKeyPoolManager.getInstance()
