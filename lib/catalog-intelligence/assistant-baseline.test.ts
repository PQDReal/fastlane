import { describe, expect, it } from 'vitest'

import { classifySearchQuery } from '@/lib/assistant/rules'
import baseline from './fixtures/assistant-baseline.json'

describe('assistant deterministic baseline', () => {
  it.each(baseline)('freezes the legacy parse for: $query', (entry) => {
    expect(classifySearchQuery(entry.query)).toMatchObject({
      intent: entry.intent,
      catalogQuery: entry.catalogQuery,
      filters: entry.filters,
    })
  })
})
