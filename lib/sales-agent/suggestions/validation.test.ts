import { describe, expect, it } from 'vitest'
import { validateSuggestionSelection } from './validation'

const snapshot = {
  products: [
    { id: 'vf3', productType: 'CAR' as const },
    { id: 'acc-1', productType: 'ACCESSORY' as const },
  ],
  lastRefreshedAt: 10,
}

describe('suggestion selection validation', () => {
  it('accepts active vehicle entities and reports catalog drift separately', () => {
    expect(validateSuggestionSelection({ suggestionId: 'sug-1', entityIds: ['vf3'], catalogVersion: 9 }, snapshot)).toEqual({
      valid: true,
      staleCatalog: true,
    })
  })

  it('rejects removed or accessory-only entity ids', () => {
    expect(validateSuggestionSelection({ suggestionId: 'sug-1', entityIds: ['acc-1'] }, snapshot)).toEqual({
      valid: false,
      reason: 'UNKNOWN_ENTITY',
    })
  })
})
