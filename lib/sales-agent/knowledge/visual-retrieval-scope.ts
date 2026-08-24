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
 * Visuals may only come from the highest-ranked direct evidence or a true
 * neighboring chunk in the same semantic section. Parent expansions and
 * unrelated hits must never contribute media merely because their annotation
 * happens to match a broad query.
 */
export function selectVisualEvidenceItems(
  evidenceItems: KnowledgeEvidenceItem[],
): KnowledgeEvidenceItem[] {
  const directEvidence = evidenceItems.filter((item) => item.expansionProvenance === 'DIRECT')
  const primary = directEvidence[0]
  if (!primary) return []

  return evidenceItems.filter((item) => (
    hasInlineVisual(item)
    && (item === primary || (
      item.expansionProvenance !== 'PARENT'
      && isAdjacentInSource(primary, item)
    ))
  ))
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
