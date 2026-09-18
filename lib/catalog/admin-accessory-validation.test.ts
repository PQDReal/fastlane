import { describe, expect, it } from 'vitest'

import {
  buildVariantMatrix,
  createAdminAccessoryDraft,
  type DraftOptionGroup,
} from '@/lib/catalog/admin-accessory-draft'
import { validateAdminAccessoryDraft } from '@/lib/catalog/admin-accessory-validation'

function value(id: string, code = id) {
  return { id, code, name: id, colorHex: '', swatchUrl: '' }
}

function variantGroup(overrides: Partial<DraftOptionGroup> = {}): DraftOptionGroup {
  return {
    id: 'color', presetCode: 'color', code: 'color', name: 'Màu sắc',
    displayType: 'SWATCH', minimumSelections: 1, maximumSelections: 1,
    values: [value('blue')],
    ...overrides,
  }
}

describe('admin accessory draft validation', () => {
  it('accepts a complete variant draft', () => {
    const draft = createAdminAccessoryDraft()
    draft.optionGroups = [variantGroup()]
    draft.variants = buildVariantMatrix(draft.optionGroups, draft.variants).map((variant) => ({
      ...variant, sku: 'ACC-BLUE', originalPrice: '100000', imageUrls: ['https://cdn.example.com/blue.webp'],
    }))

    expect(validateAdminAccessoryDraft(draft).filter((issue) => issue.severity === 'error')).toEqual([])
  })

  it('requires a direct image on every sellable SKU', () => {
    const draft = createAdminAccessoryDraft()
    draft.optionGroups = [variantGroup({ values: [value('blue'), value('red')] })]
    draft.variants = buildVariantMatrix(draft.optionGroups, draft.variants).map((variant, index) => ({
      ...variant,
      sku: `ACC-${index + 1}`,
      originalPrice: '100000',
      imageUrls: index === 0 ? ['https://cdn.example.com/blue.webp'] : [''],
    }))

    let issues = validateAdminAccessoryDraft(draft)
    expect(issues.filter((issue) => issue.code === 'VARIANT_MEDIA_REQUIRED')).toHaveLength(1)
    draft.variants = draft.variants.map((variant) => variant.selections.color === 'red'
      ? { ...variant, imageUrls: ['https://cdn.example.com/red-sku.webp'] }
      : variant)
    issues = validateAdminAccessoryDraft(draft)
    expect(issues.filter((issue) => issue.code === 'VARIANT_MEDIA_REQUIRED')).toEqual([])
  })

  it('allows an excluded SKU to omit direct media', () => {
    const draft = createAdminAccessoryDraft()
    draft.variants[0] = { ...draft.variants[0], isIncluded: false }
    expect(validateAdminAccessoryDraft(draft).map((issue) => issue.code)).not.toContain('VARIANT_MEDIA_REQUIRED')
  })

  it('reports duplicate group, value and signature codes', () => {
    const draft = createAdminAccessoryDraft()
    draft.optionGroups = [
      variantGroup({ values: [value('one', 'same'), value('two', 'same')] }),
      variantGroup({ id: 'other', code: 'color', values: [value('other')] }),
    ]
    draft.variants = [
      { ...draft.variants[0], id: 'one', sku: 'DUP', originalPrice: '100', selections: { color: 'one', other: 'other' } },
      { ...draft.variants[0], id: 'two', sku: 'dup', originalPrice: '100', selections: { color: 'one', other: 'other' } },
    ]

    const codes = validateAdminAccessoryDraft(draft).map((issue) => issue.code)
    expect(codes).toContain('OPTION_GROUP_CODE_DUPLICATE')
    expect(codes).toContain('OPTION_VALUE_CODE_DUPLICATE')
    expect(codes).toContain('VARIANT_SIGNATURE_DUPLICATE')
  })

  it('does not require commercial fields for an excluded combination', () => {
    const draft = createAdminAccessoryDraft()
    draft.variants = [{ ...draft.variants[0], isIncluded: false }]
    const issues = validateAdminAccessoryDraft(draft)
    expect(issues.some((issue) => issue.code === 'ACTIVE_VARIANT_REQUIRED')).toBe(true)
  })

  it('enforces the current database single-selection limit', () => {
    const draft = createAdminAccessoryDraft()
    draft.variants[0] = { ...draft.variants[0], sku: 'BASE', originalPrice: '100000' }
    draft.optionGroups = [{
      id: 'package', presetCode: 'package', code: 'package', name: 'Phiên bản',
      displayType: 'BUTTON', minimumSelections: 2, maximumSelections: 3,
      values: [value('premium')],
    }]

    const codes = validateAdminAccessoryDraft(draft).map((issue) => issue.code)
    expect(codes).toContain('OPTION_VALUES_COUNT_INVALID')
    expect(codes).toContain('VARIANT_GROUP_MAXIMUM_INVALID')
  })

  it('warns for a large matrix and blocks an excessive one', () => {
    const draft = createAdminAccessoryDraft()
    const values = Array.from({ length: 10 }, (_, index) => value(`v${index}`))
    draft.optionGroups = [
      variantGroup({ id: 'a', code: 'a', values }),
      variantGroup({ id: 'b', code: 'b', values }),
    ]
    expect(validateAdminAccessoryDraft(draft).map((issue) => issue.code)).toContain('VARIANT_MATRIX_LARGE')

    draft.optionGroups.push(variantGroup({ id: 'c', code: 'c', values }))
    expect(validateAdminAccessoryDraft(draft).map((issue) => issue.code)).toContain('VARIANT_MATRIX_TOO_LARGE')
  })
})
