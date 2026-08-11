import { describe, expect, it } from 'vitest'

import {
  AdminAccessoryTemplateValidationError,
  parseAccessoryTemplateDefinition,
  parseAccessoryTemplateWriteInput,
} from './admin-accessory-template-validation'

const definition = {
  schema: 'accessory_template_v1',
  suggestedCategorySlugs: ['phu-kien-o-to-dien'],
  suggestedOptionCodes: ['color'],
  sections: [{
    key: 'specifications',
    type: 'TECHNICAL_SPECS',
    title: 'Thông số sản phẩm',
    attributes: ['Vật liệu'],
  }],
}

describe('admin accessory template validation', () => {
  it('normalizes legacy string attributes into reusable definitions', () => {
    expect(parseAccessoryTemplateDefinition(definition)).toMatchObject({
      schema: 'accessory_template_v1',
      sections: [{ attributes: [{ key: 'attribute_1', label: 'Vật liệu', defaultValue: '' }] }],
    })
  })

  it('accepts a complete template write input', () => {
    expect(parseAccessoryTemplateWriteInput({
      code: 'film-cach-nhiet',
      name: 'Film cách nhiệt',
      definition,
    })).toMatchObject({ code: 'film-cach-nhiet', name: 'Film cách nhiệt', isActive: true })
  })

  it('rejects duplicate section keys and unsupported display types', () => {
    expect(() => parseAccessoryTemplateDefinition({
      ...definition,
      sections: [definition.sections[0], definition.sections[0]],
    })).toThrowError(expect.objectContaining<Partial<AdminAccessoryTemplateValidationError>>({ code: 'DUPLICATE' }))
    expect(() => parseAccessoryTemplateDefinition({
      ...definition,
      optionGroups: [{ key: 'size', code: 'size', name: 'Kích thước', displayType: 'RADIO' }],
    })).toThrowError(expect.objectContaining<Partial<AdminAccessoryTemplateValidationError>>({ code: 'DISPLAY_TYPE_UNSUPPORTED' }))
  })
})
