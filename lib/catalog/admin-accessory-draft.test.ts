import { describe, expect, it } from 'vitest'

import {
  ACCESSORY_CATALOG_COLLECTIONS,
  adminAccessoryDraftToCatalogProduct,
  accessoryModelCollectionsForCategory,
  accessoryAdminSlug,
  buildVariantMatrix,
  createAdminAccessoryDraft,
  draftOptionGroupSupportsMedia,
  generateVariantSku,
  isSectionComplete,
  resolvedDraftMediaOptionGroupId,
  variantIsComplete,
  variantSignature,
} from '@/lib/catalog/admin-accessory-draft'

describe('admin accessory draft helpers', () => {
  it('resolves vehicle-model collections only through their selected parent category', () => {
    expect(accessoryModelCollectionsForCategory(ACCESSORY_CATALOG_COLLECTIONS, 'phu-kien-o-to-dien').map((collection) => collection.slug))
      .toEqual(['vf-9', 'vf-8', 'vf-7', 'vf-6', 'nerio-green', 'limo-green', 'vf-5', 'vf-3'])
    expect(accessoryModelCollectionsForCategory(ACCESSORY_CATALOG_COLLECTIONS, 'phong-cach-song')).toEqual([])
  })

  it('does not emit a model membership outside the selected category branch', () => {
    const draft = createAdminAccessoryDraft()
    draft.primaryCollectionSlug = 'phong-cach-song'
    draft.modelCollectionSlugs = ['vf-9']

    const product = adminAccessoryDraftToCatalogProduct(draft, [])

    expect(product.collectionMemberships.map((membership) => membership.collection.slug))
      .toEqual(['phong-cach-song'])
  })

  it('emits the selected model as a child of its primary category in preview data', () => {
    const draft = createAdminAccessoryDraft()
    draft.primaryCollectionSlug = 'phu-kien-o-to-dien'
    draft.modelCollectionSlugs = ['vf-9']

    const product = adminAccessoryDraftToCatalogProduct(draft, [])
    const modelMembership = product.collectionMemberships.find((membership) => membership.collection.slug === 'vf-9')

    expect(modelMembership?.collection.parentId).toBe('preview-collection-phu-kien-o-to-dien')
  })

  it('creates stable slugs from Vietnamese names', () => {
    expect(accessoryAdminSlug('Áo Mưa Cánh Dơi')).toBe('ao-mua-canh-doi')
  })

  it('requires content in an authored section', () => {
    const section = {
      id: 'section-1',
      type: 'FEATURES' as const,
      title: 'Tính năng',
      body: '',
      itemsText: '',
      attributes: [],
    }
    expect(isSectionComplete(section)).toBe(false)
    expect(isSectionComplete({ ...section, itemsText: 'Chống nước' })).toBe(true)
  })

  it('validates variant selections and prices', () => {
    const group = {
      id: 'color', presetCode: 'color', code: 'color', name: 'Màu sắc', displayType: 'SWATCH' as const,
      required: true, values: [{ id: 'blue', code: 'blue', name: 'Xanh', colorHex: '#0057B8', swatchUrl: '', imageUrls: [] }],
    }
    const variant = {
      id: 'variant-1', name: 'Xanh', sku: 'ACC-BLUE', originalPrice: '200000', salePrice: '180000',
      isActive: true, selections: { color: 'blue' }, imageUrls: [],
    }
    expect(variantIsComplete(variant, [group])).toBe(true)
    expect(variantSignature(variant, [group])).toBe('color=blue')
    expect(variantIsComplete({ ...variant, salePrice: '220000' }, [group])).toBe(false)
  })

  it('builds a variant matrix and preserves matching variant data', () => {
    const color = {
      id: 'color', presetCode: 'color', code: 'color', name: 'Màu sắc', displayType: 'SWATCH' as const,
      required: true,
      values: [
        { id: 'blue', code: 'blue', name: 'Xanh', colorHex: '', swatchUrl: '', imageUrls: [] },
        { id: 'red', code: 'red', name: 'Đỏ', colorHex: '', swatchUrl: '', imageUrls: [] },
      ],
    }
    const size = {
      id: 'size', presetCode: 'size', code: 'size', name: 'Kích thước', displayType: 'BUTTON' as const,
      required: true,
      values: [
        { id: 'small', code: 's', name: 'S', colorHex: '', swatchUrl: '', imageUrls: [] },
        { id: 'medium', code: 'm', name: 'M', colorHex: '', swatchUrl: '', imageUrls: [] },
      ],
    }
    const existing = {
      id: 'existing', name: 'Xanh / S', sku: 'BLUE-S', originalPrice: '200000', salePrice: '',
      isActive: true, selections: { color: 'blue', size: 'small' }, imageUrls: ['blue.jpg'],
    }
    const matrix = buildVariantMatrix([color, size], [existing])

    expect(matrix).toHaveLength(4)
    expect(matrix[0]).toMatchObject({ id: 'existing', sku: 'BLUE-S', imageUrls: ['blue.jpg'] })
    expect(matrix.map((variant) => variant.name)).toEqual(['Xanh / S', 'Xanh / M', 'Đỏ / S', 'Đỏ / M'])
  })

  it('refreshes generated names and collapses back to one default variant', () => {
    const color = {
      id: 'color', presetCode: 'color', code: 'color', name: 'Màu sắc', displayType: 'SWATCH' as const,
      required: true,
      values: [{ id: 'blue', code: 'blue', name: 'Xanh mới', colorHex: '', swatchUrl: '', imageUrls: [] }],
    }
    const existing = {
      id: 'existing', name: 'Tên cũ', sku: 'BLUE', originalPrice: '200000', salePrice: '',
      isActive: false, selections: { color: 'blue' }, imageUrls: ['blue.jpg'],
    }

    const refreshed = buildVariantMatrix([color], [existing])
    expect(refreshed[0]).toMatchObject({
      id: 'existing', name: 'Xanh mới', sku: 'BLUE', originalPrice: '200000', isActive: false,
    })

    const collapsed = buildVariantMatrix([], refreshed)
    expect(collapsed).toEqual([{ ...refreshed[0], name: 'Mặc định', selections: {} }])
  })

  it('creates a real empty branch for an optional variant group', () => {
    const group = {
      id: 'engraving', presetCode: '', code: 'engraving', name: 'Khắc tên',
      displayType: 'BUTTON' as const, minimumSelections: 0, maximumSelections: 1,
      values: [{ id: 'yes', code: 'yes', name: 'Có', colorHex: '', swatchUrl: '', imageUrls: [] }],
    }

    const matrix = buildVariantMatrix([group], createAdminAccessoryDraft().variants)

    expect(matrix).toHaveLength(2)
    expect(matrix.map((variant) => variant.selections.engraving)).toEqual([null, 'yes'])
    expect(matrix[0].name).toBe('Không chọn khắc tên')
  })

  it('preserves edits on an optional null branch when rebuilding', () => {
    const group = {
      id: 'engraving', presetCode: '', code: 'engraving', name: 'Khắc tên',
      displayType: 'BUTTON' as const, minimumSelections: 0, maximumSelections: 1,
      values: [{ id: 'yes', code: 'yes', name: 'Có', colorHex: '', swatchUrl: '', imageUrls: [] }],
    }
    const edited = buildVariantMatrix([group], []).map((variant) => variant.selections.engraving === null
      ? { ...variant, sku: 'NO-ENGRAVING', originalPrice: '99000', isIncluded: false }
      : variant)

    const rebuilt = buildVariantMatrix([{ ...group, name: 'Nội dung khắc' }], edited)

    expect(rebuilt.find((variant) => variant.selections.engraving === null)).toMatchObject({
      sku: 'NO-ENGRAVING',
      originalPrice: '99000',
      isIncluded: false,
    })
  })

  it('keeps excluded variant data but omits it from the customer preview product', () => {
    const draft = createAdminAccessoryDraft()
    draft.variants = [
      { ...draft.variants[0], id: 'included', sku: 'INCLUDED', originalPrice: '100000', isIncluded: true },
      { ...draft.variants[0], id: 'excluded', sku: 'EXCLUDED', originalPrice: '200000', isIncluded: false },
    ]

    const product = adminAccessoryDraftToCatalogProduct(draft, [])
    expect(product.variants.map((variant) => variant.id)).toEqual(['included'])
    expect(product.priceRange).toEqual({ minimum: 100000, maximum: 100000 })
  })

  it('generates SKUs from a prefix and selected option codes', () => {
    const groups = [{
      id: 'color', presetCode: 'color', code: 'color', name: 'Màu sắc', displayType: 'SWATCH' as const,
      required: true,
      values: [{ id: 'blue', code: 'blue', name: 'Xanh', colorHex: '', swatchUrl: '', imageUrls: [] }],
    }]
    const variant = {
      id: 'variant-1', name: 'Xanh', sku: '', originalPrice: '100000', salePrice: '', isActive: true,
      selections: { color: 'blue' }, imageUrls: [],
    }
    expect(generateVariantSku('Rain coat', variant, groups, 0)).toBe('RAIN-COAT-BLUE')
    expect(generateVariantSku('ACC', { ...variant, selections: {} }, groups, 4)).toBe('ACC-05')
  })

  it('keeps standard section names fixed and uses a free title only for Other', () => {
    const draft = createAdminAccessoryDraft()
    draft.sections = [
      {
        id: 'usage', type: 'USAGE_GUIDE', title: 'test', body: 'Cách dùng', itemsText: '', attributes: [],
      },
      {
        id: 'other', type: 'OTHER', title: 'test', body: 'Nội dung khác', itemsText: '', attributes: [],
      },
    ]

    const product = adminAccessoryDraftToCatalogProduct(draft, [])

    expect(product.content.sections.map((section) => section.title)).toEqual([
      'Hướng dẫn sử dụng',
      'test',
    ])
  })

  it('adapts an unsaved draft to the customer catalog contract', () => {
    const draft = createAdminAccessoryDraft()
    draft.name = 'Áo mưa xem trước'
    draft.slug = 'ao-mua-xem-truoc'
    draft.primaryCollectionSlug = 'phong-cach-song'
    draft.productImageUrls = ['product.jpg']
    draft.optionGroups = [{
      id: 'color', presetCode: 'color', code: 'color', name: 'Màu sắc', displayType: 'SWATCH', required: true,
      values: [{ id: 'blue', code: 'blue', name: 'Xanh', colorHex: '#0057B8', swatchUrl: '', imageUrls: ['blue.jpg'] }],
    }]
    draft.variants = [{
      id: 'blue-variant', name: 'Xanh', sku: 'RAIN-BLUE', originalPrice: '200000', salePrice: '180000',
      isActive: true, selections: { color: 'blue' }, imageUrls: ['variant.jpg'],
    }]

    const product = adminAccessoryDraftToCatalogProduct(draft, [])

    expect(product).toMatchObject({
      id: 'preview-product',
      name: 'Áo mưa xem trước',
      slug: 'ao-mua-xem-truoc',
      availableQuantity: 25,
      priceRange: { minimum: 180000, maximum: 180000 },
    })
    expect(product.optionGroups[0]).toMatchObject({ code: 'color', minimumSelections: 1 })
    expect(product.variants[0]).toMatchObject({
      sku: 'RAIN-BLUE', effectivePrice: 180000, availableQuantity: 25, selectedOptions: { color: 'blue' },
    })
    expect(product.media.byVariant['blue-variant'][0].url).toBe('variant.jpg')
    expect(product.media.byOptionValue.blue[0].url).toBe('blue.jpg')
  })

  it('models premium colors as separately priced SKUs without option adjustments', () => {
    const draft = createAdminAccessoryDraft()
    draft.optionGroups = [{
      id: 'color',
      presetCode: 'color',
      code: 'color',
      name: 'Màu sắc',
      displayType: 'SWATCH',
      minimumSelections: 1,
      maximumSelections: 1,
      values: [
        { id: 'standard', code: 'standard', name: 'Màu tiêu chuẩn', colorHex: '#FFFFFF', swatchUrl: '', imageUrls: [] },
        { id: 'premium', code: 'premium', name: 'Màu cao cấp', colorHex: '#C9A227', swatchUrl: '', imageUrls: [] },
      ],
    }]
    draft.variants = buildVariantMatrix(draft.optionGroups, []).map((variant) => {
      const premium = variant.selections.color === 'premium'
      return {
        ...variant,
        sku: premium ? 'ACC-COLOR-PREMIUM' : 'ACC-COLOR-STANDARD',
        originalPrice: premium ? '2500000' : '2000000',
      }
    })

    const product = adminAccessoryDraftToCatalogProduct(draft, [])

    expect(product.optionGroups[0].values.map((value) => value.priceAdjustment)).toEqual([0, 0])
    expect(product.variants).toEqual(expect.arrayContaining([
      expect.objectContaining({ sku: 'ACC-COLOR-STANDARD', effectivePrice: 2000000, selectedOptions: { color: 'standard' } }),
      expect.objectContaining({ sku: 'ACC-COLOR-PREMIUM', effectivePrice: 2500000, selectedOptions: { color: 'premium' } }),
    ]))
    expect(product.priceRange).toEqual({ minimum: 2000000, maximum: 2500000 })
  })

  it('derives the media attribute and persists an explicit group selection in preview metadata', () => {
    const draft = createAdminAccessoryDraft()
    draft.optionGroups = [
      {
        id: 'size', presetCode: 'size', code: 'size', name: 'Kích thước', displayType: 'BUTTON',
        minimumSelections: 1, maximumSelections: 1,
        values: [{ id: 'm', code: 'm', name: 'M', colorHex: '', swatchUrl: '', imageUrls: [] }],
      },
      {
        id: 'color', presetCode: 'color', code: 'color', name: 'Màu sắc', displayType: 'SWATCH',
        minimumSelections: 1, maximumSelections: 1,
        values: [{ id: 'blue', code: 'blue', name: 'Xanh', colorHex: '#0057B8', swatchUrl: '', imageUrls: [] }],
      },
    ]

    expect(draftOptionGroupSupportsMedia(draft.optionGroups[0])).toBe(false)
    expect(draftOptionGroupSupportsMedia(draft.optionGroups[1])).toBe(true)
    expect(resolvedDraftMediaOptionGroupId(draft)).toBe('color')

    draft.optionGroups[0].mediaEnabled = true
    draft.mediaOptionGroupId = 'size'
    const product = adminAccessoryDraftToCatalogProduct(draft, [])
    expect(product.optionGroups.map((group) => group.metadata.drivesMedia)).toEqual([true, false])

    draft.mediaOptionGroupId = null
    expect(resolvedDraftMediaOptionGroupId(draft)).toBeNull()
  })
})
