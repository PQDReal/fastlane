import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const retrieveMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdmin: vi.fn(() => ({})),
}))
vi.mock('./retrieval/retrieval-service', () => ({
  HybridHierarchicalRetrievalService: class {
    retrieve(...args: unknown[]) {
      return retrieveMock(...args)
    }
  },
}))
vi.mock('../core/flags', () => ({
  isSalesAgentVisualKnowledgeRetrievalEnabled: () => false,
}))

import { executeDataTool } from '../tools/definitions'

describe('search_knowledge server scope enforcement', () => {
  beforeEach(() => retrieveMock.mockClear())

  it('ignores model-provided scope fields when no server binding exists', async () => {
    retrieveMock.mockResolvedValueOnce({
      status: 'NO_MATCH',
      retrievalMode: 'HYBRID_HIERARCHICAL',
      items: [],
      totalFound: 0,
      telemetry: {},
    })

    const result = await executeDataTool('search_knowledge', {
      query: 'cách sạc pin',
      vehicleModel: 'VF 8',
      modelYear: 2025,
    }, 'call-untrusted-scope')

    expect(retrieveMock.mock.calls[0][1]).toEqual({})
    expect(retrieveMock.mock.calls[0][1]).not.toHaveProperty('vehicleModel')
    expect(retrieveMock.mock.calls[0][1]).not.toHaveProperty('modelYear')
    expect(result.diagnostics?.scope?.ignoredRawFields).toEqual(['vehicleModel', 'modelYear'])
  })

  it('applies only the server binding and exposes its provenance', async () => {
    retrieveMock.mockResolvedValueOnce({
      status: 'NO_MATCH',
      retrievalMode: 'HYBRID_HIERARCHICAL',
      items: [],
      totalFound: 0,
      telemetry: {},
    })

    const result = await executeDataTool('search_knowledge', {
      query: 'cách sạc pin',
      vehicleModel: 'VF 9',
    }, 'call-trusted-scope', {
      knowledgeScope: {
        bindingId: 'scope-vf-8',
        vehicleModel: 'VF 8',
        sources: { vehicleModel: 'CURRENT_USER' },
        sourceTexts: ['Tôi hỏi VF 8'],
      },
    })

    expect(retrieveMock.mock.calls[0][1]).toMatchObject({ vehicleModel: 'VF 8' })
    expect(retrieveMock.mock.calls[0][1]).not.toHaveProperty('modelYear')
    expect(result.appliedBindings).toContainEqual({
      field: 'vehicleModel',
      value: 'VF 8',
      authority: 'ENFORCED',
      provenance: { kind: 'SERVER_RESOLVED', id: 'scope-vf-8' },
    })
    expect(result.diagnostics?.scope?.ignoredRawFields).toEqual(['vehicleModel'])
  })

  it('auto-binds singleton year when one model is known and only one year scope exists in retrieval', async () => {
    retrieveMock.mockResolvedValueOnce({
      status: 'SUCCESS',
      retrievalMode: 'HYBRID_HIERARCHICAL',
      items: [{
        chunkId: 'chunk-2026',
        documentKey: 'vf8-2026',
        title: 'Sổ tay VF 8 2026',
        sectionTitle: 'Kết nối Wi-Fi',
        content: 'Hướng dẫn VF 8 2026.',
        citationId: 'cite:vf8:2026',
        evidenceRef: 'ev:vf8:2026',
        category: 'TECHNICAL_GUIDE',
        scopeMetadata: [{ vehicleModel: 'VF 8', modelYearFrom: 2026, modelYearTo: 2026 }],
      }],
      totalFound: 1,
      telemetry: {},
    })

    const result = await executeDataTool('search_knowledge', {
      query: 'hướng dẫn kết nối wifi VF 8',
    }, 'call-singleton-year', {
      knowledgeScope: {
        bindingId: 'scope-vf-8',
        vehicleModel: 'VF 8',
        sources: { vehicleModel: 'CURRENT_USER' },
        sourceTexts: ['VF 8'],
      },
    })

    expect(result.outcome).toBe('SUCCESS')
    expect(result.diagnostics?.scope).toMatchObject({
      defaultedModelYear: 2026,
      yearPolicy: 'ONLY_AVAILABLE',
    })
    if (result.outcome === 'SUCCESS') {
      expect(result.data.snippets).toHaveLength(1)
      expect(result.data.snippets[0].title).toContain('2026')
    }
  })

  it('keeps divergent technical knowledge ambiguous when no year is requested', async () => {
    retrieveMock.mockResolvedValueOnce({
      status: 'SUCCESS',
      retrievalMode: 'HYBRID_HIERARCHICAL',
      items: [2025, 2026].map((year) => ({
        chunkId: `technical-${year}`,
        documentKey: `vf8-technical-${year}`,
        title: `Sổ tay VF 8 ${year}`,
        sectionTitle: 'Kết nối Wi-Fi',
        content: `Hướng dẫn VF 8 ${year}.`,
        citationId: `cite:vf8:technical:${year}`,
        evidenceRef: `ev:vf8:technical:${year}`,
        category: 'TECHNICAL_GUIDE',
        scopeMetadata: [{ vehicleModel: 'VF 8', modelYearFrom: year, modelYearTo: year }],
      })),
      totalFound: 2,
      telemetry: {},
    })

    const result = await executeDataTool('search_knowledge', {
      query: 'cách kết nối wifi',
      vehicleModel: 'VF 8',
    }, 'call-technical-year', {
      knowledgeScope: {
        bindingId: 'scope-vf-8',
        vehicleModel: 'VF 8',
        sources: { vehicleModel: 'CURRENT_USER' },
        sourceTexts: ['VF 8'],
      },
    })

    expect(result.outcome).toBe('NEEDS_INPUT')
    expect(result.issues[0]).toMatchObject({ field: 'modelYear' })
  })

  it('does not answer from a model-specific result when the user never named a model', async () => {
    retrieveMock.mockResolvedValueOnce({
      status: 'SUCCESS',
      retrievalMode: 'HYBRID_HIERARCHICAL',
      items: [{
        chunkId: 'chunk-invented-model',
        documentKey: 'vf8-wifi',
        title: 'Sổ tay VF 8',
        sectionTitle: 'Kết nối Wi-Fi',
        content: 'Hướng dẫn dành cho VF 8.',
        citationId: 'cite:vf8:wifi',
        evidenceRef: 'ev:vf8:wifi',
        category: 'TECHNICAL_GUIDE',
        scopeMetadata: [{ vehicleModel: 'VF 8', modelYearFrom: 2025, modelYearTo: 2025 }],
      }],
      totalFound: 1,
      telemetry: {},
    })

    const result = await executeDataTool('search_knowledge', {
      query: 'cách kết nối wifi trên VF 8',
    }, 'call-invented-model')

    expect(result.outcome).toBe('NEEDS_INPUT')
    if (result.outcome === 'NEEDS_INPUT') {
      expect(result.data.field).toBe('vehicleModel')
    }
  })
})
