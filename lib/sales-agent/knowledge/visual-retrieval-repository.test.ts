import { describe, expect, it } from 'vitest'
import { mapApprovedVisualRowsToPointers } from './visual-retrieval-mapper'
import type { KnowledgeEvidenceItem } from './retrieval/contracts'

const evidence = [{
  knowledgeVersionId: 'version-1',
  sourceNodeId: 'node-1',
  sectionAnchor: 'section-1',
  citationId: 'cite:vinfast:VF8:2025:vi-VN:v1:section-1:node-1',
}] as KnowledgeEvidenceItem[]

describe('approved visual knowledge pointer mapping', () => {
  it('keeps only contextual rows, deduplicates assets, and pins the text citation', () => {
    const rows = [
      {
        asset_id: 'asset-1', annotation_id: 'annotation-1', version_id: 'version-1',
        source_node_id: 'node-1', section_anchor: 'section-1', source_url: 'https://example.com/one.png',
        title: 'Sơ đồ 1', summary: 'Mô tả 1', image_type: 'DIAGRAM', mime_type: 'image/png',
        width: 640, height: 480, safety_critical: true,
      },
      {
        asset_id: 'asset-1', annotation_id: 'annotation-1', version_id: 'version-1',
        source_node_id: 'node-1', section_anchor: 'section-1', source_url: 'https://example.com/duplicate.png',
        title: 'Sơ đồ 1', summary: 'Mô tả 1', image_type: 'DIAGRAM', mime_type: 'image/png',
        width: 640, height: 480, safety_critical: true,
      },
      {
        asset_id: 'asset-2', annotation_id: 'annotation-2', version_id: 'other-version',
        source_node_id: 'other-node', section_anchor: 'other-section', source_url: 'https://example.com/two.png',
        title: 'Sơ đồ 2', summary: 'Mô tả 2', image_type: 'DIAGRAM', mime_type: 'image/png',
        width: 320, height: 240, safety_critical: false,
      },
    ]

    const pointers = mapApprovedVisualRowsToPointers(rows, evidence)
    expect(pointers).toHaveLength(1)
    expect(pointers[0]).toMatchObject({
      assetId: 'asset-1',
      annotationId: 'annotation-1',
      citationId: evidence[0].citationId,
      safetyCritical: true,
    })
  })

  it('can fall back to the exact section anchor within the same version', () => {
    const pointers = mapApprovedVisualRowsToPointers([{
      asset_id: 'asset-3', annotation_id: 'annotation-3', version_id: 'version-1',
      source_node_id: null, section_anchor: 'section-1', source_url: 'https://example.com/three.png',
      title: 'Ảnh 3', summary: 'Mô tả 3', image_type: 'PHOTO', mime_type: 'image/png',
      width: null, height: null, safety_critical: false,
    }], evidence)
    expect(pointers[0].citationId).toBe(evidence[0].citationId)
  })
})
