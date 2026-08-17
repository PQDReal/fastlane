import { describe, expect, it } from 'vitest'

import {
  DEFAULT_MOTORBIKE_SPEC_FIELDS,
  mergeVehicleSpecFields,
  normalizeMotorbikeSpecFields,
} from './vehicle-specifications'

describe('vehicle specification configuration', () => {
  it('keeps the motorbike default structure while allowing backend values to be added', () => {
    const fields = mergeVehicleSpecFields(
      normalizeMotorbikeSpecFields(undefined),
      { 'Công suất danh định': '3 kW', 'Mô tả pin mới': 'LFP' },
      'Kích thước & Tiện ích',
      DEFAULT_MOTORBIKE_SPEC_FIELDS,
    )

    expect(fields.find((field) => field.key === 'Công suất danh định')?.section).toBe('Vận hành & Pin')
    expect(fields.find((field) => field.key === 'Mô tả pin mới')?.section).toBe('Kích thước & Tiện ích')
  })

  it('removes custom fields that no longer exist in the backend payload', () => {
    const fields = mergeVehicleSpecFields(
      [
        ...DEFAULT_MOTORBIKE_SPEC_FIELDS,
        { key: 'Thông số đã xóa', label: 'Thông số đã xóa', section: 'Kích thước & Tiện ích', visible: true },
      ],
      { 'Công suất tối đa': '3 kW' },
      'Kích thước & Tiện ích',
      DEFAULT_MOTORBIKE_SPEC_FIELDS,
    )

    expect(fields.some((field) => field.key === 'Thông số đã xóa')).toBe(false)
    expect(fields.some((field) => field.key === 'Công suất tối đa')).toBe(true)
  })

  it('does not recreate a default field explicitly removed from the backend configuration', () => {
    const fields = mergeVehicleSpecFields(
      DEFAULT_MOTORBIKE_SPEC_FIELDS.filter((field) => field.key !== 'Công suất tối đa'),
      { 'Công suất tối đa': '3 kW' },
      'Kích thước & Tiện ích',
      DEFAULT_MOTORBIKE_SPEC_FIELDS,
    )

    expect(fields.some((field) => field.key === 'Công suất tối đa')).toBe(false)
  })
})
