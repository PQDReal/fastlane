import 'server-only'

import type { LatencySummary, MonitoringIssue, MonitoringPeriod, SentryMonitoringData, SlowTransaction } from '@/lib/monitoring/sentry-types'

const CACHE_TTL_SECONDS = 120
const EMPTY_SUMMARY: LatencySummary = { requestCount: 0, avgMs: null, p50Ms: null, p95Ms: null, p99Ms: null, failureRate: null }
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
    backend: { ...EMPTY_SUMMARY },
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

    const explore = (query: string, grouped = false, perPage = 8) => {
      const url = new URL(`${apiBase}/organizations/${encodeURIComponent(org)}/events/`)
      url.searchParams.set('dataset', 'spans')
      url.searchParams.set('project', projectId)
      if (selectedEnvironment) url.searchParams.set('environment', selectedEnvironment)
      url.searchParams.set('statsPeriod', period)
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

    const issuesUrl = new URL(`${apiBase}/organizations/${encodeURIComponent(org)}/issues/`)
    issuesUrl.searchParams.set('project', projectId)
    if (selectedEnvironment) issuesUrl.searchParams.set('environment', selectedEnvironment)
    issuesUrl.searchParams.set('statsPeriod', period)
    issuesUrl.searchParams.set('query', 'is:unresolved')
    issuesUrl.searchParams.set('limit', '100')

    const requests = await Promise.allSettled([
      explore('is_transaction:true span.op:[pageload,navigation]'),
      explore('is_transaction:true span.op:http.server !http.request.method:HEAD'),
      explore('is_transaction:true span.op:[pageload,navigation]', true),
      explore('is_transaction:true span.op:http.server !http.request.method:HEAD', true),
      sentryFetch<JsonRecord[]>(issuesUrl, token),
    ])

    const labels = ['độ trễ frontend', 'độ trễ backend', 'trang frontend chậm', 'API chậm', 'issues']
    requests.forEach((request, index) => {
      if (request.status === 'rejected') result.warnings.push(`Không tải được ${labels[index]}: ${safeMessage(request.reason)}`)
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

    result.available = requests.some((request) => request.status === 'fulfilled')
    result.fetchedAt = new Date().toISOString()
    cache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_SECONDS * 1000, value: result })
    return result
  } catch (error) {
    return { ...result, error: safeMessage(error) }
  }
}
