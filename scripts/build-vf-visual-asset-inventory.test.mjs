import { describe, expect, it } from 'vitest'

import {
  assessVisualAssetFilter,
  buildVfVisualAssetInventory,
  buildVisualKnowledgeEvalSet,
  scoreVisualAnnotation,
} from './lib/vf-visual-asset-inventory-build.mjs'

function annotation(overrides = {}) {
  return {
    decision: 'ANNOTATE',
    imageType: 'OTHER',
    annotation: { summary: 'Mô tả ảnh', keywords: [] },
    visibleText: [],
    relations: [],
    confidence: 0.5,
    retrievalRecommendation: 'REVIEW',
    ...overrides,
  }
}

describe('VF visual canonical asset inventory', () => {
  it('groups occurrences by byte hash and selects the strongest annotation', () => {
    const mapRows = [
      { sequence: 1, packetId: 'visual_a', sourceUrl: 'https://a.test/a.png', fileName: 'a.png' },
      { sequence: 2, packetId: 'visual_b', sourceUrl: 'https://a.test/b.png', fileName: 'b.png' },
    ]
    const packetsById = new Map(mapRows.map((row) => [row.packetId, {
      packetId: row.packetId,
      occurrenceIds: [`occ_${row.sequence}`],
      primaryOccurrenceId: `occ_${row.sequence}`,
      contexts: [{
        document: { vehicleKey: 'vf-8', vehicleModel: 'VF 8', modelYear: 2026, documentKey: 'doc' },
        source: { sourceNodeId: 'node' },
      }],
    }]))
    const annotationsByPacket = new Map([
      ['visual_a', annotation()],
      ['visual_b', annotation({
        imageType: 'DIAGRAM',
        annotation: { summary: 'Mô tả chi tiết hơn', keywords: ['sạc', 'sơ đồ'] },
        confidence: 0.95,
        retrievalRecommendation: 'INCLUDE',
      })],
    ])
    const imageRows = mapRows.map((row) => ({
      sequence: row.sequence,
      relativePath: `cache/${row.sequence}.png`,
      sha256: 'a'.repeat(64),
      byteSize: 4_096,
      mimeType: 'image/png',
      format: 'png',
      width: 200,
      height: 100,
    }))

    const result = buildVfVisualAssetInventory({
      mapRows,
      imageRows,
      annotationsByPacket,
      packetsById,
      qaSamplePerStratum: 2,
    })

    expect(result.assets).toHaveLength(1)
    expect(result.assets[0]).toMatchObject({
      reuseCount: 2,
      annotationCandidate: { packetId: 'visual_b', imageType: 'DIAGRAM' },
    })
    expect(result.report).toMatchObject({
      assetCount: 1,
      occurrenceCount: 2,
      duplicateReuseCount: 1,
    })
  })

  it('stratifies tiny/icon assets for QA without auto-dropping them', () => {
    const result = assessVisualAssetFilter({
      annotation: annotation({ imageType: 'ICON_MARKER' }),
      byteSize: 1_500,
      width: 32,
      height: 32,
    })

    expect(result).toMatchObject({
      disposition: 'REVIEW_POSSIBLE_DECORATIVE',
      autoExcluded: false,
      retrievalEnabledCandidate: true,
    })
    expect(result.reasonCodes).toEqual(expect.arrayContaining([
      'VERY_SMALL_BYTES',
      'SMALL_DIMENSIONS',
      'ICON_MARKER',
    ]))
  })

  it('never prefers a generic review draft over a structured include candidate', () => {
    const generic = annotation()
    const structured = annotation({
      imageType: 'WARNING',
      annotation: { summary: 'Nhãn cảnh báo túi khí', keywords: ['túi khí'] },
      visibleText: ['AIRBAG'],
      confidence: 0.95,
      retrievalRecommendation: 'INCLUDE',
    })
    expect(scoreVisualAnnotation(structured)).toBeGreaterThan(scoreVisualAnnotation(generic))
  })

  it('preserves reviewed labels and builds positive and negative eval cases', () => {
    const makeAsset = (sha256, sequence, disposition) => ({
      schemaVersion: '1.0',
      assetKey: `sha256:${sha256}`,
      sha256,
      annotationCandidate: {
        packetId: `visual_${sequence}`,
        summarySha256: sha256,
      },
      filterAssessment: { disposition },
      occurrences: [{
        sourceNodeIds: [`node_${sequence}`],
        documentKeys: [`doc_${sequence}`],
        vehicleModels: ['VF 8'],
        modelYears: [2026],
      }],
    })
    const positiveSha = 'a'.repeat(64)
    const negativeSha = 'b'.repeat(64)
    const assets = [
      makeAsset(positiveSha, 1, 'ELIGIBLE_REVIEW'),
      makeAsset(negativeSha, 2, 'REVIEW_POSSIBLE_DECORATIVE'),
    ]
    const qaSample = {
      status: 'QA_REVIEWED',
      strata: {
        eligibleReview: [{
          sha256: positiveSha,
          representativeSequence: 1,
          representativePacketId: 'visual_1',
          expectedQaLabel: 'KNOWLEDGE_BEARING',
          recommendedRole: 'SUPPORTING_VISUAL',
          qaNotes: 'reviewed',
        }],
        possibleDecorative: [{
          sha256: negativeSha,
          representativeSequence: 2,
          representativePacketId: 'visual_2',
          expectedQaLabel: 'CONTEXT_ONLY',
          recommendedRole: 'INLINE_MARKER',
          qaNotes: 'reviewed',
        }],
      },
    }
    const annotationsByPacket = new Map([
      ['visual_1', annotation({ imageType: 'DIAGRAM' })],
      ['visual_2', annotation({ imageType: 'ICON_MARKER' })],
    ])

    const evalSet = buildVisualKnowledgeEvalSet({ assets, qaSample, annotationsByPacket })

    expect(evalSet.coverage).toMatchObject({ caseCount: 2, positiveCount: 1, negativeCount: 1 })
    expect(evalSet.coverage.categories).toEqual(expect.arrayContaining([
      'correct_asset',
      'source_context',
      'model_year',
      'concise_annotation',
      'negative_context_only',
    ]))
    expect(evalSet.cases[1].expected).toMatchObject({
      standaloneMedia: false,
      role: 'INLINE_MARKER',
      requireSourceBoundCitation: true,
    })
  })
})
