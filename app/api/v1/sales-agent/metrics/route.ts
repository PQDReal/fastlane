import { NextResponse } from 'next/server'

import {
  parseSalesAgentInteractionMetric,
  recordSalesAgentInteractionMetric,
  salesAgentInteractionMetricsEnabled,
} from '@/lib/sales-agent/telemetry'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  if (!salesAgentInteractionMetricsEnabled()) return new NextResponse(null, { status: 204 })
  try {
    const body = await request.text()
    if (body.length > 4_096) throw new Error('Metric payload quá lớn.')
    const metric = parseSalesAgentInteractionMetric(JSON.parse(body))
    recordSalesAgentInteractionMetric(metric)
    return new NextResponse(null, { status: 204 })
  } catch (error) {
    return NextResponse.json({ error: { code: 'INVALID_SALES_AGENT_METRIC', message: error instanceof Error ? error.message : 'Metric không hợp lệ.' } }, { status: 400 })
  }
}
