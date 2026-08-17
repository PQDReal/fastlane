import type { RateLimitResult } from './types'

type RateLimitBucket = {
  timestamps: number[]
}

const clientBuckets = new Map<string, RateLimitBucket>()

const WINDOW_MS = 60 * 1000 // 1 minute window
const MAX_REQUESTS = 15 // 15 requests per minute

export function checkRateLimit(clientKey: string): RateLimitResult {
  const now = Date.now()
  const cutoff = now - WINDOW_MS

  let bucket = clientBuckets.get(clientKey)
  if (!bucket) {
    bucket = { timestamps: [] }
    clientBuckets.set(clientKey, bucket)
  }

  // Prune timestamps older than window
  bucket.timestamps = bucket.timestamps.filter((t) => t > cutoff)

  if (bucket.timestamps.length >= MAX_REQUESTS) {
    const oldest = bucket.timestamps[0]
    const resetInSeconds = Math.max(1, Math.ceil((oldest + WINDOW_MS - now) / 1000))
    return {
      allowed: false,
      remaining: 0,
      resetInSeconds,
    }
  }

  bucket.timestamps.push(now)
  return {
    allowed: true,
    remaining: MAX_REQUESTS - bucket.timestamps.length,
    resetInSeconds: Math.ceil(WINDOW_MS / 1000),
  }
}

export function resetRateLimiterForTest(): void {
  clientBuckets.clear()
}
