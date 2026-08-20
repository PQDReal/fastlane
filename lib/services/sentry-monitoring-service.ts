import 'server-only'

import type { LatencySummary, MonitoringIssue, MonitoringPeriod, MonitoringTrend, MonitoringTrendPoint, SentryMonitoringData, SlowTransaction } from '@/lib/monitoring/sentry-types'

const CACHE_TTL_SECONDS = 60
const EMPTY_SUMMARY: LatencySummary = { requestCount: 0, avgMs: null, p50Ms: null, p95Ms: null, p99Ms: null, failureRate: null }
const PERIOD_SECONDS: Record<MonitoringPeriod, number> = { '1h': 60 * 60, '24h': 24 * 60 * 60, '7d': 7 * 24 * 60 * 60, '14d': 14 * 24 * 60 * 60 }
const TREND_INTERVAL_SECONDS: Record<MonitoringPeriod, number> = { '1h': 5 * 60, '24h': 60 * 60, '7d': 6 * 60 * 60, '14d': 12 * 60 * 60 }
const cache = new Map<string, { expiresAt: number; value: SentryMonitoringData }>()

type JsonRecord = Record<string, unknown>

function numberValue(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN
  return Number.isFinite(parsed) ? parsed : null
}

function metric(row: JsonRecord | undefined, ...keys: string[]) {
  if (!row) return null
  for (const key of keys) {
    const value = numberValue(row[key])
    if (value !== null) return value
  }
  return null
}

function parseSummary(payload: unknown): LatencySummary {
  const row = ((payload as { data?: JsonRecord[] })?.data ?? [])[0]
  return {
    requestCount: metric(row, 'count()', 'count') ?? 0,
    avgMs: metric(row, 'avg(span.duration)', 'avg()'),
    p50Ms: metric(row, 'p50(span.duration)', 'p50()'),
    p95Ms: metric(row, 'p95(span.duration)', 'p95()'),
    p99Ms: metric(row, 'p99(span.duration)', 'p99()'),
    failureRate: metric(row, 'failure_rate()', 'failure_rate'),
  }
}

function emptyTrend(): MonitoringTrend {
  return { points: [], previousPoints: [], intervalSeconds: null }
}

type TimeSeriesValue = { timestamp?: unknown; value?: unknown }
type TimeSeriesRow = { values?: TimeSeriesValue[]; meta?: { interval?: unknown } }

function parseTrendSeries(payload: unknown) {
  const rows = ((payload as { timeSeries?: TimeSeriesRow[] })?.timeSeries ?? [])
  const parseValues = (row: TimeSeriesRow | undefined): Array<{ timestamp: number; value: number | null }> =>
    (row?.values ?? []).flatMap((point) => {
      const timestamp = numberValue(point.timestamp)
      if (timestamp === null) return []
      return [{ timestamp, value: numberValue(point.value) }]
    })

  return {
    current: parseValues(rows[0]),
    previous: parseValues(rows[1]),
    intervalSeconds: numberValue(rows[0]?.meta?.interval),
  }
}

function combineTrendSeries(
  payloads: Array<{ metric: 'p50Ms' | 'p95Ms' | 'p99Ms'; payload: unknown }>,
): MonitoringTrend {
  const current = new Map<number, MonitoringTrendPoint>()
  const previous = new Map<number, MonitoringTrendPoint>()
  let intervalSeconds: number | null = null

  payloads.forEach(({ metric: metricName, payload }) => {
    const series = parseTrendSeries(payload)
    intervalSeconds ??= series.intervalSeconds
    series.current.forEach(({ timestamp, value }) => {
      const point = current.get(timestamp) ?? { timestamp, p50Ms: null, p95Ms: null, p99Ms: null }
      point[metricName] = value
      current.set(timestamp, point)
    })
    series.previous.forEach(({ timestamp, value }) => {
      const point = previous.get(timestamp) ?? { timestamp, p50Ms: null, p95Ms: null, p99Ms: null }
      point[metricName] = value
      previous.set(timestamp, point)
    })
  })

  return {
    points: [...current.values()].sort((a, b) => a.timestamp - b.timestamp),
    previousPoints: [...previous.values()].sort((a, b) => a.timestamp - b.timestamp),
    intervalSeconds,
  }
}

function parseTransactions(payload: unknown): SlowTransaction[] {
  return (((payload as { data?: JsonRecord[] })?.data ?? []).map((row) => ({
    name: String(row.transaction ?? row['transaction.name'] ?? 'Không xác định'),
    operation: String(row['span.op'] ?? ''),
    method: String(row['http.request.method'] ?? '').toUpperCase(),
    statusCode: metric(row, 'http.response.status_code'),
    requestCount: metric(row, 'count()', 'count') ?? 0,
    avgMs: metric(row, 'avg(span.duration)', 'avg()'),
    p50Ms: metric(row, 'p50(span.duration)', 'p50()'),
    p95Ms: metric(row, 'p95(span.duration)', 'p95()'),
    p99Ms: metric(row, 'p99(span.duration)', 'p99()'),
    failureRate: metric(row, 'failure_rate()', 'failure_rate'),
  })))
}

function safeMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Không thể kết nối Sentry.'
}

async function sentryFetch<T>(url: URL, token: string): Promise<T> {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    cache: 'no-store',
    signal: AbortSignal.timeout(10_000),
  })
  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Sentry API ${response.status}: ${body.slice(0, 180)}`)
  }
  return response.json() as Promise<T>
}

function baseData(period: MonitoringPeriod, environment: string): SentryMonitoringData {
  return {
    configured: false,
    available: false,
    period,
    environment,
    fetchedAt: new Date().toISOString(),
    cacheTtlSeconds: CACHE_TTL_SECONDS,
    dashboardUrl: null,
    warnings: [],
    frontend: { ...EMPTY_SUMMARY },
    frontendPrevious: null,
    frontendTrend: emptyTrend(),
    backend: { ...EMPTY_SUMMARY },
    backendPrevious: null,
    backendTrend: emptyTrend(),
    slowFrontend: [],
    slowBackend: [],
    issues: { unresolved: 0, recent: [] },
  }
}

export async function getSentryMonitoringData(period: MonitoringPeriod): Promise<SentryMonitoringData> {
  const token = process.env.SENTRY_MONITORING_TOKEN
  const org = process.env.SENTRY_ORG
  const project = process.env.SENTRY_PROJECT
  const environment = process.env.SENTRY_MONITORING_ENVIRONMENT || process.env.SENTRY_ENVIRONMENT || 'production'
  const result = baseData(period, environment)

  if (!token || !org || !project) {
    return { ...result, error: 'Thiếu SENTRY_MONITORING_TOKEN, SENTRY_ORG hoặc SENTRY_PROJECT.' }
  }

  const cacheKey = `${org}:${project}:${environment}:${period}`
  const cached = cache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) return cached.value

  result.configured = true
  const apiBase = (process.env.SENTRY_API_URL || 'https://sentry.io/api/0').replace(/\/$/, '')

  try {
    const projectUrl = new URL(`${apiBase}/projects/${encodeURIComponent(org)}/${encodeURIComponent(project)}/`)
    const projectInfo = await sentryFetch<{ id: string }>(projectUrl, token)
    const projectId = projectInfo.id
    result.dashboardUrl = `https://${org}.sentry.io/explore/traces/?project=${encodeURIComponent(projectId)}&statsPeriod=${period}`
    let selectedEnvironment: string | null = null
    try {
      const environmentsUrl = new URL(`${apiBase}/projects/${encodeURIComponent(org)}/${encodeURIComponent(project)}/environments/`)
      const environments = await sentryFetch<Array<{ name: string }>>(environmentsUrl, token)
      if (environments.some((item) => item.name === environment)) {
        selectedEnvironment = environment
      } else {
        result.available = true
        result.warnings.push(`Environment ${environment} chưa có dữ liệu. Dữ liệu mới sẽ xuất hiện sau event đầu tiên.`)
        result.fetchedAt = new Date().toISOString()
        cache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_SECONDS * 1000, value: result })
        return result
      }
    } catch (error) {
      return { ...result, error: `Không thể kiểm tra environment Sentry: ${safeMessage(error)}` }
    }

    const explore = (
      query: string,
      grouped = false,
      perPage = 8,
      timeRange?: { start: string; end: string },
    ) => {
      const url = new URL(`${apiBase}/organizations/${encodeURIComponent(org)}/events/`)
      url.searchParams.set('dataset', 'spans')
      url.searchParams.set('project', projectId)
      if (selectedEnvironment) url.searchParams.set('environment', selectedEnvironment)
      if (timeRange) {
        url.searchParams.set('start', timeRange.start)
        url.searchParams.set('end', timeRange.end)
      } else {
        url.searchParams.set('statsPeriod', period)
      }
      url.searchParams.set('query', query)
      const fields = grouped
        ? ['transaction', 'span.op', 'http.request.method', 'http.response.status_code', 'count()', 'avg(span.duration)', 'p50(span.duration)', 'p95(span.duration)', 'p99(span.duration)', 'failure_rate()']
        : ['count()', 'avg(span.duration)', 'p50(span.duration)', 'p95(span.duration)', 'p99(span.duration)', 'failure_rate()']
      fields.forEach((field) => url.searchParams.append('field', field))
      if (grouped) {
        url.searchParams.set('sort', '-p95(span.duration)')
        url.searchParams.set('per_page', String(perPage))
      }
      return sentryFetch<unknown>(url, token)
    }

    const timeseries = (query: string, yAxis: string) => {
      const url = new URL(`${apiBase}/organizations/${encodeURIComponent(org)}/events-timeseries/`)
      url.searchParams.set('dataset', 'spans')
      url.searchParams.set('project', projectId)
      if (selectedEnvironment) url.searchParams.set('environment', selectedEnvironment)
      url.searchParams.set('statsPeriod', period)
      url.searchParams.set('interval', String(TREND_INTERVAL_SECONDS[period]))
      url.searchParams.set('comparisonDelta', String(PERIOD_SECONDS[period]))
      url.searchParams.set('yAxis', yAxis)
      url.searchParams.set('query', query)
      return sentryFetch<unknown>(url, token)
    }

    const periodMilliseconds = PERIOD_SECONDS[period] * 1000
    const currentPeriodStart = new Date(Date.now() - periodMilliseconds).toISOString()
    const previousRange = {
      start: new Date(Date.now() - periodMilliseconds * 2).toISOString(),
      end: currentPeriodStart,
    }
    const frontendQuery = 'is_transaction:true span.op:[pageload,navigation]'
    const backendQuery = 'is_transaction:true span.op:http.server !http.request.method:HEAD'

    const issuesUrl = new URL(`${apiBase}/organizations/${encodeURIComponent(org)}/issues/`)
    issuesUrl.searchParams.set('project', projectId)
    if (selectedEnvironment) issuesUrl.searchParams.set('environment', selectedEnvironment)
    issuesUrl.searchParams.set('statsPeriod', period)
    issuesUrl.searchParams.set('query', 'is:unresolved')
    issuesUrl.searchParams.set('limit', '100')

    const requestsPromise = Promise.allSettled([
      explore(frontendQuery),
      explore(backendQuery),
      explore(frontendQuery, true),
      explore(backendQuery, true),
      sentryFetch<JsonRecord[]>(issuesUrl, token),
      explore(frontendQuery, false, 8, previousRange),
      explore(backendQuery, false, 8, previousRange),
    ])

    const trendRequestsPromise = Promise.allSettled([
      timeseries(frontendQuery, 'p50(span.duration)'),
      timeseries(frontendQuery, 'p95(span.duration)'),
      timeseries(frontendQuery, 'p99(span.duration)'),
      timeseries(backendQuery, 'p50(span.duration)'),
      timeseries(backendQuery, 'p95(span.duration)'),
      timeseries(backendQuery, 'p99(span.duration)'),
    ])
    const [requests, trendRequests] = await Promise.all([requestsPromise, trendRequestsPromise])

    const labels = ['độ trễ frontend', 'độ trễ backend', 'trang frontend chậm', 'API chậm', 'issues']
    requests.forEach((request, index) => {
      if (request.status === 'rejected') result.warnings.push(`Không tải được ${labels[index] ?? 'dữ liệu kỳ trước'}: ${safeMessage(request.reason)}`)
    })

    trendRequests.forEach((request, index) => {
      if (request.status === 'rejected') result.warnings.push(`Không tải được xu hướng ${index < 3 ? 'frontend' : 'backend'}: ${safeMessage(request.reason)}`)
    })

    if (requests[0].status === 'fulfilled') result.frontend = parseSummary(requests[0].value)
    if (requests[1].status === 'fulfilled') result.backend = parseSummary(requests[1].value)
    if (requests[2].status === 'fulfilled') result.slowFrontend = parseTransactions(requests[2].value)
    if (requests[3].status === 'fulfilled') result.slowBackend = parseTransactions(requests[3].value)
    if (requests[4].status === 'fulfilled') {
      const issues = requests[4].value
      result.issues = {
        unresolved: issues.length,
        recent: issues.slice(0, 5).map((issue): MonitoringIssue => ({
          id: String(issue.id ?? ''), shortId: String(issue.shortId ?? ''), title: String(issue.title ?? ''),
          culprit: String(issue.culprit ?? ''), count: numberValue(issue.count) ?? 0,
          userCount: numberValue(issue.userCount) ?? 0, level: String(issue.level ?? 'error'),
          lastSeen: String(issue.lastSeen ?? ''), permalink: String(issue.permalink ?? ''),
        })),
      }
    }

    if (requests[5].status === 'fulfilled') result.frontendPrevious = parseSummary(requests[5].value)
    if (requests[6].status === 'fulfilled') result.backendPrevious = parseSummary(requests[6].value)

    const trendMetrics = ['p50Ms', 'p95Ms', 'p99Ms'] as const
    result.frontendTrend = combineTrendSeries(
      trendRequests.slice(0, 3).flatMap((request, index) =>
        request.status === 'fulfilled'
          ? [{ metric: trendMetrics[index], payload: request.value }]
          : [],
      ),
    )
    result.backendTrend = combineTrendSeries(
      trendRequests.slice(3).flatMap((request, index) =>
        request.status === 'fulfilled'
          ? [{ metric: trendMetrics[index], payload: request.value }]
          : [],
      ),
    )

    result.available = requests.some((request) => request.status === 'fulfilled')
    result.fetchedAt = new Date().toISOString()
    cache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_SECONDS * 1000, value: result })
    return result
  } catch (error) {
    return { ...result, error: safeMessage(error) }
  }
}
