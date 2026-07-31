import { describe, expect, it } from 'vitest'

import {
  adminAccessoryDraftToWriteRequest,
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
    primaryCollectionId: PRIMARY_ID,
    modelCollectionIds: [MODEL_ID],
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
      drivesMedia: true,
      values: [{
        code: 'black',
        name: 'Đen',
        colorHex: '#000000',
        swatchUrl: null,
        displayOrder: 10,
        imageUrls: ['https://cdn.example.com/black.webp'],
      }],
    }],
    variants: [{
      name: 'Đen',
      sku: 'ACC-BLACK',
      originalPrice: 500000,
      salePrice: 450000,
      isActive: true,
      optionValues: { color: 'black' },
      imageUrls: [],
    }],
    productImageUrls: ['https://cdn.example.com/product.webp'],
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

  it('rejects media on a non-media option group', () => {
    const input = request()
    input.optionGroups[0].drivesMedia = false

    expect(() => parseAdminAccessoryWriteRequest(input)).toThrowError(
      expect.objectContaining<Partial<AdminAccessoryWriteValidationError>>({
        code: 'OPTION_MEDIA_GROUP_INVALID',
      }),
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
      primaryCollectionSlug: 'phu-kien-o-to-dien',
      modelCollectionSlugs: ['vf-8'],
      name: 'Ốp gương',
      slug: 'op-guong',
      description: 'Phụ kiện chính hãng.',
      isActive: true,
      productImageUrls: ['https://cdn.example.com/product.webp'],
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
          imageUrls: ['https://cdn.example.com/black.webp'],
        }],
      }],
      variants: [{
        id: 'variant-local',
        name: 'Đen',
        sku: 'ACC-BLACK',
        originalPrice: '500000',
        salePrice: '',
        isActive: true,
        isIncluded: true,
        selections: { 'group-local': 'value-local' },
        imageUrls: [''],
      }],
    })

    const payload = adminAccessoryDraftToWriteRequest(draft, collections)

    expect(payload.primaryCollectionId).toBe(PRIMARY_ID)
    expect(payload.modelCollectionIds).toEqual([MODEL_ID])
    expect(payload.variants[0].optionValues).toEqual({ color: 'black' })
    expect(payload.optionGroups[0].values[0]).not.toHaveProperty('existingId')
  })
})
