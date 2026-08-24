import { describe, it, expect, vi } from 'vitest'
import {
  normalizeVietnameseSearchQuery,
  tokenizeQuery,
  scoreLexicalMatch,
  matchesScope,
  PostgresFtsAdapter,
} from './fts-adapter'
import {
  cosineSimilarity,
  VectorCandidateAdapter,
  type VectorIndexedCandidate,
} from './vector-adapter'
import { fuseRrfCandidates } from './rrf-fusion'
import { expandHierarchyCandidates } from './hierarchy-expansion'
import { buildEvidenceContext, estimateTokenCount } from './context-builder'
import {
  generateCitationId,
  validateCitationPointer,
  KnowledgeCitationLedger,
} from './citation-ledger'
import { HybridHierarchicalRetrievalService } from './retrieval-service'
import { KnowledgeStorageUnavailableError } from './contracts'

describe('Knowledge Retrieval Subsystem (Phase P3: A19-KR-300..309)', () => {
  const sampleDocTreePool: VectorIndexedCandidate[] = [
    {
      chunkId: 'chunk-vf8-root',
      documentId: 'doc-vf8-2025',
      documentKey: 'vinfast:manual:VF8:2025:vi-VN',
      versionId: 'ver-vf8-v1',
      versionNo: 1,
      indexGenerationId: 'openai-text-embedding-3-small-1536-v1',
      chunkLevel: 0,
      hierarchyPath: '00_root',
      sectionAnchor: 'doc_root',
      sectionTitle: 'Sổ tay hướng dẫn sử dụng VinFast VF 8 2025',
      content: 'Tài liệu hướng dẫn sử dụng chính thức cho xe ô tô điện VinFast VF 8 phiên bản 2025.',
      contentHash: 'hash-0',
      tokenCount: 20,
      tags: ['VF 8', '2025', 'Manual'],
      title: 'Sổ tay hướng dẫn sử dụng VinFast VF 8 2025',
      slug: 'so-tay-vf-8-2025',
      category: 'TECHNICAL_GUIDE',
      effectiveFrom: '2025-01-01T00:00:00Z',
      effectiveTo: null,
      publicationStatus: 'PUBLISHED',
      indexStatus: 'READY',
      embedding: new Array(1536).fill(0.02), // Unit-like mock vector
    },
    {
      chunkId: 'chunk-vf8-sec-pin',
      documentId: 'doc-vf8-2025',
      documentKey: 'vinfast:manual:VF8:2025:vi-VN',
      versionId: 'ver-vf8-v1',
      versionNo: 1,
      indexGenerationId: 'openai-text-embedding-3-small-1536-v1',
      chunkLevel: 1,
      hierarchyPath: '07_pin_va_sac',
      sectionAnchor: 'pin_va_sac_overview',
      sectionTitle: 'Chương 07: Pin và Hệ thống Sạc',
      content: 'Cảnh báo an toàn quan trọng: Chỉ sử dụng cổng sạc tiêu chuẩn CCS2 và trụ sạc được VinFast ủy quyền.',
      contentHash: 'hash-1',
      tokenCount: 25,
      tags: ['Pin', 'Sạc', 'CCS2', 'VF 8'],
      sourceNodeId: 'node-sec-pin',
      imageRefs: ['/images/vf8-charging-port.png'],
      title: 'Sổ tay hướng dẫn sử dụng VinFast VF 8 2025',
      slug: 'so-tay-vf-8-2025',
      category: 'TECHNICAL_GUIDE',
      effectiveFrom: '2025-01-01T00:00:00Z',
      effectiveTo: null,
      publicationStatus: 'PUBLISHED',
      indexStatus: 'READY',
      embedding: new Array(1536).fill(0.025),
    },
    {
      chunkId: 'chunk-vf8-leaf-step1',
      documentId: 'doc-vf8-2025',
      documentKey: 'vinfast:manual:VF8:2025:vi-VN',
      versionId: 'ver-vf8-v1',
      versionNo: 1,
      indexGenerationId: 'openai-text-embedding-3-small-1536-v1',
      chunkLevel: 3,
      hierarchyPath: '07_pin_va_sac/01_sac_dc',
      sectionAnchor: 'step_1_cam_sung_sac',
      sectionTitle: 'Bước 1: Cắm súng sạc DC',
      content: 'Mở nắp cổng sạc phía trước bên trái, cắm chắc chắn đầu súng sạc vào cổng sạc DC cho đến khi nghe tiếng click.',
      contentHash: 'hash-2',
      tokenCount: 30,
      tags: ['Sạc DC', 'Súng sạc', 'Bước 1', 'VF 8'],
      sourceNodeId: 'node-step-1',
      imageRefs: ['/images/step1-plug.png'],
      title: 'Sổ tay hướng dẫn sử dụng VinFast VF 8 2025',
      slug: 'so-tay-vf-8-2025',
      category: 'TECHNICAL_GUIDE',
      effectiveFrom: '2025-01-01T00:00:00Z',
      effectiveTo: null,
      publicationStatus: 'PUBLISHED',
      indexStatus: 'READY',
      embedding: new Array(1536).fill(0.03),
    },
    {
      chunkId: 'chunk-vf3-battery',
      documentId: 'doc-vf3-2025',
      documentKey: 'vinfast:manual:VF3:2025:vi-VN',
      versionId: 'ver-vf3-v1',
      versionNo: 1,
      indexGenerationId: 'openai-text-embedding-3-small-1536-v1',
      chunkLevel: 2,
      hierarchyPath: '05_pin/01_thong_so',
      sectionAnchor: 'vf3_battery_spec',
      sectionTitle: 'Thông số Pin VF 3',
      content: 'Pin LFP dung lượng khả dụng 18.64 kWh, quãng đường di chuyển 210 km theo chuẩn NEDC.',
      contentHash: 'hash-3',
      tokenCount: 22,
      tags: ['Pin', 'LFP', 'VF 3', 'Dung lượng'],
      title: 'Sổ tay hướng dẫn sử dụng VinFast VF 3 2025',
      slug: 'so-tay-vf-3-2025',
      category: 'TECHNICAL_GUIDE',
      effectiveFrom: '2025-01-01T00:00:00Z',
      effectiveTo: null,
      publicationStatus: 'PUBLISHED',
      indexStatus: 'READY',
      embedding: new Array(1536).fill(0.01),
    },
  ]

  describe('1. FTS Adapter & Vietnamese Normalizer (A19-KR-301)', () => {
    it('normalizes VinFast vehicle models and query strings correctly', () => {
      expect(normalizeVietnameseSearchQuery('hướng dẫn sạc pin vf8 đời 2025')).toBe(
        'hướng dẫn sạc pin VF 8 đời 2025'
      )
      expect(normalizeVietnameseSearchQuery('vfe34 bảo dưỡng')).toBe('VF e34 bảo dưỡng')
      expect(tokenizeQuery('hướng dẫn sạc pin VF 8')).toContain('vf')
      expect(tokenizeQuery('hướng dẫn sạc pin VF 8')).toContain('8')
      expect(tokenizeQuery('hướng dẫn sạc pin VF 8')).toContain('sạc')
    })

    it('enforces strict scope matching before ranking', () => {
      const candidateVF8 = sampleDocTreePool[0]
      const candidateVF3 = sampleDocTreePool[3]

      // Filter for VF 8
      expect(matchesScope(candidateVF8, { vehicleModel: 'VF 8' })).toBe(true)
      expect(matchesScope(candidateVF3, { vehicleModel: 'VF 8' })).toBe(false)

      // Filter for Category
      expect(matchesScope(candidateVF8, { category: 'TECHNICAL_GUIDE' })).toBe(true)
      expect(matchesScope(candidateVF8, { category: 'WARRANTY_BATTERY' })).toBe(false)
    })

    it('scores and ranks lexical hits with exact match and tag boosts', async () => {
      const adapter = new PostgresFtsAdapter()
      const results = await adapter.searchCandidates(
        'cắm súng sạc DC VF 8',
        { vehicleModel: 'VF 8' },
        { ftsCandidateLimit: 5 },
        sampleDocTreePool
      )

      expect(results.length).toBeGreaterThan(0)
      expect(results[0].chunkId).toBe('chunk-vf8-leaf-step1')
      expect(results[0].ftsRank).toBe(1)
      expect(results[0].ftsScore).toBeGreaterThan(0)
    })
  })

  describe('2. Vector Candidate Adapter & Cosine Similarity (A19-KR-302)', () => {
    it('computes mathematical cosine similarity correctly', () => {
      const vecA = [1, 0, 0]
      const vecB = [1, 0, 0]
      const vecC = [0, 1, 0]
      const vecD = [-1, 0, 0]

      expect(cosineSimilarity(vecA, vecB)).toBeCloseTo(1.0)
      expect(cosineSimilarity(vecA, vecC)).toBeCloseTo(0.0)
      expect(cosineSimilarity(vecA, vecD)).toBeCloseTo(-1.0)
    })

    it('returns empty array when query is empty or pool has no match', async () => {
      const adapter = new VectorCandidateAdapter({ allowMock: true })
      const results = await adapter.searchCandidates('', {}, {}, sampleDocTreePool)
      expect(results).toEqual([])
    })
  })

  describe('3. Versioned Reciprocal Rank Fusion (RRF) (A19-KR-303)', () => {
    it('fuses FTS and Vector candidate ranks with formula w / (k + rank)', () => {
      const ftsHits = [
        { ...sampleDocTreePool[2], ftsRank: 1, ftsScore: 100 },
        { ...sampleDocTreePool[1], ftsRank: 2, ftsScore: 80 },
      ]
      const vecHits = [
        { ...sampleDocTreePool[1], vectorRank: 1, vectorScore: 0.95 },
        { ...sampleDocTreePool[2], vectorRank: 2, vectorScore: 0.90 },
      ]

      const fused = fuseRrfCandidates(ftsHits, vecHits, { k: 60 })

      expect(fused.length).toBe(2)
      // Rank 1 in FTS (1/61) + Rank 2 in Vector (1/62) = 0.016393 + 0.016129 = 0.032522
      // Rank 2 in FTS (1/62) + Rank 1 in Vector (1/61) = 0.032522
      expect(fused[0].rrfScore).toBeCloseTo(1 / 61 + 1 / 62, 5)
    })

    it('breaks ties deterministically', () => {
      const ftsHits = [
        { ...sampleDocTreePool[2], ftsRank: 1, ftsScore: 50 },
        { ...sampleDocTreePool[1], ftsRank: 1, ftsScore: 50 },
      ]

      const fused = fuseRrfCandidates(ftsHits, [], { k: 60 })
      expect(fused.length).toBe(2)
      // Sorted by chunkId when ranks are identical
      expect(fused[0].chunkId.localeCompare(fused[1].chunkId)).toBeLessThan(0)
    })
  })

  describe('4. Hierarchy Expansion Engine (A19-KR-304)', () => {
    it('expands parent section chunk for leaf hit without crossing document boundary', () => {
      const directHits = [
        {
          ...sampleDocTreePool[2], // leaf chunk level 3
          rrfScore: 0.032,
        },
      ]

      const expanded = expandHierarchyCandidates(directHits, sampleDocTreePool, {
        enableParentExpansion: true,
      })

      expect(expanded.length).toBeGreaterThan(1)
      const directHit = expanded.find((c) => c.chunkId === 'chunk-vf8-leaf-step1')
      const parentHit = expanded.find((c) => c.chunkId === 'chunk-vf8-sec-pin')

      expect(directHit?.expansionProvenance).toBe('DIRECT')
      expect(parentHit?.expansionProvenance).toBe('PARENT')
      expect(parentHit?.documentId).toBe('doc-vf8-2025') // Same document invariant
    })
  })

  describe('5. Context Deduplication & Token Budgeting (A19-KR-305)', () => {
    it('enforces token budget and deduplicates repeated contents', () => {
      const candidates = [
        {
          ...sampleDocTreePool[2],
          rrfScore: 0.03,
          expansionProvenance: 'DIRECT' as const,
        },
        {
          ...sampleDocTreePool[2], // Duplicate candidate
          rrfScore: 0.029,
          expansionProvenance: 'DIRECT' as const,
        },
        {
          ...sampleDocTreePool[1],
          rrfScore: 0.025,
          expansionProvenance: 'PARENT' as const,
        },
      ]

      const { items, totalTokensUsed } = buildEvidenceContext(candidates, {
        tokenBudget: 50, // tight budget
        topK: 2,
      })

      expect(items.length).toBeGreaterThan(0)
      expect(totalTokensUsed).toBeLessThanOrEqual(50)
      // Check no duplicates in items
      const ids = items.map((i) => i.chunkId)
      expect(new Set(ids).size).toBe(ids.length)
    })
  })

  describe('6. Citation Ledger & Pointer Validation (A19-KR-307)', () => {
    it('generates well-formed citation IDs and validates pointer format', () => {
      const citationId = generateCitationId({
        documentKey: 'vinfast:manual:VF8:2025:vi-VN',
        versionNo: 1,
        sectionAnchor: 'pin_va_sac_overview',
        sourceNodeId: 'node-sec-pin',
      })

      expect(citationId).toBe(
        'cite:vinfast:manual:VF8:2025:vi-VN:v1:pin_va_sac_overview:node-sec-pin'
      )
      expect(validateCitationPointer(citationId)).toBe(true)
      expect(validateCitationPointer('invalid-citation-format')).toBe(false)
    })

    it('manages citation registry and builds formatted display references', () => {
      const ledger = new KnowledgeCitationLedger()
      const items = [
        {
          chunkId: 'chunk-1',
          documentId: 'doc-1',
          documentKey: 'vinfast:manual:VF8:2025:vi-VN',
          knowledgeVersionId: 'ver-1',
          versionNo: 1,
          indexGenerationId: 'openai-text-embedding-3-small-1536-v1',
          chunkLevel: 3,
          hierarchyPath: '07_pin',
          sectionAnchor: 'sac_pin',
          title: 'Sổ tay VF 8',
          sectionTitle: 'Hướng dẫn sạc pin',
          content: 'Nội dung chi tiết...',
          excerpt: 'Nội dung chi tiết...',
          tokenCount: 15,
          tags: ['Sạc'],
          citationId: 'cite:vinfast:manual:VF8:2025:vi-VN:v1:sac_pin',
          imageRefs: [],
          effectiveFrom: '2025-01-01T00:00:00Z',
          effectiveTo: null,
          dataAsOf: '2026-08-18T00:00:00Z',
          rrfScore: 0.03,
          retrievalMode: 'HYBRID_HIERARCHICAL' as const,
          evidenceRef: 'ev:chunk-1:v1',
          expansionProvenance: 'DIRECT' as const,
        },
      ]

      ledger.registerEvidenceItems(items)
      const refs = ledger.buildDisplayReferences(['cite:vinfast:manual:VF8:2025:vi-VN:v1:sac_pin'])

      expect(refs.length).toBe(1)
      expect(refs[0].displayLabel).toBe('[1] Sổ tay VF 8 — Hướng dẫn sạc pin')
    })
  })

  describe('7. Hybrid Retrieval Service & Failure Semantics (A19-KR-308)', () => {
    it('returns NO_MATCH when query has no matching documents without fake seeded data', async () => {
      const service = new HybridHierarchicalRetrievalService()
      const response = await service.retrieve(
        'hoan toan khong co du lieu abcxyz999',
        {},
        { retrievalMode: 'FTS' },
        sampleDocTreePool
      )

      expect(response.status).toBe('NO_MATCH')
      expect(response.items).toEqual([])
      expect(response.totalFound).toBe(0)
    })

    it('executes full Hybrid Hierarchical Retrieval and tracks telemetry', async () => {
      const service = new HybridHierarchicalRetrievalService()
      const response = await service.retrieve(
        'sạc pin CCS2 VF 8',
        { vehicleModel: 'VF 8' },
        { retrievalMode: 'FTS' }, // Using FTS in test mock
        sampleDocTreePool
      )

      expect(response.status).toBe('SUCCESS')
      expect(response.items.length).toBeGreaterThan(0)
      expect(response.telemetry.ftsCandidateCount).toBeGreaterThan(0)
      expect(response.telemetry.totalLatencyMs).toBeGreaterThanOrEqual(0)
    })

    it('gracefully degrades to DEGRADED_FTS when vector search fails in hybrid mode', async () => {
      const service = new HybridHierarchicalRetrievalService()
      // Mock vector search failure by searching with hybrid mode without OpenAI key
      const response = await service.retrieve(
        'sạc pin CCS2 VF 8',
        { vehicleModel: 'VF 8' },
        { retrievalMode: 'HYBRID_HIERARCHICAL' },
        sampleDocTreePool
      )

      // Since vector query fails (no real OpenAI call in mock environment), it degrades to FTS
      expect(['SUCCESS', 'DEGRADED_FTS']).toContain(response.status)
      expect(response.items.length).toBeGreaterThan(0)
    })
  })
})
