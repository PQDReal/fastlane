import { describe, expect, it } from 'vitest'

import {
  buildVfVisualDbSeed,
  compactOccurrenceContext,
  isStandaloneVisualRetrievalEnabled,
} from './lib/vf-visual-db-seed-build.mjs'

const asset = {
  sha256: 'a'.repeat(64),
  byteSize: 10_000,
  mimeType: 'image/png',
  width: 200,
  height: 100,
  annotationCandidate: { packetId: 'visual_' + 'b'.repeat(32), imageType: 'DIAGRAM', score: 120 },
  filterAssessment: { disposition: 'ELIGIBLE_REVIEW', retrievalEnabledCandidate: true },
  occurrences: [{
    packetId: 'visual_' + 'b'.repeat(32),
    occurrenceIds: ['occ_' + 'c'.repeat(32)],
    vehicleModels: ['VF 8'],
  }],
}
const occurrence = {
  occurrenceId: 'occ_' + 'c'.repeat(32),
  document: { documentKey: 'vinfast:vf-8:2026:vi-VN' },
  source: { sourceNodeId: 'node-1', sourcePath: 'chapter.md', sectionTitle: 'Sạc', hierarchyPath: 'root/charge' },
  image: { sourceUrl: 'https://example.test/a.png' },
  position: { canonicalImageOrdinalInSection: 1, blockOrdinal: 2, imageOrdinalInBlock: 1, placeholder: '[img: a.png]' },
  context: { flags: { isProcedure: true } },
  relatedImages: { sameBlock: [], nearby: [], sameBlockCount: 0 },
  chunkRefs: [{ chunkIndex: 3, sectionAnchor: 'doc#node-1' }],
}
const annotation = {
  decision: 'ANNOTATE',
  imageType: 'DIAGRAM',
  annotation: { title: 'Sơ đồ sạc', summary: 'Sơ đồ vị trí cổng sạc.', keywords: ['sạc'] },
  visibleText: [],
  relations: [],
  confidence: 0.5,
  retrievalRecommendation: 'REVIEW',
  safetyCritical: false,
  notes: 'Legacy local result',
}

describe('VF visual DB seed planner', () => {
  it('fails closed for context-only and possible decorative standalone retrieval', () => {
    expect(isStandaloneVisualRetrievalEnabled({
      retrievalEnabledCandidate: true,
      disposition: 'REVIEW_POSSIBLE_DECORATIVE',
      qaLabel: 'CONTEXT_ONLY',
      standaloneEligible: false,
    })).toBe(false)
    expect(isStandaloneVisualRetrievalEnabled({
      retrievalEnabledCandidate: true,
      disposition: 'ELIGIBLE_REVIEW',
    })).toBe(true)
  })

  it('creates one AI draft per canonical asset and compact occurrences', () => {
    const result = buildVfVisualDbSeed({
      inventoryAssets: [asset],
      visualOccurrences: [occurrence],
      annotationsByPacket: new Map([[asset.annotationCandidate.packetId, annotation]]),
    })
    expect(result.assets).toHaveLength(1)
    expect(result.occurrences).toEqual([
      expect.objectContaining({
        assetSha256: asset.sha256,
        sourceOccurrenceId: occurrence.occurrenceId,
        documentKey: occurrence.document.documentKey,
        versionContentChecksum: null,
        contextText: null,
        role: 'DIAGRAM',
      }),
    ])
    expect(result.annotations).toEqual([
      expect.objectContaining({
        assetSha256: asset.sha256,
        status: 'AI_DRAFT',
        revisionNo: 1,
        visionProvider: null,
      }),
    ])
    expect(result.report).toMatchObject({
      assetCount: 1,
      occurrenceCount: 1,
      annotationCount: 1,
      approvedCount: 0,
    })
  })

  it('preserves compact source context without exceeding the DB contract', () => {
    const contextualOccurrence = {
      ...occurrence,
      context: {
        ...occurrence.context,
        beforeText: '# Cửa xe\nBước chuẩn bị trước ảnh.',
        sourceBlock: { text: '| Ký hiệu | Ý nghĩa |\n| 1 | Nút mở cửa |' },
        afterText: 'Bước tiếp theo sau ảnh.'.repeat(120),
      },
    }
    const contextText = compactOccurrenceContext(contextualOccurrence)
    expect(contextText).toContain('Trước ảnh:')
    expect(contextText).toContain('Cùng khối nguồn:')
    expect(contextText).toContain('Sau ảnh:')
    expect(contextText.length).toBeLessThanOrEqual(180)
  })

  it('fails closed when an occurrence has no canonical byte asset', () => {
    expect(() => buildVfVisualDbSeed({
      inventoryAssets: [],
      visualOccurrences: [occurrence],
      annotationsByPacket: new Map(),
    })).toThrow(`Asset missing for occurrence ${occurrence.occurrenceId}`)
  })

  it('flags multi-model summaries for intrinsic review instead of auto-approving', () => {
    const multiModelAsset = {
      ...asset,
      occurrences: [{
        ...asset.occurrences[0],
        vehicleModels: ['VF 8', 'VF 9'],
      }],
    }
    const result = buildVfVisualDbSeed({
      inventoryAssets: [multiModelAsset],
      visualOccurrences: [occurrence],
      annotationsByPacket: new Map([[asset.annotationCandidate.packetId, {
        ...annotation,
        annotation: {
          ...annotation.annotation,
          summary: 'Sơ đồ vị trí cổng sạc trên VF 8.',
        },
      }]]),
    })
    expect(result.annotations[0].provenance.requiresIntrinsicSummaryReview).toBe(true)
    expect(result.annotations[0].status).toBe('AI_DRAFT')
  })
})
