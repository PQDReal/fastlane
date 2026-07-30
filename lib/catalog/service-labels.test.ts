import { describe, expect, it } from 'vitest'

import {
  matchingProductIdsForLabels,
  parseServiceLabelIds,
  parseServiceLabelInput,
} from '@/lib/catalog/service-labels'

describe('service label input', () => {
  it('normalizes a valid input', () => {
    expect(parseServiceLabelInput({
      code: ' Showroom_Pickup ',
      name: ' Nhận tại showroom ',
      description: ' ',
      displayOrder: '20',
      isActive: true,
    })).toEqual({
      ok: true,
      value: {
        code: 'showroom_pickup',
        name: 'Nhận tại showroom',
        description: null,
        displayOrder: 20,
        isActive: true,
      },
    })
  })

  it('rejects invalid codes and display order', () => {
    expect(parseServiceLabelInput({ code: 'Sai mã', name: 'Tên', displayOrder: 0 }).ok).toBe(false)
    expect(parseServiceLabelInput({ code: 'valid', name: 'Tên', displayOrder: -1 }).ok).toBe(false)
    expect(parseServiceLabelInput({ code: 'valid', name: 'Tên', displayOrder: 0, extra: true }).ok).toBe(false)
    expect(parseServiceLabelInput({ code: 'valid', name: 'Tên', displayOrder: 0, isActive: 'yes' }).ok).toBe(false)
  })

  it('deduplicates valid assignment ids and rejects malformed ids', () => {
    const id = '11111111-1111-4111-8111-111111111111'
    expect(parseServiceLabelIds([id, id])).toEqual([id])
    expect(parseServiceLabelIds(['invalid'])).toBeNull()
    expect(parseServiceLabelIds(Array.from({ length: 101 }, () => id))).toBeNull()
  })
})

describe('service label AND matching', () => {
  const assignments = [
    { productId: 'both', serviceLabelId: 'installation' },
    { productId: 'both', serviceLabelId: 'showroom' },
    { productId: 'one', serviceLabelId: 'installation' },
    { productId: 'both', serviceLabelId: 'installation' },
  ]

  it('returns products with every selected label using distinct matches', () => {
    expect(matchingProductIdsForLabels(assignments, ['installation', 'showroom'])).toEqual(['both'])
  })

  it('supports a single label and no selected labels', () => {
    expect(matchingProductIdsForLabels(assignments, ['installation'])).toEqual(['both', 'one'])
    expect(matchingProductIdsForLabels(assignments, [])).toEqual([])
  })
})
