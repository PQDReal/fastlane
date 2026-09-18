import type {
  FtsCandidate,
  RawChunkCandidate,
  VectorCandidate,
} from './contracts'

export interface FusedCandidate extends RawChunkCandidate {
  ftsRank?: number
  ftsScore?: number
  vectorRank?: number
  vectorScore?: number
  rrfScore: number
}

export interface RrfOptions {
  k?: number
  weightFts?: number
  weightVector?: number
  minScoreThreshold?: number
  limit?: number
}

/**
 * Thực hiện hợp nhất danh sách ứng viên FTS và Vector bằng thuật toán Reciprocal Rank Fusion (RRF)
 * Standard Formula: RRF(d) = w_fts / (k + rank_fts) + w_vec / (k + rank_vec)
 */
export function fuseRrfCandidates(
  ftsCandidates: FtsCandidate[] = [],
  vectorCandidates: VectorCandidate[] = [],
  options: RrfOptions = {}
): FusedCandidate[] {
  const k = options.k ?? 60
  const weightFts = options.weightFts ?? 1.0
  const weightVector = options.weightVector ?? 1.0
  const minScore = options.minScoreThreshold ?? 0.0
  const limit = options.limit ?? 20

  const candidateMap = new Map<string, FusedCandidate>()

  // 1. Process FTS candidates
  for (const fts of ftsCandidates) {
    const ftsComponent = weightFts / (k + fts.ftsRank)
    candidateMap.set(fts.chunkId, {
      ...fts,
      ftsRank: fts.ftsRank,
      ftsScore: fts.ftsScore,
      vectorRank: undefined,
      vectorScore: undefined,
      rrfScore: ftsComponent,
    })
  }

  // 2. Process Vector candidates
  for (const vec of vectorCandidates) {
    const vecComponent = weightVector / (k + vec.vectorRank)
    const existing = candidateMap.get(vec.chunkId)

    if (existing) {
      existing.vectorRank = vec.vectorRank
      existing.vectorScore = vec.vectorScore
      existing.rrfScore += vecComponent
    } else {
      candidateMap.set(vec.chunkId, {
        ...vec,
        ftsRank: undefined,
        ftsScore: undefined,
        vectorRank: vec.vectorRank,
        vectorScore: vec.vectorScore,
        rrfScore: vecComponent,
      })
    }
  }

  // 3. Convert to array and filter by minimum score threshold
  const fusedList = Array.from(candidateMap.values()).filter(
    (item) => item.rrfScore >= minScore
  )

  // 4. Deterministic sorting:
  //    Primary: rrfScore descending
  //    Secondary: ftsRank ascending (if both have ftsRank)
  //    Tertiary: vectorRank ascending
  //    Quaternary: chunkId lexicographical ascending
  fusedList.sort((a, b) => {
    const scoreDiff = b.rrfScore - a.rrfScore
    if (Math.abs(scoreDiff) > 1e-7) {
      return scoreDiff
    }

    // Tie-breaking by ftsRank
    const aFts = a.ftsRank ?? 9999
    const bFts = b.ftsRank ?? 9999
    if (aFts !== bFts) {
      return aFts - bFts
    }

    // Tie-breaking by vectorRank
    const aVec = a.vectorRank ?? 9999
    const bVec = b.vectorRank ?? 9999
    if (aVec !== bVec) {
      return aVec - bVec
    }

    // Tie-breaking by chunkId
    return a.chunkId.localeCompare(b.chunkId)
  })

  return fusedList.slice(0, limit)
}
