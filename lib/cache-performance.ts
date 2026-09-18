export type CacheReadStatus = 'HIT' | 'MISS' | 'BYPASS'

type MutableMetric = {
  keyGroup: string
  hits: number
  misses: number
  bypasses: number
  hitReadMs: number
  sourceLoadMs: number
  sourceSamples: number
}

export type CachePerformanceRow = {
  keyGroup: string
  hits: number
  misses: number
  bypasses: number
  requests: number
  hitRate: number | null
  avgCacheReadMs: number | null
  avgSourceLoadMs: number | null
  improvementPercent: number | null
}

type CachePerformanceGlobal = typeof globalThis & {
  fastlaneCacheMetrics?: Map<string, MutableMetric>
  fastlaneCachePendingLoads?: Map<string, Array<{ group: string; startedAt: number }>>
  fastlaneCacheMetricsStartedAt?: string
}

const state = globalThis as CachePerformanceGlobal

function metrics() {
  state.fastlaneCacheMetrics ??= new Map()
  state.fastlaneCacheMetricsStartedAt ??= new Date().toISOString()
  return state.fastlaneCacheMetrics
}

function pendingLoads() {
  state.fastlaneCachePendingLoads ??= new Map()
  return state.fastlaneCachePendingLoads
}

export function cacheKeyGroup(key: string) {
  if (key.includes('car-catalog')) return 'Ô tô điện · Danh sách'
  if (key.includes('car-detail')) return 'Ô tô điện · Chi tiết'
  if (key.includes('motorbike-catalog')) return 'Xe máy điện · Danh sách'
  if (key.includes('motorbike-detail')) return 'Xe máy điện · Chi tiết'
  if (key.includes('product-search')) return 'Tìm kiếm sản phẩm'
  if (key.includes('accessory-catalog')) return 'Phụ kiện · Danh sách'
  if (key.includes('accessory-product')) return 'Phụ kiện · Chi tiết'
  if (key.includes('assistant-search')) return 'Trợ lý tìm kiếm'
  if (key.includes('customer-cart')) return 'Giỏ hàng khách hàng'
  return 'Khác'
}

function metricFor(group: string) {
  const all = metrics()
  const current = all.get(group)
  if (current) return current
  const created: MutableMetric = {
    keyGroup: group,
    hits: 0,
    misses: 0,
    bypasses: 0,
    hitReadMs: 0,
    sourceLoadMs: 0,
    sourceSamples: 0,
  }
  all.set(group, created)
  return created
}

export function recordCacheRead(key: string, status: CacheReadStatus, durationMs: number) {
  const group = cacheKeyGroup(key)
  const metric = metricFor(group)
  if (status === 'HIT') {
    metric.hits += 1
    metric.hitReadMs += durationMs
    return
  }

  if (status === 'MISS') metric.misses += 1
  else metric.bypasses += 1

  const pending = pendingLoads()
  pending.set(key, [...(pending.get(key) ?? []), { group, startedAt: performance.now() }])
}

export function completeCacheSourceLoad(key: string) {
  const pending = pendingLoads()
  const entries = pending.get(key)
  const entry = entries?.shift()
  if (!entry) return
  if (entries?.length) pending.set(key, entries)
  else pending.delete(key)

  const metric = metricFor(entry.group)
  metric.sourceLoadMs += Math.max(0, performance.now() - entry.startedAt)
  metric.sourceSamples += 1
}

function row(metric: MutableMetric): CachePerformanceRow {
  const cacheAttempts = metric.hits + metric.misses
  const avgCacheReadMs = metric.hits ? metric.hitReadMs / metric.hits : null
  const avgSourceLoadMs = metric.sourceSamples ? metric.sourceLoadMs / metric.sourceSamples : null
  return {
    keyGroup: metric.keyGroup,
    hits: metric.hits,
    misses: metric.misses,
    bypasses: metric.bypasses,
    requests: metric.hits + metric.misses + metric.bypasses,
    hitRate: cacheAttempts ? metric.hits / cacheAttempts : null,
    avgCacheReadMs,
    avgSourceLoadMs,
    improvementPercent: avgCacheReadMs !== null && avgSourceLoadMs !== null && avgSourceLoadMs > 0
      ? ((avgSourceLoadMs - avgCacheReadMs) / avgSourceLoadMs) * 100
      : null,
  }
}

export function getCachePerformanceSnapshot() {
  const raw = [...metrics().values()]
  const rows = raw.map(row).sort((left, right) => right.requests - left.requests)
  const total = raw.reduce<MutableMetric>((result, metric) => ({
    ...result,
    hits: result.hits + metric.hits,
    misses: result.misses + metric.misses,
    bypasses: result.bypasses + metric.bypasses,
    hitReadMs: result.hitReadMs + metric.hitReadMs,
    sourceLoadMs: result.sourceLoadMs + metric.sourceLoadMs,
    sourceSamples: result.sourceSamples + metric.sourceSamples,
  }), {
    keyGroup: 'Tổng cộng', hits: 0, misses: 0, bypasses: 0,
    hitReadMs: 0, sourceLoadMs: 0, sourceSamples: 0,
  })

  return {
    startedAt: state.fastlaneCacheMetricsStartedAt ?? new Date().toISOString(),
    total: row(total),
    rows,
  }
}

export function resetCachePerformanceForTests() {
  state.fastlaneCacheMetrics = new Map()
  state.fastlaneCachePendingLoads = new Map()
  state.fastlaneCacheMetricsStartedAt = new Date().toISOString()
}
