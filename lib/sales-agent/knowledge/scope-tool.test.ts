import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const retrieveMock = vi.hoisted(() => vi.fn())
const scopeCatalogMock = vi.hoisted(() => ({
  status: 'EMPTY' as 'READY' | 'EMPTY' | 'UNAVAILABLE',
  entries: [] as any[],
  refreshedAt: 0,
}))

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
vi.mock('./scope-catalog', () => ({
  knowledgeScopeCatalogEngine: {
    getSnapshot: vi.fn(() => scopeCatalogMock),
    getSnapshotAsync: vi.fn(async () => scopeCatalogMock),
    getAvailableYearsForModel: vi.fn(() => []),
  },
}))
vi.mock('../core/flags', () => ({
  isSalesAgentVisualKnowledgeRetrievalEnabled: () => false,
}))

import { executeDataTool } from '../tools/definitions'
import { buildKnowledgeScopeContext } from './scope-context'

describe('search_knowledge server scope enforcement', () => {
  beforeEach(() => {
    retrieveMock.mockClear()
    scopeCatalogMock.status = 'EMPTY'
    scopeCatalogMock.entries = []
  })

  it('prefills VF 5 from the user query and asks only for the document year', async () => {
    scopeCatalogMock.status = 'READY'
    scopeCatalogMock.entries = [2023, 2024, 2025, 2026].map((year) => ({
      documentId: `vf5-${year}`,
      documentKey: `vf5-${year}`,
      vehicleModel: 'VF 5',
      modelYearFrom: year,
      modelYearTo: year,
      versionId: `v5-${year}`,
      versionNo: 1,
    }))
    const scope = buildKnowledgeScopeContext('Hướng dẫn sạc VinFast VF 5')

    const result = await executeDataTool('search_knowledge', {
      query: 'Hướng dẫn sạc VinFast VF 5',
      categories: ['TECHNICAL_GUIDE'],
    }, 'call-vf5-prefilled-scope', {
      knowledgeScope: scope.binding,
    })

    expect(scope.binding?.vehicleModel).toBe('VF 5')
    expect(result.outcome).toBe('NEEDS_INPUT')
    if (result.outcome === 'NEEDS_INPUT') {
      expect(result.data.field).toBe('modelYear')
      expect(result.data.fields[0].options).toEqual([
        expect.objectContaining({ label: 'VF 5', value: 'VF 5' }),
      ])
      expect(result.data.fields[1].options.map((option: any) => option.value))
        .toEqual(['2023', '2024', '2025', '2026'])
    }
  })

  it('asks for the vehicle line before unscoped retrieval when active knowledge spans lines', async () => {
    scopeCatalogMock.status = 'READY'
    scopeCatalogMock.entries = [
      { documentId: 'vf3', documentKey: 'vf3', vehicleModel: 'VF 3', versionId: 'v3', versionNo: 1 },
      { documentId: 'vf8', documentKey: 'vf8', vehicleModel: 'VF 8', versionId: 'v8', versionNo: 1 },
      { documentId: 'vf9', documentKey: 'vf9', vehicleModel: 'VF 9', versionId: 'v9', versionNo: 1 },
    ]

    const result = await executeDataTool('search_knowledge', {
      query: 'Cách kết nối Wi-Fi, minh họa',
    }, 'call-missing-vehicle-line')

    expect(retrieveMock).not.toHaveBeenCalled()
    expect(result.outcome).toBe('NEEDS_INPUT')
    if (result.outcome === 'NEEDS_INPUT') {
      expect(result.data.field).toBe('vehicleModel')
      expect(result.data.question).toContain('VF 3')
      expect(result.data.question).toContain('VF 8')
      expect(result.data.question).toContain('VF 9')
    }
    expect(result.diagnostics?.retrieval).toMatchObject({
      status: 'SCOPE_PREFLIGHT',
      scopeCatalogStatus: 'READY',
      scopeCatalogEntryCount: 3,
    })
  })

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

  it('recovers the full VF 5 year inventory after a cold preflight timeout', async () => {
    scopeCatalogMock.status = 'UNAVAILABLE'
    retrieveMock.mockImplementationOnce(async () => {
      scopeCatalogMock.status = 'READY'
      scopeCatalogMock.entries = [2023, 2024, 2025, 2026].map((year) => ({
        documentId: `vf5-${year}`,
        documentKey: `vf5-${year}`,
        vehicleModel: 'VF 5',
        modelYearFrom: year,
        modelYearTo: year,
        versionId: `v5-${year}`,
        versionNo: 1,
      }))
      return {
        status: 'SUCCESS',
        retrievalMode: 'HYBRID_HIERARCHICAL',
        items: [2023, 2024, 2025].map((year) => ({
          chunkId: `technical-${year}`,
          documentKey: `vf5-technical-${year}`,
          title: `Sổ tay VF 5 ${year}`,
          sectionTitle: 'Âm lượng',
          content: `Hướng dẫn VF 5 ${year}.`,
          citationId: `cite:vf5:technical:${year}`,
          evidenceRef: `ev:vf5:technical:${year}`,
          category: 'TECHNICAL_GUIDE',
          scopeMetadata: [{ vehicleModel: 'VF 5', modelYearFrom: year, modelYearTo: year }],
        })),
        totalFound: 3,
        telemetry: {},
      }
    })

    const result = await executeDataTool('search_knowledge', {
      query: 'cách chỉnh âm lượng VF 5',
      categories: ['TECHNICAL_GUIDE'],
    }, 'call-vf5-recovered-years', {
      knowledgeScope: {
        bindingId: 'scope-vf-5',
        vehicleModel: 'VF 5',
        sources: { vehicleModel: 'CURRENT_USER' },
        sourceTexts: ['VF 5'],
      },
    })

    expect(result.outcome).toBe('NEEDS_INPUT')
    if (result.outcome === 'NEEDS_INPUT') {
      expect(result.data.fields[1].options.map((option: any) => option.value)).toEqual(['2023', '2024', '2025', '2026'])
    }
    expect(result.diagnostics?.retrieval).toMatchObject({
      scopePreflightStatus: 'READY',
      scopePreflightRecovered: true,
    })
  })

  it('auto-binds a catalog singleton model and year without asking for scope', async () => {
    scopeCatalogMock.status = 'READY'
    scopeCatalogMock.entries = [
      { documentId: 'vf5', documentKey: 'vf5-2026', vehicleModel: 'VF 5', modelYearFrom: 2026, modelYearTo: 2026, versionId: 'v5', versionNo: 1 },
    ]
    retrieveMock.mockResolvedValueOnce({
      status: 'SUCCESS',
      retrievalMode: 'HYBRID_HIERARCHICAL',
      items: [{
        chunkId: 'vf5-wifi',
        documentKey: 'vf5-2026',
        title: 'Sá»• tay VF 5 2026',
        sectionTitle: 'Káº¿t ná»‘i Wi-Fi',
        content: 'HÆ°á»›ng dáº«n VF 5 2026.',
        citationId: 'cite:vf5:2026',
        evidenceRef: 'ev:vf5:2026',
        category: 'TECHNICAL_GUIDE',
        scopeMetadata: [{ vehicleModel: 'VF 5', modelYearFrom: 2026, modelYearTo: 2026 }],
      }],
      totalFound: 1,
      telemetry: {},
    })

    const result = await executeDataTool('search_knowledge', {
      query: 'cÃ¡ch káº¿t ná»‘i wifi',
    }, 'call-catalog-singleton')

    expect(result.outcome).toBe('SUCCESS')
    expect(retrieveMock.mock.calls[0][1]).toMatchObject({ vehicleModel: 'VF 5', modelYear: 2026 })
    expect(result.appliedBindings).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: 'vehicleModel', value: 'VF 5' }),
      expect.objectContaining({ field: 'modelYear', value: 2026 }),
    ]))
  })

  it('asks for the year with a one-model multi-year technical catalog', async () => {
    scopeCatalogMock.status = 'READY'
    scopeCatalogMock.entries = [
      { documentId: 'vf5-2025', documentKey: 'vf5-2025', vehicleModel: 'VF 5', modelYearFrom: 2025, modelYearTo: 2025, versionId: 'v5-2025', versionNo: 1 },
      { documentId: 'vf5-2026', documentKey: 'vf5-2026', vehicleModel: 'VF 5', modelYearFrom: 2026, modelYearTo: 2026, versionId: 'v5-2026', versionNo: 1 },
    ]

    const result = await executeDataTool('search_knowledge', {
      query: 'cÃ¡ch káº¿t ná»‘i wifi',
    }, 'call-catalog-multi-year')

    expect(retrieveMock).not.toHaveBeenCalled()
    expect(result.outcome).toBe('NEEDS_INPUT')
    if (result.outcome === 'NEEDS_INPUT') {
      expect(result.data.fields).toHaveLength(2)
      expect(result.data.fields[1].field).toBe('modelYear')
    }
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
