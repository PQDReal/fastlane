import { describe, expect, it } from 'vitest'

import {
  adminAccessoryDraftToWriteRequest,
  adminAccessoryRpcPayload,
  AdminAccessoryWriteValidationError,
  parseAdminAccessoryWriteRequest,
  type AdminAccessoryWriteRequest,
} from '@/lib/catalog/admin-accessory-write'
import { createAdminAccessoryDraft, type DraftCollection } from '@/lib/catalog/admin-accessory-draft'

const CATEGORY_ID = '11111111-1111-1111-1111-111111111111'
const PRIMARY_ID = '22222222-2222-2222-2222-222222222222'
const MODEL_ID = '33333333-3333-3333-3333-333333333333'
const LABEL_ID = '44444444-4444-4444-4444-444444444444'

function request(): AdminAccessoryWriteRequest {
  return {
    categoryId: CATEGORY_ID,
    templateCode: 'vehicle_fit',
    templateVersion: 1,
    categoryAssignments: [{ categoryId: PRIMARY_ID, compatibilityMode: 'SELECTED_MODELS', modelIds: [MODEL_ID] }],
    name: 'Ốp gương',
    slug: 'op-guong',
    description: 'Phụ kiện chính hãng.',
    isActive: true,
    serviceLabelIds: [LABEL_ID],
    content: {
      schema: 'accessory_content_v1',
      sections: [{
        key: 'features',
        type: 'FEATURES',
        title: 'Tính năng nổi bật',
        displayOrder: 10,
        body: null,
        items: ['Bền và dễ vệ sinh.'],
        attributes: [],
      }],
    },
    optionGroups: [{
      code: 'color',
      name: 'Màu sắc',
      displayType: 'SWATCH',
      minimumSelections: 1,
      maximumSelections: 1,
      displayOrder: 10,
      values: [{
        code: 'black',
        name: 'Đen',
        colorHex: '#000000',
        swatchUrl: null,
        displayOrder: 10,
      }],
    }],
    variants: [{
      name: 'Đen',
      originalPrice: 500000,
      salePrice: 450000,
      stockQuantity: 12,
      isActive: true,
      optionValues: { color: 'black' },
      imageUrls: ['https://cdn.example.com/black-sku.webp'],
    }],
  }
}

describe('parseAdminAccessoryWriteRequest', () => {
  it('accepts the normalized DB-compatible accessory aggregate', () => {
    const expectedUpdatedAt = '2026-07-31T03:01:02.123456+00:00'
    const parsed = parseAdminAccessoryWriteRequest({ ...request(), expectedUpdatedAt }, {
      requireExpectedUpdatedAt: true,
    })

    expect(parsed.expectedUpdatedAt).toBe(expectedUpdatedAt)
    expect(parsed.optionGroups[0].values[0]).not.toHaveProperty('priceAdjustment')
    expect(parsed.variants[0]).toMatchObject({
      originalPrice: 500000,
      salePrice: 450000,
      stockQuantity: 12,
      optionValues: { color: 'black' },
    })
  })

  it('rejects a price adjustment field instead of silently persisting add-on pricing', () => {
    const input = request()
    Object.assign(input.optionGroups[0].values[0], { priceAdjustment: 100000 })

    expect(() => parseAdminAccessoryWriteRequest(input)).toThrowError(
      expect.objectContaining<Partial<AdminAccessoryWriteValidationError>>({
        code: 'UNKNOWN_FIELD',
        path: 'optionGroups.0.values.0.priceAdjustment',
      }),
    )
  })

  it('rejects removed option-scoped media fields', () => {
    const input = request()
    Object.assign(input.optionGroups[0], { drivesMedia: false })

    expect(() => parseAdminAccessoryWriteRequest(input)).toThrowError(
      expect.objectContaining<Partial<AdminAccessoryWriteValidationError>>({
        code: 'UNKNOWN_FIELD',
      }),
    )
  })

  it('rejects client-provided SKU values because the database owns allocation', () => {
    const input = request()
    Object.assign(input.variants[0], { sku: 'CLIENT-SKU' })

    expect(() => parseAdminAccessoryWriteRequest(input)).toThrowError(
      expect.objectContaining<Partial<AdminAccessoryWriteValidationError>>({
        code: 'UNKNOWN_FIELD',
        path: 'variants.0.sku',
      }),
    )
  })

  it('requires direct media for every SKU and rejects the generic gallery field', () => {
    const input = request()
    input.variants[0].imageUrls = []

    expect(() => parseAdminAccessoryWriteRequest(input)).toThrowError(
      expect.objectContaining<Partial<AdminAccessoryWriteValidationError>>({
        code: 'VARIANT_MEDIA_REQUIRED',
        path: 'variants.0.imageUrls',
      }),
    )

    input.variants[0].imageUrls = ['https://cdn.example.com/black-sku.webp']
    expect(parseAdminAccessoryWriteRequest(input).variants[0].imageUrls).toEqual(['https://cdn.example.com/black-sku.webp'])

    expect(() => parseAdminAccessoryWriteRequest({ ...input, productImageUrls: ['https://cdn.example.com/gallery.webp'] })).toThrowError(
      expect.objectContaining<Partial<AdminAccessoryWriteValidationError>>({ code: 'UNKNOWN_FIELD', path: 'body.productImageUrls' }),
    )
  })

  it('validates required selections before any persistence call can run', () => {
    const input = request()
    input.variants[0].optionValues = {}

    expect(() => parseAdminAccessoryWriteRequest(input)).toThrowError(
      expect.objectContaining<Partial<AdminAccessoryWriteValidationError>>({
        code: 'VARIANT_SELECTION_REQUIRED',
      }),
    )
  })

  it('derives compatibility product media from the first active SKU only', () => {
    const parsed = parseAdminAccessoryWriteRequest(request())
    expect(adminAccessoryRpcPayload(parsed)).toMatchObject({
      productImageUrls: ['https://cdn.example.com/black-sku.webp'],
      optionGroups: [{ drivesMedia: false, values: [{ imageUrls: [] }] }],
    })
    expect(adminAccessoryRpcPayload(parsed).variants[0]).not.toHaveProperty('stockQuantity')
  })

  it('rejects duplicate, invalid-protocol and oversized SKU image lists', () => {
    const duplicate = request()
    duplicate.variants[0].imageUrls = ['https://cdn.example.com/a.webp', 'https://cdn.example.com/a.webp']
    expect(() => parseAdminAccessoryWriteRequest(duplicate)).toThrowError(
      expect.objectContaining<Partial<AdminAccessoryWriteValidationError>>({ path: 'variants.0.imageUrls', code: 'URL_DUPLICATE' }),
    )

    const invalid = request()
    invalid.variants[0].imageUrls = ['ftp://cdn.example.com/a.webp']
    expect(() => parseAdminAccessoryWriteRequest(invalid)).toThrowError(
      expect.objectContaining<Partial<AdminAccessoryWriteValidationError>>({ path: 'variants.0.imageUrls.0', code: 'URL_INVALID' }),
    )

    const oversized = request()
    oversized.variants[0].imageUrls = Array.from({ length: 21 }, (_, index) => `https://cdn.example.com/${index}.webp`)
    expect(() => parseAdminAccessoryWriteRequest(oversized)).toThrowError(
      expect.objectContaining<Partial<AdminAccessoryWriteValidationError>>({ path: 'variants.0.imageUrls', code: 'URL_LIST_INVALID' }),
    )
  })

  it('normalizes the legacy taxonomy payload during the rollout window', () => {
    const { templateCode: _templateCode, templateVersion: _templateVersion, categoryAssignments: _categoryAssignments, ...aggregate } = request()
    const parsed = parseAdminAccessoryWriteRequest({
      ...aggregate,
      primaryCollectionId: PRIMARY_ID,
      modelCollectionIds: [MODEL_ID],
    })
    expect(parsed).toMatchObject({
      legacyTaxonomy: true,
      templateCode: 'custom',
      templateVersion: 1,
      categoryAssignments: [{ categoryId: PRIMARY_ID, compatibilityMode: 'SELECTED_MODELS', modelIds: [MODEL_ID] }],
    })
  })

  it('rejects a payload that mixes legacy and multi-category taxonomy', () => {
    expect(() => parseAdminAccessoryWriteRequest({
      ...request(),
      primaryCollectionId: PRIMARY_ID,
      modelCollectionIds: [],
    })).toThrowError(expect.objectContaining<Partial<AdminAccessoryWriteValidationError>>({
      code: 'TAXONOMY_SHAPE_CONFLICT',
    }))
  })
})

describe('adminAccessoryDraftToWriteRequest', () => {
  it('maps internal editor IDs to stable group/value codes and real taxonomy IDs', () => {
    const collections: DraftCollection[] = [
      { id: PRIMARY_ID, parentId: null, kind: 'CATEGORY', slug: 'phu-kien-o-to-dien', name: 'Phụ kiện ô tô điện', displayOrder: 10 },
      { id: MODEL_ID, parentId: PRIMARY_ID, kind: 'MODEL', slug: 'vf-8', name: 'VF 8', displayOrder: 10 },
    ]
    const draft = createAdminAccessoryDraft()
    Object.assign(draft, {
      rootCategoryId: CATEGORY_ID,
      templateCode: 'vehicle_fit',
      templateVersion: 1,
      categoryAssignments: [{ categoryId: PRIMARY_ID, compatibilityMode: 'SELECTED_MODELS', modelIds: [MODEL_ID] }],
      name: 'Ốp gương',
      slug: 'op-guong',
      description: 'Phụ kiện chính hãng.',
      isActive: true,
      optionGroups: [{
        id: 'group-local',
        presetCode: 'color',
        code: 'color',
        name: 'Màu sắc',
        displayType: 'SWATCH',
        minimumSelections: 1,
        maximumSelections: 1,
        values: [{
          id: 'value-local',
          code: 'black',
          name: 'Đen',
          colorHex: '#000000',
          swatchUrl: '',
        }],
      }],
      variants: [{
        id: 'variant-local',
        name: 'Đen',
        sku: 'ACC-BLACK',
        originalPrice: '500000',
        salePrice: '',
        stockQuantity: '7',
        isActive: true,
        isIncluded: true,
        selections: { 'group-local': 'value-local' },
        imageUrls: ['https://cdn.example.com/black-sku.webp'],
      }],
    })

    const payload = adminAccessoryDraftToWriteRequest(draft, collections)

    expect(payload.categoryAssignments).toEqual([{ categoryId: PRIMARY_ID, compatibilityMode: 'SELECTED_MODELS', modelIds: [MODEL_ID] }])
    expect(payload.variants[0].optionValues).toEqual({ color: 'black' })
    expect(payload.variants[0].stockQuantity).toBe(7)
    expect(payload.optionGroups[0].values[0]).not.toHaveProperty('existingId')
  })
})
