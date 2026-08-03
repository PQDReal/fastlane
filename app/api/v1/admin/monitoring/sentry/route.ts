import { NextResponse } from 'next/server'

import { authorizeAdminCatalogRequest } from '@/lib/auth/admin'
import { ApiAuthError, authErrorResponse } from '@/lib/auth/errors'
import type { MonitoringPeriod } from '@/lib/monitoring/sentry-types'
import { getSentryMonitoringData } from '@/lib/services/sentry-monitoring-service'

const PERIODS = new Set<MonitoringPeriod>(['1h', '24h', '7d', '14d'])

export async function GET(request: Request) {
  try {
    await authorizeAdminCatalogRequest(request)
    const value = new URL(request.url).searchParams.get('period') || '24h'
    if (!PERIODS.has(value as MonitoringPeriod)) {
      return NextResponse.json({ error: 'Khoảng thời gian không hợp lệ.' }, { status: 400 })
    }
    const data = await getSentryMonitoringData(value as MonitoringPeriod)
    return NextResponse.json({ data }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    if (error instanceof ApiAuthError) return authErrorResponse(error)
    return NextResponse.json({ error: 'Không thể tải dữ liệu giám sát.' }, { status: 500 })
  }
}
