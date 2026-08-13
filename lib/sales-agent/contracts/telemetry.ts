export const SALES_AGENT_INTERACTION_METRIC_EVENTS = [
  'interaction_viewed',
  'interaction_expanded',
  'interaction_collapsed',
  'interaction_search',
  'interaction_free_text',
  'interaction_submitted',
  'interaction_abandoned',
] as const

export type SalesAgentInteractionMetricEvent = (typeof SALES_AGENT_INTERACTION_METRIC_EVENTS)[number]
export type SalesAgentInteractionMetricSlot = 'vehicles' | 'vehicle' | 'criteria' | 'budget' | 'usage'

export type SalesAgentInteractionMetric = {
  event: SalesAgentInteractionMetricEvent
  slot?: SalesAgentInteractionMetricSlot
  mode?: 'single' | 'multiple'
  resultCount?: number
}

export type SalesAgentInteractionMetricSummary = {
  viewed: number
  expanded: number
  search: number
  freeText: number
  submitted: number
  abandoned: number
  completionRate: number
  expandRate: number
  searchUseRate: number
  freeTextRate: number
  abandonmentRate: number
}

const SLOTS: SalesAgentInteractionMetricSlot[] = ['vehicles', 'vehicle', 'criteria', 'budget', 'usage']

function boundedCount(value: unknown) {
  if (value === undefined) return undefined
  if (!Number.isInteger(value) || Number(value) < 0 || Number(value) > 8) throw new Error('resultCount không hợp lệ.')
  return Number(value)
}

/** Parses only aggregate interaction dimensions; prompt, labels, IDs and tokens are rejected. */
export function parseSalesAgentInteractionMetric(value: unknown): SalesAgentInteractionMetric {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Metric phải là JSON object.')
  const input = value as Record<string, unknown>
  const unexpected = Object.keys(input).find((key) => !['event', 'slot', 'mode', 'resultCount'].includes(key))
  if (unexpected) throw new Error(`Metric field ${unexpected} không được hỗ trợ.`)
  if (typeof input.event !== 'string' || !SALES_AGENT_INTERACTION_METRIC_EVENTS.includes(input.event as SalesAgentInteractionMetricEvent)) {
    throw new Error('event metric không hợp lệ.')
  }
  if (input.slot !== undefined && (typeof input.slot !== 'string' || !SLOTS.includes(input.slot as SalesAgentInteractionMetricSlot))) {
    throw new Error('slot metric không hợp lệ.')
  }
  if (input.mode !== undefined && input.mode !== 'single' && input.mode !== 'multiple') throw new Error('mode metric không hợp lệ.')
  return {
    event: input.event as SalesAgentInteractionMetricEvent,
    ...(input.slot ? { slot: input.slot as SalesAgentInteractionMetricSlot } : {}),
    ...(input.mode ? { mode: input.mode } : {}),
    ...(input.resultCount !== undefined ? { resultCount: boundedCount(input.resultCount) } : {}),
  }
}

function rate(numerator: number, denominator: number) {
  if (!denominator) return 0
  return Number((numerator / denominator).toFixed(4))
}

/**
 * Produces the rollout dimensions from aggregate events. Callers should feed
 * only validated metrics; no prompt, label, product ID, PII or token is ever
 * needed to compute these rates.
 */
export function summarizeSalesAgentInteractionMetrics(metrics: SalesAgentInteractionMetric[]): SalesAgentInteractionMetricSummary {
  const counts = {
    viewed: metrics.filter((metric) => metric.event === 'interaction_viewed').length,
    expanded: metrics.filter((metric) => metric.event === 'interaction_expanded').length,
    search: metrics.filter((metric) => metric.event === 'interaction_search').length,
    freeText: metrics.filter((metric) => metric.event === 'interaction_free_text').length,
    submitted: metrics.filter((metric) => metric.event === 'interaction_submitted').length,
    abandoned: metrics.filter((metric) => metric.event === 'interaction_abandoned').length,
  }
  return {
    ...counts,
    completionRate: rate(counts.submitted, counts.viewed),
    expandRate: rate(counts.expanded, counts.viewed),
    searchUseRate: rate(counts.search, counts.viewed),
    freeTextRate: rate(counts.freeText, counts.viewed),
    abandonmentRate: rate(counts.abandoned, counts.viewed),
  }
}
