import type { KnowledgeEvidenceItem } from './retrieval/contracts'

export type VisualRetrievalScope = {
  versionIds: string[]
  sourceNodeIds: string[]
  sectionAnchors: string[]
}

export function buildVisualRetrievalScope(
  evidenceItems: KnowledgeEvidenceItem[],
): VisualRetrievalScope {
  const versionIds = [...new Set(evidenceItems.map((item) => item.knowledgeVersionId))]
  const sectionAnchors = [...new Set(evidenceItems.flatMap((item) => {
    const sectionAnchor = item.sectionAnchor.trim()
    return sectionAnchor ? [sectionAnchor] : []
  }))]

  // Anchored evidence must retrieve visuals from that exact chunk. The broader
  // source-node scope is retained only for legacy evidence without an anchor.
  const sourceNodeIds = [...new Set(evidenceItems.flatMap((item) => {
    if (item.sectionAnchor.trim() || !item.sourceNodeId) return []
    return [item.sourceNodeId]
  }))]

  return { versionIds, sourceNodeIds, sectionAnchors }
}
