import { describe, expect, it } from 'vitest'

import { detectKnowledgeAmbiguity } from './ambiguity'

function item(vehicleModel: string, modelYear: number) {
  return {
    scopeMetadata: [{
      vehicleModel,
      modelYearFrom: modelYear,
      modelYearTo: modelYear,
      market: 'VN',
    }],
  } as any
}

describe('knowledge ambiguity detection', () => {
  it('asks for the vehicle model when retrieved documents span models', () => {
    const ambiguity = detectKnowledgeAmbiguity(
      [item('VF 8', 2025), item('VF 9', 2025)],
      {},
    )

    expect(ambiguity).toMatchObject({ field: 'vehicleModel' })
    expect(ambiguity?.question).toContain('VF 8')
    expect(ambiguity?.question).toContain('VF 9')
  })

  it('asks for the model year when one vehicle has multiple manual variants', () => {
    const ambiguity = detectKnowledgeAmbiguity(
      [item('VF 9', 2025), item('VF 9', 2026)],
      { vehicleModel: 'VF 9' },
    )

    expect(ambiguity).toMatchObject({ field: 'modelYear' })
    expect(ambiguity?.question).toContain('VF 9 2025')
    expect(ambiguity?.question).toContain('VF 9 2026')
  })

  it('does not ask again when the model year is already known', () => {
    expect(detectKnowledgeAmbiguity(
      [item('VF 9', 2025), item('VF 9', 2026)],
      { vehicleModel: 'VF 9', modelYear: 2026 },
    )).toBeNull()
  })
})
