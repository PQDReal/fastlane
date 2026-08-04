import { describe, expect, it } from 'vitest'

import { mapAdminAccessoryEditorRow } from '@/lib/catalog/admin-accessory-editor'

describe('mapAdminAccessoryEditorRow', () => {
  it('reconstructs an editable draft from a normalized legacy accessory row', () => {
    const data = mapAdminAccessoryEditorRow({
      id: 'product-1',
      category_id: 'category-1',
      name: 'Áo khoác',
      slug: 'ao-khoac',
      description: 'Mô tả',
      product_type: 'ACCESSORY',
      is_active: true,
      updated_at: '2026-07-31T03:00:00.123456+00:00',
      image_urls: ['https://legacy.example.com/product.webp'],
      specifications: {
        schema: 'accessory_content_v1',
        sections: [{
          key: 'features',
          type: 'FEATURES',
          title: 'Tính năng',
          display_order: 10,
          body: null,
          items: ['Ấm'],
          attributes: [],
        }],
      },
      service_label_assignments: [{ service_label_id: 'label-1' }],
      collection_memberships: [{
        is_active: true,
        is_primary: true,
        collection: { id: 'collection-1', kind: 'CATEGORY', slug: 'phong-cach-song', is_active: true },
      }],
      option_groups: [{
        id: 'group-1',
        code: 'size',
        name: 'Kích thước',
        display_type: 'BUTTON',
        minimum_selections: 1,
        display_order: 10,
        is_active: true,
        metadata: { drivesMedia: false },
        option_values: [{ id: 'value-1', code: 'm', name: 'M', display_order: 10, is_active: true }],
      }],
      variants: [{
        id: 'variant-1',
        sku: 'JACKET-M',
        name: 'M',
        original_price: 1000000,
        sale_price: null,
        is_active: true,
        option_mappings: [{ option_group_id: 'group-1', option_value_id: 'value-1' }],
      }],
      media: [{
        id: 'media-1',
        variant_id: 'variant-1',
        option_value_id: null,
        url: 'https://cdn.example.com/m.webp',
        display_order: 10,
        is_active: true,
      }],
    })

    expect(data.updatedAt).toBe('2026-07-31T03:00:00.123456+00:00')
    expect(data.draft).toMatchObject({
      rootCategoryId: 'category-1',
      primaryCollectionSlug: 'phong-cach-song',
      name: 'Áo khoác',
      serviceLabelIds: ['label-1'],
      productImageUrls: [''],
    })
    expect(data.draft.optionGroups[0]).toMatchObject({ id: 'group-1', code: 'size', mediaEnabled: false })
    expect(data.draft.variants[0]).toMatchObject({
      id: 'variant-1',
      sku: 'JACKET-M',
      selections: { 'group-1': 'value-1' },
      imageUrls: ['https://cdn.example.com/m.webp'],
    })
    expect(data.draft.sections[0]).toMatchObject({ id: 'features', itemsText: 'Ấm' })
  })

  it('infers legacy option media and excludes inactive service labels', () => {
    const data = mapAdminAccessoryEditorRow({
      id: 'product-2',
      category_id: 'category-1',
      name: 'Mũ bảo hiểm',
      slug: 'mu-bao-hiem',
      description: 'Mô tả',
      product_type: 'ACCESSORY',
      is_active: false,
      updated_at: '2026-07-31T04:00:00.000000+00:00',
      specifications: { schema: 'accessory_content_v1', sections: [] },
      service_label_assignments: [
        { service_label_id: 'label-active', service_label: { is_active: true } },
        { service_label_id: 'label-inactive', service_label: { is_active: false } },
      ],
      collection_memberships: [],
      option_groups: [{
        id: 'group-color',
        code: 'color',
        name: 'Màu sắc',
        display_type: 'SWATCH',
        minimum_selections: 1,
        display_order: 10,
        is_active: true,
        metadata: {},
        option_values: [{
          id: 'value-blue',
          code: 'xanh',
          name: 'Xanh',
          display_order: 10,
          is_active: true,
        }],
      }],
      variants: [{
        id: 'variant-blue',
        sku: 'HELMET-BLUE',
        name: 'Xanh',
        original_price: 500000,
        sale_price: null,
        is_active: true,
        option_mappings: [{ option_group_id: 'group-color', option_value_id: 'value-blue' }],
      }],
      media: [{
        id: 'media-blue',
        variant_id: null,
        option_value_id: 'value-blue',
        url: 'https://cdn.example.com/blue.webp',
        display_order: 10,
        is_active: true,
      }],
    })

    expect(data.draft.serviceLabelIds).toEqual(['label-active'])
    expect(data.draft.optionGroups[0]).toMatchObject({
      id: 'group-color',
      mediaEnabled: undefined,
      values: [{ id: 'value-blue', imageUrls: ['https://cdn.example.com/blue.webp'] }],
    })
    expect(data.draft.mediaOptionGroupId).toBeUndefined()
  })
})
