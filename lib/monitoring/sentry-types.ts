export type MonitoringPeriod = '1h' | '24h' | '7d' | '14d'

export type LatencySummary = {
  requestCount: number
  p50Ms: number | null
  p95Ms: number | null
  p99Ms: number | null
  failureRate: number | null
}

export type SlowTransaction = LatencySummary & {
  name: string
  operation: string
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
  backend: LatencySummary
  slowFrontend: SlowTransaction[]
  slowBackend: SlowTransaction[]
  issues: { unresolved: number; recent: MonitoringIssue[] }
}
