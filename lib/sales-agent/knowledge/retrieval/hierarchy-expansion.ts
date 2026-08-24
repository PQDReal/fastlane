import type {
  ExpansionProvenance,
  RawChunkCandidate,
} from './contracts'
import type { FusedCandidate } from './rrf-fusion'

export interface ExpandedCandidate extends FusedCandidate {
  expansionProvenance: ExpansionProvenance
  parentChunkId?: string
  siblingOrdinal?: number
}

export interface HierarchyExpansionOptions {
  enableParentExpansion?: boolean
  enableNeighborExpansion?: boolean
  maxNeighborsPerHit?: number
  chunkPool?: RawChunkCandidate[]
}

/**
 * Mở rộng ngữ cảnh phân cấp cha-con và bước quy trình anh-em (Parent & Neighbor Hierarchy Expansion)
 * Tuân thủ bất biến A19-KR-304: Không vượt ranh giới document, version hoặc scope.
 */
export function expandHierarchyCandidates(
  fusedHits: FusedCandidate[],
  chunkPool: RawChunkCandidate[] = [],
  options: HierarchyExpansionOptions = {}
): ExpandedCandidate[] {
  const enableParent = options.enableParentExpansion ?? true
  const enableNeighbor = options.enableNeighborExpansion ?? true
  const maxNeighbors = options.maxNeighborsPerHit ?? 1

  if (!enableParent && !enableNeighbor) {
    return fusedHits.map((h) => ({
      ...h,
      expansionProvenance: 'DIRECT',
    }))
  }

  // Index chunk pool by documentId + versionId + hierarchyPath
  const poolByDocVersion = new Map<string, RawChunkCandidate[]>()
  for (const chunk of chunkPool) {
    const key = `${chunk.documentId}:${chunk.versionId}`
    if (!poolByDocVersion.has(key)) {
      poolByDocVersion.set(key, [])
    }
    poolByDocVersion.get(key)!.push(chunk)
  }

  const existingChunkIds = new Set<string>()
  const result: ExpandedCandidate[] = []

  // 1. Add all DIRECT hits first
  for (const hit of fusedHits) {
    existingChunkIds.add(hit.chunkId)
    result.push({
      ...hit,
      expansionProvenance: 'DIRECT',
    })
  }

  const getOrdinal = (candidate: RawChunkCandidate): number | null => {
    const ordinal = candidate.chunkOrdinal
    if (ordinal !== null && ordinal !== undefined && Number.isFinite(ordinal)) return ordinal
    // Legacy/in-memory fixtures may still expose the 058 name.
    const legacyOrdinal = (candidate as RawChunkCandidate & { chunkIndex?: number }).chunkIndex
    return legacyOrdinal !== undefined && Number.isFinite(legacyOrdinal) ? legacyOrdinal : null
  }

  const siblingGroupPath = (candidate: RawChunkCandidate): string => {
    const separator = candidate.hierarchyPath.lastIndexOf('/')
    if (separator < 0) return candidate.hierarchyPath
    const tail = candidate.hierarchyPath.slice(separator + 1).toLowerCase()
    return /^leaf(?:_|-)/.test(tail)
      ? candidate.hierarchyPath.slice(0, separator)
      : candidate.hierarchyPath
  }

  // 2. Perform expansion for each direct hit
  for (const hit of fusedHits) {
    const docVerKey = `${hit.documentId}:${hit.versionId}`
    const availablePool = poolByDocVersion.get(docVerKey) || []

    // 2.1 Parent expansion (if hit is leaf level 3 or sub-section level 2)
    if (enableParent && hit.chunkLevel >= 1) {
      // Find closest ancestor chunk with level < hit.chunkLevel and matching path prefix
      const parentCandidate = availablePool
        .filter((candidate) => {
          if (candidate.chunkId === hit.chunkId) return false
          if (candidate.chunkLevel >= hit.chunkLevel) return false
          return hit.hierarchyPath.startsWith(candidate.hierarchyPath)
        })
        .sort((a, b) => b.chunkLevel - a.chunkLevel)[0]

      if (parentCandidate && !existingChunkIds.has(parentCandidate.chunkId)) {
        existingChunkIds.add(parentCandidate.chunkId)
        result.push({
          ...parentCandidate,
          rrfScore: hit.rrfScore * 0.85, // Inherit decayed RRF score
          ftsRank: undefined,
          ftsScore: undefined,
          vectorRank: undefined,
          vectorScore: undefined,
          expansionProvenance: 'PARENT',
          parentChunkId: undefined,
        })
      }
    }

    // 2.2 Neighbor expansion (if hit is part of an ordered procedure/steps)
    const anchorLower = hit.sectionAnchor.toLowerCase()
    const contentLower = hit.content.toLowerCase()
    const isProcedureStep = anchorLower.includes('step') || contentLower.includes('bước')
    if (enableNeighbor && isProcedureStep && maxNeighbors > 0) {
      const hitSiblingGroup = siblingGroupPath(hit)
      const sameSectionSiblings = availablePool.filter(
        (c) =>
          c.chunkId !== hit.chunkId &&
          siblingGroupPath(c) === hitSiblingGroup &&
          c.chunkLevel === hit.chunkLevel
      )

      const hitOrdinal = getOrdinal(hit)
      const orderedSiblings = sameSectionSiblings.sort((a, b) => {
        const aOrdinal = getOrdinal(a)
        const bOrdinal = getOrdinal(b)
        if (hitOrdinal !== null && aOrdinal !== null && bOrdinal !== null) {
          const distanceDiff = Math.abs(aOrdinal - hitOrdinal) - Math.abs(bOrdinal - hitOrdinal)
          if (distanceDiff !== 0) return distanceDiff
          if (aOrdinal !== bOrdinal) return aOrdinal - bOrdinal
        }
        return a.chunkId.localeCompare(b.chunkId)
      })

      let addedForHit = 0
      for (const sibling of orderedSiblings) {
        if (existingChunkIds.has(sibling.chunkId)) continue

        const siblingOrdinal = getOrdinal(sibling)
        // When stable ordinals are available, only true adjacent steps may be
        // expanded. Without one, retain deterministic legacy behavior and use
        // the first sibling(s) in chunk-id order.
        if (
          hitOrdinal !== null &&
          siblingOrdinal !== null &&
          Math.abs(siblingOrdinal - hitOrdinal) !== 1
        ) {
          continue
        }

        existingChunkIds.add(sibling.chunkId)
        result.push({
          ...sibling,
          rrfScore: hit.rrfScore * 0.75, // Decayed score for context neighbor
          ftsRank: undefined,
          ftsScore: undefined,
          vectorRank: undefined,
          vectorScore: undefined,
          expansionProvenance: 'NEIGHBOR',
          siblingOrdinal: siblingOrdinal ?? undefined,
        })
        addedForHit++
        if (addedForHit >= maxNeighbors) break
      }
    }
  }

  // Stable ordering: Primary DIRECT hits sorted by rrfScore, followed by PARENT / NEIGHBOR
  result.sort((a, b) => {
    // Keep direct hits with higher priority
    if (a.expansionProvenance === 'DIRECT' && b.expansionProvenance !== 'DIRECT') return -1
    if (a.expansionProvenance !== 'DIRECT' && b.expansionProvenance === 'DIRECT') return 1
    const scoreDiff = b.rrfScore - a.rrfScore
    if (Math.abs(scoreDiff) > 1e-7) return scoreDiff
    return a.chunkId.localeCompare(b.chunkId)
  })

  return result
}
