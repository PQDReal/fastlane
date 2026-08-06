import { describe, expect, it } from 'vitest'

import {
  DEPOSIT_DRAFT_VERSION,
  DepositDraftValidationError,
  parseDepositDraft,
} from '@/lib/deposit/draft'

const validDraft = {
  version: DEPOSIT_DRAFT_VERSION,
  currentStep: 2,
  vehicleType: 'motorbike',
  selectedCarId: 'Evo',
  selectedVariant: 'Evo Kèm pin',
  selectedColor: 'Đỏ tươi',
  selectedInteriorColor: '',
  selectedPackages: ['package-a'],
  customerType: 'personal',
  formData: {
    name: 'Phạm Quang Dũng',
    phone: '0901234567',
    email: 'dung@example.com',
    idCard: '012345678901',
    taxId: '0100109106',
    companyName: '',
    province: 'Thành phố Hà Nội',
    ward: 'Phường Hoàn Kiếm',
  },
  provinceCode: '01',
  wardCode: '00001',
  selectedShowroomId: 'showroom-1',
  promotionCode: 'FASTLANE',
}

describe('deposit draft validation', () => {
  it('accepts and bounds the supported draft contract', () => {
    expect(parseDepositDraft(validDraft)).toEqual(validDraft)
  })

  it('rejects unsupported steps and oversized sensitive fields', () => {
    expect(() => parseDepositDraft({ ...validDraft, currentStep: 4 })).toThrow(
      DepositDraftValidationError,
    )
    expect(() => parseDepositDraft({
      ...validDraft,
      formData: { ...validDraft.formData, idCard: '1'.repeat(21) },
    })).toThrow(DepositDraftValidationError)
  })

  it('keeps personal identity and corporate tax identifiers independent', () => {
    const parsed = parseDepositDraft(validDraft)

    expect(parsed.formData.idCard).toBe('012345678901')
    expect(parsed.formData.taxId).toBe('0100109106')
  })

  it('restores legacy drafts without copying the personal identity into taxId', () => {
    const { taxId: _taxId, ...legacyFormData } = validDraft.formData
    const parsed = parseDepositDraft({ ...validDraft, formData: legacyFormData })

    expect(parsed.formData.idCard).toBe('012345678901')
    expect(parsed.formData.taxId).toBe('')
  })
})
