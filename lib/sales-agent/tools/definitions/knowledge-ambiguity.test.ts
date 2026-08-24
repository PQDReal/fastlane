import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdmin: vi.fn(() => ({})),
}))
vi.mock('../../knowledge/retrieval/retrieval-service', () => ({
  HybridHierarchicalRetrievalService: class {
    async retrieve() {
      return {
        status: 'SUCCESS',
        items: [
          {
            title: 'Sổ tay VF 9 2025',
            sectionTitle: 'Kết nối Wi-Fi',
            content: 'Chọn Cài đặt rồi chọn Wi-Fi.',
            scopeMetadata: [{ vehicleModel: 'VF 9', modelYearFrom: 2025, modelYearTo: 2025, market: 'VN' }],
          },
          {
            title: 'Sổ tay VF 9 2026',
            sectionTitle: 'Kết nối Wi-Fi',
            content: 'Mở Cài đặt kết nối rồi chọn Wi-Fi.',
            scopeMetadata: [{ vehicleModel: 'VF 9', modelYearFrom: 2026, modelYearTo: 2026, market: 'VN' }],
          },
        ],
      }
    }
  },
}))

import { executeDataTool } from './index'

describe('search_knowledge ambiguity contract', () => {
  it('returns NEEDS_INPUT instead of mixing manual years', async () => {
    const result = await executeDataTool('search_knowledge', {
      query: 'Cách kết nối Wi-Fi VF 9',
      vehicleModel: 'VF 9',
    }, 'call-knowledge-ambiguity')

    expect(result.outcome).toBe('NEEDS_INPUT')
    expect(result.evidence).toEqual([])
    expect(result.issues[0]).toMatchObject({
      code: 'AMBIGUOUS_REFERENCE',
      field: 'modelYear',
    })
    expect(result.data.question).toContain('VF 9 2025')
    expect(result.data.question).toContain('VF 9 2026')
  })
})
