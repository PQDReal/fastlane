import { describe, expect, it } from 'vitest'
import { mapApprovedVisualRowsToPointers } from './visual-retrieval-mapper'
import { buildVisualRetrievalScope } from './visual-retrieval-scope'
import type { KnowledgeEvidenceItem } from './retrieval/contracts'

const evidence = [{
  knowledgeVersionId: 'version-1',
  sourceNodeId: 'node-1',
  sectionAnchor: 'section-1',
  citationId: 'cite:vinfast:VF8:2025:vi-VN:v1:section-1:node-1',
}] as KnowledgeEvidenceItem[]

describe('approved visual knowledge pointer mapping', () => {
  it('uses exact section anchors and reserves source-node lookup for legacy evidence', () => {
    const scope = buildVisualRetrievalScope([
      ...evidence,
      {
        knowledgeVersionId: 'version-1', sourceNodeId: 'legacy-node', sectionAnchor: '',
        citationId: 'cite:legacy',
      } as KnowledgeEvidenceItem,
    ])

    expect(scope).toEqual({
      versionIds: ['version-1'],
      sectionAnchors: ['section-1'],
      sourceNodeIds: ['legacy-node'],
    })
  })

  it('keeps only contextual rows, deduplicates assets, and pins the text citation', () => {
    const rows = [
      {
        asset_id: 'asset-1', annotation_id: 'annotation-1', version_id: 'version-1',
        source_node_id: 'node-1', section_anchor: 'section-1', source_url: 'https://om.vinfastauto.com/one.png',
        title: 'Sơ đồ 1', summary: 'Mô tả 1', image_type: 'DIAGRAM', mime_type: 'image/png',
        width: 640, height: 480, safety_critical: true,
      },
      {
        asset_id: 'asset-1', annotation_id: 'annotation-1', version_id: 'version-1',
        source_node_id: 'node-1', section_anchor: 'section-1', source_url: 'https://om.vinfastauto.com/duplicate.png',
        title: 'Sơ đồ 1', summary: 'Mô tả 1', image_type: 'DIAGRAM', mime_type: 'image/png',
        width: 640, height: 480, safety_critical: true,
      },
      {
        asset_id: 'asset-2', annotation_id: 'annotation-2', version_id: 'other-version',
        source_node_id: 'other-node', section_anchor: 'other-section', source_url: 'https://om.vinfastauto.com/two.png',
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
      source_node_id: null, section_anchor: 'section-1', source_url: 'https://om.vinfastauto.com/three.png',
      title: 'Ảnh 3', summary: 'Mô tả 3', image_type: 'PHOTO', mime_type: 'image/png',
      width: null, height: null, safety_critical: false,
    }], evidence)
    expect(pointers[0].citationId).toBe(evidence[0].citationId)
  })

  it('pins an image to the exact sibling section instead of the first matching source node', () => {
    const siblingEvidence = [
      {
        knowledgeVersionId: 'version-1', sourceNodeId: 'node-1', sectionAnchor: 'settings-p2',
        citationId: 'cite:settings-p2',
      },
      {
        knowledgeVersionId: 'version-1', sourceNodeId: 'node-1', sectionAnchor: 'settings-p5',
        citationId: 'cite:settings-p5',
      },
    ] as KnowledgeEvidenceItem[]

    const pointers = mapApprovedVisualRowsToPointers([{
      asset_id: 'wifi-asset', annotation_id: 'wifi-annotation', version_id: 'version-1',
      source_node_id: 'node-1', section_anchor: 'settings-p5',
      source_url: 'https://om.vinfastauto.com/wifi.png', title: 'Wi-Fi Settings',
      summary: 'Wi-Fi network settings screen', image_type: 'SCREENSHOT', mime_type: 'image/png',
      width: 640, height: 480, safety_critical: false,
    }], siblingEvidence)

    expect(pointers).toHaveLength(1)
    expect(pointers[0].citationId).toBe('cite:settings-p5')
  })

  it('drops an anchored sibling image when its exact section is absent from the evidence', () => {
    const wifiOnlyEvidence = [{
      knowledgeVersionId: 'version-1', sourceNodeId: 'node-1', sectionAnchor: 'settings-p5',
      citationId: 'cite:settings-p5',
    }] as KnowledgeEvidenceItem[]

    const pointers = mapApprovedVisualRowsToPointers([{
      asset_id: 'generic-settings-asset', annotation_id: 'generic-settings-annotation',
      version_id: 'version-1', source_node_id: 'node-1', section_anchor: 'settings-p2',
      source_url: 'https://om.vinfastauto.com/settings.png', title: 'Vehicle Settings',
      summary: 'Generic vehicle settings screen', image_type: 'SCREENSHOT', mime_type: 'image/png',
      width: 640, height: 480, safety_critical: false,
    }], wifiOnlyEvidence)

    expect(pointers).toEqual([])
  })
})
