import { describe, expect, it } from 'vitest'

import { parseSalesAgentInteractionMetric, summarizeSalesAgentInteractionMetrics } from './telemetry'

describe('sales agent interaction metric contract', () => {
  it('accepts bounded aggregate dimensions only', () => {
    expect(parseSalesAgentInteractionMetric({ event: 'interaction_search', slot: 'vehicles', mode: 'multiple', resultCount: 4 })).toEqual({
      event: 'interaction_search', slot: 'vehicles', mode: 'multiple', resultCount: 4,
    })
  })

  it('rejects prompt, label, PII and token fields', () => {
    expect(() => parseSalesAgentInteractionMetric({ event: 'interaction_viewed', prompt: 'VF 8' })).toThrow('prompt')
    expect(() => parseSalesAgentInteractionMetric({ event: 'interaction_viewed', label: 'VF 8' })).toThrow('label')
    expect(() => parseSalesAgentInteractionMetric({ event: 'interaction_viewed', continuationToken: 'secret' })).toThrow('continuationToken')
    expect(() => parseSalesAgentInteractionMetric({ event: 'interaction_viewed', resultCount: 9 })).toThrow('resultCount')
  })

  it('summarizes rollout rates from aggregate events without content dimensions', () => {
    const summary = summarizeSalesAgentInteractionMetrics([
      { event: 'interaction_viewed', slot: 'vehicles', mode: 'multiple' },
      { event: 'interaction_expanded', slot: 'vehicles', mode: 'multiple', resultCount: 8 },
      { event: 'interaction_search', slot: 'vehicles', mode: 'multiple' },
      { event: 'interaction_submitted', slot: 'vehicles', mode: 'multiple', resultCount: 2 },
      { event: 'interaction_viewed', slot: 'criteria', mode: 'multiple' },
      { event: 'interaction_abandoned', slot: 'criteria', mode: 'multiple' },
    ])

    expect(summary).toEqual({
      viewed: 2,
      expanded: 1,
      search: 1,
      freeText: 0,
      submitted: 1,
      abandoned: 1,
      completionRate: 0.5,
      expandRate: 0.5,
      searchUseRate: 0.5,
      freeTextRate: 0,
      abandonmentRate: 0.5,
    })
  })
})
