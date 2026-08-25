import { describe, expect, it } from 'vitest'

import {
  isCompatibleVehicleMention,
  normalizeAnnotationVehicleMentions,
} from './lib/vf-visual-annotation-normalize.mjs'

describe('VF visual annotation vehicle normalization', () => {
  it('repairs a cloned VF MPV 7 mention for a VF 3 occurrence', () => {
    const result = normalizeAnnotationVehicleMentions(
      'Màn hình trên xe VinFast VF MPV 7.',
      ['VF 3'],
    )
    expect(result).toMatchObject({ changed: true, reason: 'MODEL_MENTION_RECONCILED' })
    expect(result.summary).toBe('Màn hình trên xe VinFast VF 3.')
  })

  it('accepts a base model mention for a year-qualified document model', () => {
    expect(isCompatibleVehicleMention('VF 8', 'VF 8 - MY26')).toBe(true)
    const result = normalizeAnnotationVehicleMentions('Sơ đồ xe VF 8.', ['VF 8 - MY26'])
    expect(result.changed).toBe(false)
  })

  it('does not rewrite when packet applicability contains multiple models', () => {
    const result = normalizeAnnotationVehicleMentions('Sơ đồ xe VF 8.', ['VF 8', 'VF 9'])
    expect(result).toMatchObject({ changed: false, reason: 'AMBIGUOUS_EXPECTED_MODELS' })
  })
})
