import { describe, expect, it } from 'vitest'

import { readSelectedOptionsSnapshot } from '@/lib/orders/selected-options'

describe('readSelectedOptionsSnapshot', () => {
  it('returns the immutable labels and prices stored at checkout', () => {
    const snapshot = [
      {
        groupId: '123e4567-e89b-12d3-a456-426614174001',
        groupCode: 'size',
        groupName: 'Kích cỡ khi đặt hàng',
        valueId: '123e4567-e89b-12d3-a456-426614174002',
        valueCode: 'xl',
        valueName: 'XL khi đặt hàng',
        priceAdjustment: '0',
      },
    ]

    expect(readSelectedOptionsSnapshot(snapshot)).toEqual(snapshot)
  })

  it('supports variants without option mappings', () => {
    expect(readSelectedOptionsSnapshot([])).toEqual([])
  })

  it('rejects malformed database snapshots instead of serving a broken contract', () => {
    expect(() =>
      readSelectedOptionsSnapshot([
        {
          groupId: '123e4567-e89b-12d3-a456-426614174001',
          groupCode: 'size',
          groupName: 'Kích cỡ',
          valueId: '123e4567-e89b-12d3-a456-426614174002',
          valueCode: 'xl',
          valueName: 'XL',
          priceAdjustment: 0,
        },
      ]),
    ).toThrow('invalid selected-options snapshot')
  })
})
