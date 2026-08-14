import 'server-only'

import type { SalesAgentInteractionMetric } from './contracts/interaction'

export function parseSalesAgentInteractionMetric(value: unknown): SalesAgentInteractionMetric {
  if (!value || typeof value !== 'object') throw new Error('Metric phải là JSON object.')
  const input = value as any
  return {
    interactionId: String(input.interactionId || ''),
    slot: String(input.slot || ''),
    action: input.action || 'RENDERED',
    selectedCount: typeof input.selectedCount === 'number' ? input.selectedCount : undefined,
    timestamp: input.timestamp || new Date().toISOString(),
  }
}

export function salesAgentInteractionMetricsEnabled() {
  return process.env.SALES_AGENT_INTERACTION_METRICS_ENABLED === 'true'
}

export function recordSalesAgentInteractionMetric(metric: SalesAgentInteractionMetric) {
  if (!salesAgentInteractionMetricsEnabled()) return false
  console.info('[sales-agent-interaction-metric]', JSON.stringify(metric))
  return true
}
