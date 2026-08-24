import { describe, expect, it } from 'vitest'
import { mapApprovedVisualRowsToPointers } from './visual-retrieval-mapper'
import {
  buildVisualRetrievalScope,
  selectVisualEvidenceItems,
} from './visual-retrieval-scope'
import type { KnowledgeEvidenceItem } from './retrieval/contracts'

function visualEvidence(
  overrides: Partial<KnowledgeEvidenceItem> = {},
): KnowledgeEvidenceItem {
  return {
    chunkId: 'chunk-1',
    documentId: 'document-1',
    documentKey: 'vinfast:vf-5:2023:vi-VN',
    knowledgeVersionId: 'version-1',
    versionNo: 1,
    indexGenerationId: 'generation-1',
    chunkLevel: 3,
    chunkOrdinal: 1,
    hierarchyPath: 'root/c01/s01/leaf_01',
    sectionAnchor: 'section-1',
    title: 'Manual',
    sectionTitle: 'Section',
    content: 'Content',
    excerpt: 'Content',
    tokenCount: 1,
    tags: [],
    citationId: 'cite:section-1',
    imageRefs: [],
    effectiveFrom: '2023-01-01T00:00:00.000Z',
    effectiveTo: null,
    dataAsOf: '2023-01-01T00:00:00.000Z',
    rrfScore: 1,
    retrievalMode: 'HYBRID_HIERARCHICAL',
    evidenceRef: 'evidence-1',
    expansionProvenance: 'DIRECT',
    ...overrides,
  }
}

const evidence = [{
  knowledgeVersionId: 'version-1',
  sourceNodeId: 'node-1',
  sectionAnchor: 'section-1',
  citationId: 'cite:vinfast:VF8:2025:vi-VN:v1:section-1:node-1',
}] as KnowledgeEvidenceItem[]

describe('approved visual knowledge pointer mapping', () => {
  it('only allows visuals on the primary direct hit or an adjacent chunk in the same section', () => {
    const primary = visualEvidence({
      chunkId: 'wifi-p3',
      hierarchyPath: 'root/c07/s07_cai-dat/leaf_03',
      sectionAnchor: 'settings-p3',
      chunkOrdinal: 199,
    })
    const adjacentIllustration = visualEvidence({
      chunkId: 'wifi-p2',
      hierarchyPath: 'root/c07/s07_cai-dat/leaf_02',
      sectionAnchor: 'settings-p2',
      chunkOrdinal: 198,
      imageRefs: ['https://om.vinfastauto.com/wifi-settings.png'],
    })
    const unrelatedScreen = visualEvidence({
      chunkId: 'touchscreen-layout',
      hierarchyPath: 'root/c07/s01_man-hinh/leaf_01',
      sectionAnchor: 'touchscreen-p1',
      chunkOrdinal: 145,
      imageRefs: ['https://om.vinfastauto.com/layout.png'],
    })
    const adjacentNeighbor = visualEvidence({
      chunkId: 'expanded-image',
      hierarchyPath: 'root/c07/s07_cai-dat/leaf_04',
      sectionAnchor: 'settings-p4',
      chunkOrdinal: 200,
      imageRefs: ['https://om.vinfastauto.com/next-step.png'],
      expansionProvenance: 'NEIGHBOR',
    })
    const parentIllustration = visualEvidence({
      chunkId: 'parent-image',
      hierarchyPath: 'root/c07/s07_cai-dat',
      sectionAnchor: 'settings-parent',
      chunkOrdinal: 198,
      imageRefs: ['https://om.vinfastauto.com/parent.png'],
      expansionProvenance: 'PARENT',
    })

    expect(selectVisualEvidenceItems([
      primary,
      adjacentIllustration,
      unrelatedScreen,
      adjacentNeighbor,
      parentIllustration,
    ])).toEqual([adjacentIllustration, adjacentNeighbor])
  })

  it('returns no visual when the answer chunk has no inline image and other images are in another section', () => {
    const wifiProcedure = visualEvidence({
      chunkId: 'wifi-p3',
      hierarchyPath: 'root/c07/s07_cai-dat/leaf_03',
      sectionAnchor: 'settings-p3',
      chunkOrdinal: 199,
    })
    const genericLayout = visualEvidence({
      chunkId: 'touchscreen-layout',
      hierarchyPath: 'root/c07/s01_man-hinh/leaf_01',
      sectionAnchor: 'touchscreen-p1',
      chunkOrdinal: 145,
      imageRefs: ['https://om.vinfastauto.com/layout.png'],
    })

    expect(selectVisualEvidenceItems([wifiProcedure, genericLayout])).toEqual([])
  })

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
