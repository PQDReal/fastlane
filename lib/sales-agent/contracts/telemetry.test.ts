import { describe, expect, it } from 'vitest'

import { parseSalesAgentInteractionMetric } from './telemetry'

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
})
