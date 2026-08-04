import { describe, expect, it } from 'vitest'

import {
  ACCESSORY_TEMPLATE_DEFINITIONS,
  applyAccessoryTemplateToDraft,
  accessoryTemplate,
  isTemplateSectionKey,
  templateSectionKey,
} from '@/lib/catalog/admin-accessory-templates'
import { createAdminAccessoryDraft } from '@/lib/catalog/admin-accessory-draft'

describe('admin accessory templates', () => {
  it('keeps the deliberate small registry: four focused templates and Custom', () => {
    expect(ACCESSORY_TEMPLATE_DEFINITIONS.map((template) => template.code)).toEqual([
      'vehicle_fit', 'window_film', 'apparel', 'ev_charger', 'custom',
    ])
    expect(ACCESSORY_TEMPLATE_DEFINITIONS.some((template) => template.label.toLocaleLowerCase('vi-VN').includes('bình'))).toBe(false)
  })

  it('resolves only immutable published versions and namespaces owned sections', () => {
    expect(accessoryTemplate('apparel', 1)?.suggestedOptionCodes).toEqual(['color', 'size'])
    expect(accessoryTemplate('window_film', 1)?.suggestedCategorySlugs).toEqual(['phu-kien-o-to-dien'])
    expect(accessoryTemplate('apparel', 2)).toBeNull()
    expect(isTemplateSectionKey(templateSectionKey('ev_charger', 'specifications'))).toBe(true)
  })

  it('replaces only template-owned sections when a template is applied', () => {
    const customSection = {
      id: 'custom-section',
      type: 'FEATURES' as const,
      title: 'Nội dung riêng',
      body: '',
      itemsText: 'Giữ lại nội dung này',
      attributes: [],
    }
    const vehicleDraft = applyAccessoryTemplateToDraft({
      ...createAdminAccessoryDraft(),
      name: 'Phụ kiện mẫu',
      sections: [customSection],
    }, 'vehicle_fit')
    vehicleDraft.sections[0].attributes[0].value = 'Dữ liệu cũ'

    const apparelDraft = applyAccessoryTemplateToDraft(vehicleDraft, 'apparel')

    expect(apparelDraft.templateCode).toBe('apparel')
    expect(apparelDraft.name).toBe('Phụ kiện mẫu')
    expect(apparelDraft.sections.some((section) => section.id.startsWith('tpl_vehicle_fit_'))).toBe(false)
    expect(apparelDraft.sections.some((section) => section.id.startsWith('tpl_apparel_'))).toBe(true)
    expect(apparelDraft.sections).toContainEqual(customSection)
  })
})
