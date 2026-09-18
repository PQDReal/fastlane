import { NextResponse } from 'next/server'

import {
  parseSalesAgentInteractionMetric,
  recordSalesAgentInteractionMetric,
  salesAgentInteractionMetricsEnabled,
} from '@/lib/sales-agent/telemetry'
import { recordSalesAgentDebugEvent } from '@/lib/sales-agent/debug-log'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const requestId = crypto.randomUUID()
  const startedAt = Date.now()
  if (!salesAgentInteractionMetricsEnabled()) {
    recordSalesAgentDebugEvent('interaction.metric.ignored', { requestId }, {
      reasonCode: 'METRICS_DISABLED',
      elapsedMs: Date.now() - startedAt,
    })
    return new NextResponse(null, { status: 204, headers: { 'X-Sales-Agent-Request-Id': requestId } })
  }
  try {
    const body = await request.text()
    if (body.length > 4_096) throw new Error('Metric payload quá lớn.')
    const metric = parseSalesAgentInteractionMetric(JSON.parse(body))
    recordSalesAgentInteractionMetric(metric)
    recordSalesAgentDebugEvent('interaction.metric.recorded', { requestId }, {
      interactionId: metric.interactionId,
      slot: metric.slot,
      action: metric.action,
      selectedCount: metric.selectedCount,
      elapsedMs: Date.now() - startedAt,
    })
    return new NextResponse(null, { status: 204, headers: { 'X-Sales-Agent-Request-Id': requestId } })
  } catch (error) {
    recordSalesAgentDebugEvent('interaction.metric.rejected', { requestId }, {
      phase: 'metric_validation',
      reasonCode: 'INVALID_METRIC',
      elapsedMs: Date.now() - startedAt,
      error: error instanceof Error ? { name: error.name, message: error.message } : String(error),
    })
    return NextResponse.json({ error: { code: 'INVALID_SALES_AGENT_METRIC', message: error instanceof Error ? error.message : 'Metric không hợp lệ.' } }, { status: 400 })
  }
}
