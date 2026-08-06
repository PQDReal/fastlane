import 'server-only'

import Redis from 'ioredis'

import {
  completeCacheSourceLoad,
  getCachePerformanceSnapshot,
  recordCacheRead,
} from '@/lib/cache-performance'

const DEFAULT_CONNECT_TIMEOUT_MS = 500
const REDIS_FAILURE_COOLDOWN_MS = 15_000

type RedisGlobal = typeof globalThis & {
  fastlaneRedis?: Redis
  fastlaneRedisWarningShown?: boolean
  fastlaneRedisUnavailableUntil?: number
}

const redisGlobal = globalThis as RedisGlobal

function reportRedisFallback(error: unknown) {
  redisGlobal.fastlaneRedisUnavailableUntil = Date.now() + REDIS_FAILURE_COOLDOWN_MS
  if (redisGlobal.fastlaneRedisWarningShown) return
  redisGlobal.fastlaneRedisWarningShown = true
  const message = error instanceof Error ? error.message : String(error)
  console.warn(`[redis] Cache unavailable; using the primary database: ${message}`)
}

export function isRedisConfigured() {
  return Boolean(process.env.REDIS_URL?.trim())
}

function createRedisClient() {
  const redisUrl = process.env.REDIS_URL?.trim()
  if (!redisUrl) return null

  const client = new Redis(redisUrl, {
    lazyConnect: true,
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    connectTimeout: DEFAULT_CONNECT_TIMEOUT_MS,
    retryStrategy: () => null,
  })

  client.on('error', reportRedisFallback)
  return client
}

export function getRedisClient() {
  if (!isRedisConfigured()) return null
  if (!redisGlobal.fastlaneRedis || redisGlobal.fastlaneRedis.status === 'end') {
    redisGlobal.fastlaneRedis = createRedisClient() ?? undefined
  }
  return redisGlobal.fastlaneRedis ?? null
}

async function connectedRedis() {
  if ((redisGlobal.fastlaneRedisUnavailableUntil ?? 0) > Date.now()) return null

  const client = getRedisClient()
  if (!client) return null

  try {
    if (client.status === 'wait') await client.connect()
    if (client.status !== 'ready') {
      reportRedisFallback(new Error(`Redis client is ${client.status}`))
      return null
    }
    redisGlobal.fastlaneRedisUnavailableUntil = 0
    return client
  } catch (error) {
    reportRedisFallback(error)
    return null
  }
}

export async function readRedisJson<T>(key: string): Promise<T | null> {
  const startedAt = performance.now()
  try {
    const client = await connectedRedis()
    if (!client) {
      recordCacheRead(key, 'BYPASS', performance.now() - startedAt)
      return null
    }
    const value = await client.get(key)
    const parsed = value ? (JSON.parse(value) as T) : null
    recordCacheRead(key, value ? 'HIT' : 'MISS', performance.now() - startedAt)
    return parsed
  } catch (error) {
    reportRedisFallback(error)
    recordCacheRead(key, 'BYPASS', performance.now() - startedAt)
    return null
  }
}

export async function writeRedisJson(
  key: string,
  value: unknown,
  ttlSeconds: number,
): Promise<boolean> {
  completeCacheSourceLoad(key)
  try {
    const client = await connectedRedis()
    if (!client) return false
    await client.set(key, JSON.stringify(value), 'EX', Math.max(1, ttlSeconds))
    return true
  } catch (error) {
    reportRedisFallback(error)
    return false
  }
}

export async function deleteRedisKey(key: string): Promise<boolean> {
  try {
    const client = await connectedRedis()
    if (!client) return false
    await client.del(key)
    return true
  } catch (error) {
    reportRedisFallback(error)
    return false
  }
}

export async function deleteRedisKeysByPrefix(prefix: string): Promise<number> {
  try {
    const client = await connectedRedis()
    if (!client) return 0

    let cursor = '0'
    let deleted = 0
    do {
      const [nextCursor, keys] = await client.scan(
        cursor,
        'MATCH',
        `${prefix}*`,
        'COUNT',
        100,
      )
      cursor = nextCursor
      if (keys.length > 0) deleted += await client.del(...keys)
    } while (cursor !== '0')

    return deleted
  } catch (error) {
    reportRedisFallback(error)
    return 0
  }
}

export async function getRedisMonitoring() {
  const client = await connectedRedis()
  if (!client) return { configured: isRedisConfigured(), connected: false, latencyMs: null, keyCount: 0, keys: [], performance: getCachePerformanceSnapshot() }

  try {
    const started = Date.now()
    await client.ping()
    let cursor = '0'
    let keyCount = 0
    const keys: Array<{ key: string; page: string; type: string; ttlSeconds: number; bytes: number | null }> = []
    do {
      const [nextCursor, scannedKeys] = await client.scan(cursor, 'MATCH', 'fastlane:*', 'COUNT', 100)
      cursor = nextCursor
      keyCount += scannedKeys.length
      for (const key of scannedKeys) {
        const [type, ttlSeconds, memory] = await Promise.all([
          client.type(key),
          client.ttl(key),
          client.call('MEMORY', 'USAGE', key).catch(() => null),
        ])
        const page = key.includes('car-catalog') ? 'Ô tô điện · Danh sách' :
          key.includes('car-detail') ? 'Ô tô điện · Chi tiết' :
          key.includes('motorbike-catalog') ? 'Xe máy điện · Danh sách' :
          key.includes('motorbike-detail') ? 'Xe máy điện · Chi tiết' :
          key.includes('product-search') ? 'Tìm kiếm sản phẩm' :
          key.includes('accessory-catalog') ? 'Phụ kiện · Danh sách' :
          key.includes('deposit-draft') ? 'Đặt cọc · Bản nháp mã hóa' :
          key.includes('customer-cart') ? 'Giỏ hàng khách hàng' : 'Khác'
        keys.push({ key, page, type, ttlSeconds, bytes: typeof memory === 'number' ? memory : null })
      }
    } while (cursor !== '0')
    return { configured: true, connected: true, latencyMs: Date.now() - started, keyCount, keys: keys.sort((a, b) => a.page.localeCompare(b.page)), performance: getCachePerformanceSnapshot() }
  } catch (error) {
    reportRedisFallback(error)
    return { configured: true, connected: false, latencyMs: null, keyCount: 0, keys: [], performance: getCachePerformanceSnapshot() }
  }
}
