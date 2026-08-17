import { describe, expect, it } from 'vitest'
import { reconstructCarAdminConfiguration } from './car-admin-variants'

describe('reconstructCarAdminConfiguration', () => {
  it('groups legacy colour rows into one canonical version', () => {
    const productVariants = [
      {
        id: 'base',
        name: 'VF 2 Tiêu chuẩn',
        sku: 'VINFAST-VF2-01',
        original_price: 188_000_000,
        deposit_amount: 15_000_000,
        metadata: { publishedAttributes: { version: 'VF 2 Tiêu chuẩn' } },
      },
      { id: 'silver', name: 'VinFast VF 2 Tiêu chuẩn Desat Silver', sku: 'VF2-STD-DESAT-SILVER', original_price: 188_000_000, metadata: {} },
      { id: 'white', name: 'VinFast VF 2 Tiêu chuẩn Infinity Blanc', sku: 'VF2-STD-INFINITY-BLANC', original_price: 188_000_000, metadata: {} },
    ]
    const vehicleVariants = [
      {
        product_variant_id: 'silver', version: 'Tiêu chuẩn', color: 'Desat Silver', sku: 'VF2-STD-DESAT-SILVER',
        price: 188_000_000, deposit_amount: 15_000_000,
        specs: { interior_colors: [{ name: 'Granite Black', swatch: 'black.webp' }] },
      },
      {
        product_variant_id: 'white', version: 'Tiêu chuẩn', color: 'Infinity Blanc', sku: 'VF2-STD-INFINITY-BLANC',
        price: 196_000_000, deposit_amount: 15_000_000,
        specs: { interior_colors: [{ name: 'Granite Black', swatch: 'black.webp' }] },
      },
    ]

    const result = reconstructCarAdminConfiguration({
      productVariants,
      vehicleVariants,
      inventoryByVariantId: new Map([['silver', 0], ['white', 4]]),
      declaredVersions: ['Tiêu chuẩn'],
      colors: [{ color_name: 'Desat Silver' }, { color_name: 'Infinity Blanc' }],
      interiors: [],
    })

    expect(result.versions).toHaveLength(1)
    expect(result.versions[0]).toMatchObject({
      name: 'Tiêu chuẩn',
      sku: 'VINFAST-VF2-01',
      compatible_colors: ['Desat Silver', 'Infinity Blanc'],
      interiors_by_color: {
        'Desat Silver': ['Granite Black'],
        'Infinity Blanc': ['Granite Black'],
      },
      price: 188_000_000,
    })
    expect(result.versions[0].stock_by_configuration).toEqual({
      '["Desat Silver","Granite Black"]': 0,
      '["Infinity Blanc","Granite Black"]': 4,
    })
    expect(result.interiors).toEqual([{ interior_name: 'Granite Black', image_url: '', image_urls: [], allowed_combinations: [], swatch: 'black.webp' }])
  })

  it('keeps exact Admin metadata as a fallback when vehicle rows are absent', () => {
    const result = reconstructCarAdminConfiguration({
      productVariants: [{
        id: 'exact', sku: 'CAR-ECO-C01-I01', name: 'Eco - Red - Black',
        original_price: 1, deposit_amount: 1,
        metadata: { version: 'Eco', base_sku: 'CAR-ECO', color: 'Red', interior_color: 'Black' },
      }],
      vehicleVariants: [],
      inventoryByVariantId: new Map([['exact', 3]]),
      colors: [{ color_name: 'Red' }],
      interiors: [{ interior_name: 'Black' }],
    })

    expect(result.versions).toHaveLength(1)
    expect(result.versions[0].name).toBe('Eco')
    expect(result.versions[0].stock_by_configuration['["Red","Black"]']).toBe(3)
  })
})
