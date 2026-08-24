import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { buildKnowledgeScopeContext } from './scope-context'

describe('knowledge scope context', () => {
  it('does not inherit a vehicle model from assistant-authored history', () => {
    const scope = buildKnowledgeScopeContext('cách kết nối wifi', [
      { role: 'assistant', content: 'Bạn đang hỏi cách kết nối Wi-Fi trên VinFast VF 8.' },
    ])

    expect(scope.binding).toBeNull()
    expect(scope.candidateModels).toEqual([])
  })

  it('inherits the latest unambiguous user model and records its source', () => {
    const scope = buildKnowledgeScopeContext('cách sạc pin', [
      { role: 'user', content: 'Tôi đang xem VinFast VF 8.' },
      { role: 'assistant', content: 'VF 9 cũng có thể phù hợp.' },
    ])

    expect(scope.binding).toMatchObject({
      vehicleModel: 'VF 8',
      sources: { vehicleModel: 'USER_HISTORY' },
    })
    expect(scope.binding?.sourceTexts).toContain('Tôi đang xem VinFast VF 8.')
  })

  it('keeps an explicit current model and year as the strongest scope', () => {
    const scope = buildKnowledgeScopeContext('Thông số VinFast VF 8 đời 2025', [
      { role: 'user', content: 'VF 9' },
    ])

    expect(scope.binding).toMatchObject({
      vehicleModel: 'VF 8',
      modelYear: 2025,
      sources: { vehicleModel: 'CURRENT_USER', modelYear: 'CURRENT_USER' },
    })
  })

  it('canonicalizes catalog aliases without turning one product name into two models', () => {
    const scope = buildKnowledgeScopeContext('Thông số VF 5 Plus', [])

    expect(scope.binding?.vehicleModel).toBe('VF 5 Plus')
    expect(scope.candidateModels).toEqual(['VF 5 Plus'])
  })

  it('leaves neutral how-to queries unbound with empty history', () => {
    const scope = buildKnowledgeScopeContext('cách kết nối wifi, minh họa', [])
    expect(scope.binding).toBeNull()
    expect(scope.candidateModels).toEqual([])
    expect(scope.candidateYears).toEqual([])
  })

  it('overrides prior user model when current user specifies a different model', () => {
    const scope = buildKnowledgeScopeContext('Tôi muốn chuyển sang xem VF 3', [
      { role: 'user', content: 'Tư vấn xe VF 8' },
      { role: 'assistant', content: 'VF 8 có giá từ 1.090.000.000 VNĐ' },
    ])
    expect(scope.binding).toMatchObject({
      vehicleModel: 'VF 3',
      sources: { vehicleModel: 'CURRENT_USER' },
    })
    expect(scope.candidateModels).toEqual(['VF 3'])
  })

  it('resolves electric bike aliases accurately', () => {
    const evoScope = buildKnowledgeScopeContext('Thông số xe máy Evo 200', [])
    expect(evoScope.binding?.vehicleModel).toBe('Evo 200')

    const felizScope = buildKnowledgeScopeContext('Giá xe Feliz S', [])
    expect(felizScope.binding?.vehicleModel).toBe('Feliz S')

    const klaraScope = buildKnowledgeScopeContext('Bảo hành pin Klara S', [])
    expect(klaraScope.binding?.vehicleModel).toBe('Klara S')
  })

  it('handles spacing and case variants of VF codes', () => {
    const compactScope = buildKnowledgeScopeContext('Hướng dẫn sử dụng vf8 đời 2024', [])
    expect(compactScope.binding).toMatchObject({
      vehicleModel: 'VF 8',
      modelYear: 2024,
      sources: { vehicleModel: 'CURRENT_USER', modelYear: 'CURRENT_USER' },
    })
  })
})

