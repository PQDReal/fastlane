import 'server-only'

import {
  parseSalesAgentInteractionMetric,
  type SalesAgentInteractionMetric,
} from './contracts/telemetry'

export function salesAgentInteractionMetricsEnabled() {
  return process.env.SALES_AGENT_INTERACTION_METRICS_ENABLED === 'true'
}

export function recordSalesAgentInteractionMetric(metric: SalesAgentInteractionMetric) {
  if (!salesAgentInteractionMetricsEnabled()) return false
  // Keep the log payload aggregate-only so it can be shipped to any metrics
  // backend without exposing prompt text, free labels, PII or continuation data.
  console.info('[sales-agent-interaction-metric]', JSON.stringify(metric))
  return true
}

export { parseSalesAgentInteractionMetric }
