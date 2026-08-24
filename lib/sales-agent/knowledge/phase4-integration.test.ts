import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdmin: vi.fn(() => ({})),
}))
vi.mock('./retrieval/retrieval-service', () => ({
  HybridHierarchicalRetrievalService: class {
    async retrieve(query: string) {
      if (!query || query.trim().length === 0) {
        return {
          status: 'NO_MATCH',
          query,
          filters: {},
          retrievalMode: 'HYBRID_HIERARCHICAL',
          items: [],
          totalFound: 0,
          telemetry: { epoch: 1, indexGenerationId: 'gen-1' },
        }
      }
      return {
        status: 'SUCCESS',
        query,
        filters: {},
        retrievalMode: 'HYBRID_HIERARCHICAL',
        items: [
          {
            chunkId: 'chunk-mock-1',
            documentId: 'doc-mock-1',
            documentKey: 'chinh-sach-bao-hanh-pin',
            knowledgeVersionId: 'ver-1',
            versionNo: 2,
            indexGenerationId: 'gen-1',
            chunkLevel: 3,
            hierarchyPath: '01_pin',
            sectionAnchor: 'thoi_han_bao_hanh_pin',
            title: 'Chính sách bảo hành pin VinFast',
            sectionTitle: 'Thời hạn bảo hành pin ô tô điện',
            category: 'WARRANTY_BATTERY',
            content: 'Pin cao áp ô tô điện được bảo hành chính hãng 10 năm không giới hạn km.',
            excerpt: 'Pin cao áp ô tô điện được bảo hành chính hãng 10 năm không giới hạn km.',
            tokenCount: 15,
            tags: ['VF 8', 'Bảo hành pin'],
            citationId: 'cite:chinh-sach-bao-hanh-pin:v2:thoi_han_bao_hanh_pin',
            imageRefs: [],
            effectiveFrom: '2025-01-01T00:00:00Z',
            effectiveTo: null,
            dataAsOf: '2026-08-19T00:00:00Z',
            rrfScore: 0.03,
            retrievalMode: 'HYBRID_HIERARCHICAL',
            evidenceRef: 'ev:chunk-mock-1:v2',
            expansionProvenance: 'DIRECT',
          },
        ],
        totalFound: 1,
        telemetry: { epoch: 1, indexGenerationId: 'gen-1' },
      }
    }
  },
}))
import { EvidenceLedger } from '../orchestrator/ledgers/evidence'
import { KnownEntityLedger } from '../orchestrator/ledgers/known-entities'
import { composeTurnResponse } from '../response/composer'
import { validateCitationPointer, generateCitationId } from './retrieval/citation-ledger'
import { executeDataTool } from '../tools/definitions/index'

describe('Phase P4 — Knowledge Admin & Agent Citation Integration (A19-KR-400..410)', () => {
  it('validates and rejects malformed citation pointers (A19-KR-307/408)', () => {
    const validCitation = 'cite:vinfast:VF8:2025:vi-VN:v1:section_1:node_123'
    expect(validateCitationPointer(validCitation)).toBe(true)

    const validPolicyCitation = 'cite:policy_warranty_v2:v1:dieu_khoan_pin'
    expect(validateCitationPointer(validPolicyCitation)).toBe(true)

    expect(validateCitationPointer('')).toBe(false)
    expect(validateCitationPointer('random_string')).toBe(false)
    expect(validateCitationPointer('cite:invalid')).toBe(false)
  })

  it('executes search_knowledge data tool and attaches citation pointers to evidence facts (A19-KR-407)', async () => {
    const toolCallId = 'tc-know-123'
    const result = await executeDataTool(
      'search_knowledge',
      { query: 'bảo hành pin', topK: 3 },
      toolCallId
    )

    expect(result.tool).toBe('search_knowledge')
    expect(result.toolCallId).toBe(toolCallId)
    expect(result.schemaVersion).toBe('2.0')
    expect(result.outcome).toBe('SUCCESS')

    // Evidence checks
    expect(result.evidence.length).toBeGreaterThan(0)
    const firstEv = result.evidence[0]
    expect(firstEv.entity.kind).toBe('KNOWLEDGE_SNIPPET')

    const citationFact = firstEv.facts.find((f) => f.factPath === 'citationId')
    expect(citationFact).toBeDefined()
    expect(validateCitationPointer(citationFact!.valueHash)).toBe(true)

    // Observation checks
    expect(result.observation?.outcome).toBe('SUCCESS')
    expect(result.observation?.toolCallId).toBe(toolCallId)
  })

  it('materializes citation FACT_SUMMARY block in TurnViewModel when knowledge evidence is present (A19-KR-408)', () => {
    const evidence = new EvidenceLedger()
    const knownEntities = new KnownEntityLedger()
    const readAt = new Date().toISOString()
    const citationId = generateCitationId({
      documentKey: 'vinfast:VF8:2025:vi-VN',
      versionNo: 1,
      sectionAnchor: 'section_pin',
      sourceNodeId: 'node_456',
    })

    evidence.recordEvidence([
      {
        evidenceId: 'ev-kb-chunk-123',
        source: { system: 'SUPABASE', resource: 'knowledge_chunks' },
        entity: { kind: 'KNOWLEDGE_SNIPPET', id: 'chunk-123' },
        facts: [
          { factRef: 'fact-kb-title-chunk-123', factPath: 'title', valueHash: 'Sổ tay hướng dẫn VF 8 (2025)' },
          { factRef: 'fact-kb-section-chunk-123', factPath: 'section', valueHash: 'Hướng dẫn sử dụng và bảo quản Pin' },
          { factRef: 'fact-kb-content-chunk-123', factPath: 'content', valueHash: 'Pin được bảo hành 10 năm không giới hạn km.' },
          { factRef: 'fact-kb-citation-chunk-123', factPath: 'citationId', valueHash: citationId },
        ],
        readAt,
      },
    ])

    const rawPlan = {
      schemaVersion: '2.0',
      outcome: 'ANSWER',
      narrative: [
        {
          kind: 'ADVICE',
          markdown: 'Pin cao áp trên VinFast VF 8 được bảo hành chính hãng 10 năm.',
        },
      ],
      views: [],
      suggestionIntents: [],
      actionIntents: [],
    }

    const viewModel = composeTurnResponse({
      rawPlan,
      evidence,
      knownEntities,
      conversationRef: 'conv-test-1',
      turnId: 'turn-test-1',
      messageId: 'msg-test-1',
    })

    expect(viewModel.answer.markdown).toContain('10 năm')
    expect(viewModel.blocks.length).toBe(1)
    expect(viewModel.blocks[0].kind).toBe('FACT_SUMMARY')
    if (viewModel.blocks[0].kind === 'FACT_SUMMARY') {
      expect(viewModel.blocks[0].facts[0].label).toContain('Nguồn tham chiếu [1]')
      expect(viewModel.blocks[0].facts[0].value).toContain('VF 8')
    }
  })

  it('handles search_knowledge empty query gracefully with NO_MATCH (A19-KR-308)', async () => {
    const toolCallId = 'tc-empty-1'
    const result = await executeDataTool(
      'search_knowledge',
      { query: '', topK: 3 },
      toolCallId
    )

    expect(result.tool).toBe('search_knowledge')
    expect(result.outcome).toBe('NO_MATCH')
    expect(result.evidence).toEqual([])
  })
})
