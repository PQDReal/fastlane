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
    draft.mediaOptionGroupId = null
    expect(restoreAdminAccessoryDraft(serializeAdminAccessoryDraft(draft), 'root')).toMatchObject({
      rootCategoryId: 'root', name: 'Bản nháp local', mediaOptionGroupId: null,
    })
  })

  it('normalizes the legacy required shape', () => {
    const normalized = normalizeAdminAccessoryDraft({
      optionGroups: [{ id: 'g', code: 'gift', name: 'Quà', displayType: 'BUTTON', required: false, mediaEnabled: true, values: [] }],
      variants: [{ id: 'v', name: 'Mặc định', sku: '', originalPrice: '', salePrice: '', isActive: true, selections: {}, imageUrls: [] }],
    }, 'root')
    expect(normalized.optionGroups[0]).toMatchObject({ minimumSelections: 0, maximumSelections: 1, mediaEnabled: true })
    expect(normalized.variants[0].isIncluded).toBe(true)
  })

  it('rejects corrupt and future snapshots', () => {
    expect(() => restoreAdminAccessoryDraft('{', 'root')).toThrow()
    expect(() => restoreAdminAccessoryDraft(JSON.stringify({ schemaVersion: 99, draft: {} }), 'root'))
      .toThrow('Phiên bản bản nháp không được hỗ trợ.')
  })
})
