import { describe, expect, it } from 'vitest'

import { salesAgentBudgetConstraint, salesAgentBudgetOptions } from './budget'

describe('sales agent budget choices', () => {
  it('uses vehicle-type-specific ranges instead of car ranges for every product', () => {
    expect(salesAgentBudgetOptions('BIKE').map((option) => option.label)).toEqual([
      'Dưới 20 triệu', '20–35 triệu', '35–50 triệu', 'Trên 50 triệu',
    ])
    expect(salesAgentBudgetOptions('ACCESSORY')[0]?.label).toBe('Dưới 1 triệu')
    expect(salesAgentBudgetOptions('CAR')[0]?.label).toBe('Dưới 700 triệu')
  })

  it('maps signed allowlist values to deterministic numeric filters', () => {
    expect(salesAgentBudgetConstraint('20m_35m')).toEqual({ productType: 'BIKE', minPrice: 20_000_000, maxPrice: 35_000_000 })
    expect(salesAgentBudgetConstraint('unknown')).toBeNull()
  })
})
