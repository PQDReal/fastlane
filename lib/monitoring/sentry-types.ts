export type MonitoringPeriod = '1h' | '24h' | '7d' | '14d'

export type LatencySummary = {
  requestCount: number
  avgMs: number | null
  p50Ms: number | null
  p95Ms: number | null
  p99Ms: number | null
  failureRate: number | null
}

export type SlowTransaction = LatencySummary & {
  name: string
  operation: string
  method: string
  statusCode: number | null
}

export type MonitoringTrendPoint = {
  timestamp: number
  p50Ms: number | null
  p95Ms: number | null
  p99Ms: number | null
}

export type MonitoringTrend = {
  points: MonitoringTrendPoint[]
  previousPoints: MonitoringTrendPoint[]
  intervalSeconds: number | null
}

export type MonitoringIssue = {
  id: string
  shortId: string
  title: string
  culprit: string
  count: number
  userCount: number
  level: string
  lastSeen: string
  permalink: string
}

export type SentryMonitoringData = {
  configured: boolean
  available: boolean
  period: MonitoringPeriod
  environment: string
  fetchedAt: string
  cacheTtlSeconds: number
  dashboardUrl: string | null
  error?: string
  warnings: string[]
  frontend: LatencySummary
  frontendPrevious: LatencySummary | null
  frontendTrend: MonitoringTrend
  backend: LatencySummary
  backendPrevious: LatencySummary | null
  backendTrend: MonitoringTrend
  slowFrontend: SlowTransaction[]
  slowBackend: SlowTransaction[]
  issues: { unresolved: number; recent: MonitoringIssue[] }
}
