import { describe, expect, it } from 'vitest'

import { resolveActionHref } from './action-registry'

describe('sales agent navigation actions', () => {
  it('uses public routes that exist in the develop application', () => {
    expect(resolveActionHref('BROWSE_CATALOG', 'CAR')).toBe('/cars')
    expect(resolveActionHref('BROWSE_CATALOG', 'BIKE')).toBe('/bikes')
    expect(resolveActionHref('BROWSE_CATALOG', 'ACCESSORY')).toBe('/accessories')
    expect(resolveActionHref('OPEN_COMPARE')).toBe('/compare')
    expect(resolveActionHref('OPEN_PROMOTIONS')).toBe('/promotions')
    expect(resolveActionHref('CONSULT_AGENT')).toBe('/support')
  })
})
