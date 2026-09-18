import { describe, expect, it } from 'vitest'
import { buildSuggestionCandidates, rankSuggestionCandidates } from './candidates'

describe('suggestion candidate pipeline', () => {
  it('uses verified catalog entities for comparison instead of fixed model pairs', () => {
    const candidates = buildSuggestionCandidates({
      knownProducts: [],
      catalogProducts: [
        { id: 'vf3', name: 'VinFast VF 3', productType: 'CAR' },
        { id: 'vf6', name: 'VinFast VF 6', productType: 'CAR' },
      ],
      isClarificationTurn: false,
      isComparisonTurn: false,
    })

    const ranked = rankSuggestionCandidates(candidates)
    expect(ranked.map((item) => item.label)).toEqual([
      'Giá VinFast VF 3',
      'So sánh VinFast VF 3 và VinFast VF 6',
      'Thông số VinFast VF 3',
    ])
    expect(ranked[1].entityIds).toEqual(['vf3', 'vf6'])
  })

  it('does not invent a model pair when catalog evidence is unavailable', () => {
    const ranked = rankSuggestionCandidates(buildSuggestionCandidates({
      knownProducts: [],
      catalogProducts: [],
      isClarificationTurn: true,
      isComparisonTurn: false,
    }))

    expect(ranked.map((item) => item.label)).toEqual(['Chọn hai mẫu xe để so sánh'])
    expect(ranked.some((item) => /VF\s*8|VF\s*9/i.test(item.label))).toBe(false)
  })

  it('includes policy suggestion when structured warranty/battery flag is enabled', () => {
    const candidates = buildSuggestionCandidates({
      knownProducts: [],
      catalogProducts: [{ id: 'vf3', name: 'VF 3', productType: 'CAR' }],
      isClarificationTurn: false,
      isComparisonTurn: false,
      hasWarrantyOrBatteryPolicy: true,
    })
    expect(candidates.some((c) => c.kind === 'KNOWLEDGE_POLICY')).toBe(true)
  })

  it('deduplicates candidates and caps the final list at three', () => {
    const ranked = rankSuggestionCandidates([
      { kind: 'FOLLOW_UP', label: 'A', payload: 'A', source: 'SAFE_DEFAULT', score: 1 },
      { kind: 'FOLLOW_UP', label: 'A', payload: 'A', source: 'SAFE_DEFAULT', score: 2 },
      { kind: 'FOLLOW_UP', label: 'B', payload: 'B', source: 'SAFE_DEFAULT', score: 3 },
      { kind: 'FOLLOW_UP', label: 'C', payload: 'C', source: 'SAFE_DEFAULT', score: 4 },
      { kind: 'FOLLOW_UP', label: 'D', payload: 'D', source: 'SAFE_DEFAULT', score: 5 },
    ])

    expect(ranked).toHaveLength(3)
    expect(ranked.map((item) => item.label)).toEqual(['D', 'C', 'B'])
  })
})
