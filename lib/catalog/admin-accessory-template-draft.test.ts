import { describe, expect, it } from 'vitest'

import { applyDatabaseAccessoryTemplateToDraft } from './admin-accessory-template-draft'
import { createAdminAccessoryDraft } from './admin-accessory-draft'
import type { AdminAccessoryTemplate } from './admin-accessory-template-types'

const template: AdminAccessoryTemplate = {
  id: '11111111-1111-1111-1111-111111111111',
  code: 'custom-film',
  name: 'Film tùy chỉnh',
  groupName: 'Phụ kiện xe',
  description: null,
  displayOrder: 10,
  isActive: true,
  currentVersion: 2,
  usageCount: 0,
  currentVersionId: '22222222-2222-2222-2222-222222222222',
  definition: {
    schema: 'accessory_template_v1',
    suggestedCategorySlugs: ['phu-kien-o-to-dien'],
    suggestedOptionCodes: [],
    sections: [{ key: 'specifications', type: 'TECHNICAL_SPECS', title: 'Thông số', attributes: [{ key: 'material', label: 'Vật liệu' }] }],
    optionGroups: [],
  },
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
}

describe('database accessory template draft application', () => {
  it('copies the revision into the draft and preserves custom sections', () => {
    const draft = createAdminAccessoryDraft()
    draft.sections.push({ id: 'custom-section', type: 'OTHER', title: 'Ghi chú riêng', body: '', itemsText: '', attributes: [] })
    const next = applyDatabaseAccessoryTemplateToDraft(draft, template)
    expect(next.templateVersionId).toBe(template.currentVersionId)
    expect(next.templateVersion).toBe(2)
    expect(next.sections.map((section) => section.id)).toEqual(['tpl_custom_film_specifications', 'custom-section'])
    expect(next.sections[0].attributes[0]).toMatchObject({ label: 'Vật liệu' })
  })
})
