import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { ProductOptionSummary } from '@/components/product-option-summary'

describe('ProductOptionSummary', () => {
  it('renders the immutable option labels supplied by cart and order APIs', () => {
    const markup = renderToStaticMarkup(
      <ProductOptionSummary
        options={[
          {
            groupId: 'group-color',
            groupCode: 'color',
            groupName: 'Màu sắc',
            valueId: 'value-red',
            valueCode: 'red',
            valueName: 'Đỏ',
            priceAdjustment: '0',
          },
          {
            groupId: 'group-size',
            groupCode: 'size',
            groupName: 'Kích cỡ',
            valueId: 'value-m',
            valueCode: 'm',
            valueName: 'M',
            priceAdjustment: '0',
          },
        ]}
      />,
    )

    expect(markup).toContain('Màu sắc:')
    expect(markup).toContain('Đỏ')
    expect(markup).toContain('Kích cỡ:')
    expect(markup).toContain('M')
  })

  it('renders nothing for a variant without options', () => {
    expect(renderToStaticMarkup(<ProductOptionSummary options={[]} />)).toBe('')
  })
})
