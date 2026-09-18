import type { KnowledgeEvidenceItem } from './retrieval/contracts'

export type VisualRetrievalScope = {
  versionIds: string[]
  sourceNodeIds: string[]
  sectionAnchors: string[]
}

function hasInlineVisual(item: KnowledgeEvidenceItem): boolean {
  return Array.isArray(item.imageRefs) && item.imageRefs.length > 0
}

function semanticSectionPath(hierarchyPath: string): string {
  return hierarchyPath.replace(/\/leaf_\d+$/u, '')
}

function isAdjacentInSource(
  primary: KnowledgeEvidenceItem,
  candidate: KnowledgeEvidenceItem,
): boolean {
  if (primary.documentKey !== candidate.documentKey
    || primary.knowledgeVersionId !== candidate.knowledgeVersionId) return false
  if (semanticSectionPath(primary.hierarchyPath) !== semanticSectionPath(candidate.hierarchyPath)) return false
  if (!Number.isFinite(primary.chunkOrdinal) || !Number.isFinite(candidate.chunkOrdinal)) return false
  return Math.abs(Number(primary.chunkOrdinal) - Number(candidate.chunkOrdinal)) <= 1
}

/**
 * Visuals are collected from any top direct evidence carrying an inline visual,
 * or immediate adjacent neighbors in the same semantic section. Parent expansions
 * and unrelated hits without proximity to direct evidence are excluded.
 */
export function selectVisualEvidenceItems(
  evidenceItems: KnowledgeEvidenceItem[],
): KnowledgeEvidenceItem[] {
  const directEvidence = evidenceItems.filter((item) => item.expansionProvenance === 'DIRECT')
  if (directEvidence.length === 0) return []

  return evidenceItems.filter((item) => {
    if (!hasInlineVisual(item)) return false
    if (item.expansionProvenance === 'PARENT') return false
    if (item.expansionProvenance === 'DIRECT') return true
    return directEvidence.some((direct) => isAdjacentInSource(direct, item))
  })
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
