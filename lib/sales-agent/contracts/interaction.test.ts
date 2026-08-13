import { describe, expect, it } from 'vitest'

import { validateSalesAgentInteraction } from './interaction'

const base = {
  schemaVersion: '1.0',
  interactionId: 'interaction-1',
  kind: 'choice',
  slot: 'vehicles',
  mode: 'multiple',
  title: 'Chọn xe',
  minSelections: 2,
  maxSelections: 3,
  allowFreeText: false,
  submitLabel: 'Tiếp tục',
  options: [{ optionId: 'a', label: 'VF 7' }, { optionId: 'b', label: 'VF 8' }],
  continuationToken: 'signed-token',
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
}

describe('sales agent interaction contract', () => {
  it('accepts a bounded multi-select interaction', () => {
    expect(validateSalesAgentInteraction(base)).toMatchObject({ slot: 'vehicles', minSelections: 2, maxSelections: 3 })
  })

  it('rejects duplicate options and unsupported version questions', () => {
    expect(() => validateSalesAgentInteraction({ ...base, options: [{ optionId: 'a', label: 'VF 7' }, { optionId: 'a', label: 'VF 8' }] })).toThrow('trùng')
    expect(() => validateSalesAgentInteraction({ ...base, slot: 'vehicles', mode: 'multiple', maxSelections: 1 })).toThrow()
  })

  it('enforces single-select cardinality', () => {
    expect(() => validateSalesAgentInteraction({ ...base, mode: 'single', minSelections: 2, maxSelections: 2 })).toThrow()
  })
})
