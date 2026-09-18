import { describe, expect, it } from 'vitest'

import { createAdminAccessoryDraft } from '@/lib/catalog/admin-accessory-draft'
import {
  normalizeAdminAccessoryDraft,
  restoreAdminAccessoryDraft,
  serializeAdminAccessoryDraft,
} from '@/lib/catalog/admin-accessory-session'

describe('admin accessory prototype session', () => {
  it('round-trips a versioned draft', () => {
    const draft = createAdminAccessoryDraft()
    draft.name = 'Bản nháp local'
    expect(restoreAdminAccessoryDraft(serializeAdminAccessoryDraft(draft), 'root')).toMatchObject({
      rootCategoryId: 'root', name: 'Bản nháp local',
    })
  })

  it('normalizes the legacy required shape', () => {
    const normalized = normalizeAdminAccessoryDraft({
      optionGroups: [{ id: 'g', code: 'gift', name: 'Quà', displayType: 'BUTTON', required: false, values: [] }],
      variants: [{ id: 'v', name: 'Mặc định', sku: '', originalPrice: '', salePrice: '', isActive: true, selections: {}, imageUrls: [] }],
    }, 'root')
    expect(normalized.optionGroups[0]).toMatchObject({ minimumSelections: 0, maximumSelections: 1 })
    expect(normalized.variants[0].isIncluded).toBe(true)
  })

  it('does not restore a client-generated SKU for an unsaved variant', () => {
    const normalized = normalizeAdminAccessoryDraft({
      variants: [{ id: 'matrix-1', name: 'Mặc định', sku: 'CLIENT-SKU', originalPrice: '', salePrice: '', isActive: true, selections: {}, imageUrls: [] }],
    }, 'root')
    expect(normalized.variants[0].sku).toBe('')
  })

  it('migrates a v3 category/model snapshot without dropping the draft', () => {
    const restored = restoreAdminAccessoryDraft(JSON.stringify({
      schemaVersion: 3,
      savedAt: '2026-08-03T00:00:00.000Z',
      draft: {
        primaryCollectionSlug: 'phu-kien-o-to-dien',
        modelCollectionSlugs: ['vf-8'],
        name: 'Cáp sạc',
        optionGroups: [],
        variants: [],
        productImageUrls: [],
      },
    }), 'root')
    expect(restored).toMatchObject({
      templateCode: 'custom',
      categoryAssignments: [{ categoryId: 'phu-kien-o-to-dien', compatibilityMode: 'SELECTED_MODELS', modelIds: ['vf-8'] }],
      name: 'Cáp sạc',
    })
  })

  it('rejects corrupt and future snapshots', () => {
    expect(() => restoreAdminAccessoryDraft('{', 'root')).toThrow()
    expect(() => restoreAdminAccessoryDraft(JSON.stringify({ schemaVersion: 99, draft: {} }), 'root'))
      .toThrow('Phiên bản bản nháp không được hỗ trợ.')
  })
})
