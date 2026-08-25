import { describe, expect, it } from 'vitest'
import { planVisualAnnotationInserts } from './lib/vf-visual-db-push-plan.mjs'

const annotation = {
  assetSha256: 'a'.repeat(64),
  contentHash: 'b'.repeat(64),
  sourceAssetSha256: 'a'.repeat(64),
  sourcePacketId: 'visual_' + 'c'.repeat(32),
  decision: 'ANNOTATE',
  imageType: 'DIAGRAM',
  title: 'Sơ đồ',
  summary: 'Mô tả sơ đồ.',
  keywords: ['sơ đồ'],
  visibleText: [],
  relations: [],
  confidence: 0.8,
  retrievalRecommendation: 'INCLUDE',
  safetyCritical: false,
  visionProvider: null,
  modelId: null,
  requestId: null,
  promptHash: null,
  provenance: {},
}
const assetIdByHash = new Map([[annotation.assetSha256, 'asset-id-1']])

describe('visual DB annotation retry planner', () => {
  it('creates one AI_DRAFT revision on the first import', () => {
    const result = planVisualAnnotationInserts({ annotations: [annotation], assetIdByHash, existingAnnotations: [] })
    expect(result.reused).toBe(0)
    expect(result.inserts).toEqual([expect.objectContaining({
      asset_id: 'asset-id-1',
      revision_no: 1,
      status: 'AI_DRAFT',
      content_hash: annotation.contentHash,
    })])
  })

  it('reuses the matching content hash on retry instead of duplicating a revision', () => {
    const result = planVisualAnnotationInserts({
      annotations: [annotation],
      assetIdByHash,
      existingAnnotations: [{ asset_id: 'asset-id-1', revision_no: 1, content_hash: annotation.contentHash }],
    })
    expect(result).toEqual({ inserts: [], reused: 1 })
  })

  it('allocates the next immutable revision when content changes', () => {
    const result = planVisualAnnotationInserts({
      annotations: [{ ...annotation, contentHash: 'd'.repeat(64) }],
      assetIdByHash,
      existingAnnotations: [
        { asset_id: 'asset-id-1', revision_no: 1, content_hash: '1'.repeat(64) },
        { asset_id: 'asset-id-1', revision_no: 2, content_hash: '2'.repeat(64) },
      ],
    })
    expect(result.inserts[0]).toMatchObject({ revision_no: 3, status: 'AI_DRAFT' })
  })
})
