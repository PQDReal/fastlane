import type { SupabaseClient } from '@supabase/supabase-js'
import { OPENAI_EMBEDDING_GENERATION_ID } from '../embedding-adapter'
import type {
  FtsCandidate,
  KnowledgeScopeFilter,
  KnowledgeScopeMetadata,
  RawChunkCandidate,
  RetrievalOptions,
} from './contracts'
import { KnowledgeStorageUnavailableError } from './contracts'

export function normalizeVietnameseSearchQuery(query: string): string {
  if (!query) return ''
  let normalized = query.trim()

  // Standardize VinFast model names (e.g. VF8 -> VF 8, VFe34 -> VF e34)
  normalized = normalized.replace(/\bvf\s*(\d+)\b/gi, 'VF $1')
  normalized = normalized.replace(/\bvfe\s*34\b/gi, 'VF e34')
  normalized = normalized.replace(/\bvf\s*e34\b/gi, 'VF e34')

  return normalized
}

export function tokenizeQuery(query: string): string[] {
  const normalized = normalizeVietnameseSearchQuery(query).toLowerCase()
  // Match words, numbers, and technical terms
  const tokens = normalized.match(/[\p{L}\p{N}]+/gu) || []
  return Array.from(new Set(tokens.filter((t) => t.length >= 1)))
}

export function matchesScope(
  candidate: RawChunkCandidate,
  filters: KnowledgeScopeFilter,
  candidateScopes?: KnowledgeScopeMetadata[]
): boolean {
  // 1. Category filter
  if (filters.category && candidate.category !== filters.category) {
    return false
  }

  // 2. Document keys filter
  if (filters.documentKeys && filters.documentKeys.length > 0) {
    if (!filters.documentKeys.includes(candidate.documentKey)) {
      return false
    }
  }

  // 3. Effective date filter
  const effectiveAt = filters.effectiveAt ? new Date(filters.effectiveAt).getTime() : Date.now()
  if (!Number.isFinite(effectiveAt)) return false
  if (candidate.effectiveFrom) {
    const fromTime = new Date(candidate.effectiveFrom).getTime()
    if (effectiveAt < fromTime) return false
  }
  if (candidate.effectiveTo) {
    const toTime = new Date(candidate.effectiveTo).getTime()
    // effective_to is an exclusive upper bound in the database predicate.
    if (!Number.isFinite(toTime) || effectiveAt >= toTime) return false
  }

  // 4. Vehicle Model / Year / Market Scope check
  const scopes = candidateScopes ?? candidate.scopeMetadata
  if (scopes && scopes.length > 0) {
    let matchedAnyScope = false
    for (const scope of scopes) {
      let scopeOk = true

      if (filters.vehicleModel && scope.vehicleModel) {
        const normFilterModel = filters.vehicleModel.toLowerCase().replace(/\s+/g, '')
        const normScopeModel = scope.vehicleModel.toLowerCase().replace(/\s+/g, '')
        if (normFilterModel !== normScopeModel && scope.vehicleModel.toUpperCase() !== 'ALL') {
          scopeOk = false
        }
      }

      if (filters.vehicleType && filters.vehicleType !== 'ALL' && scope.vehicleType && scope.vehicleType.toUpperCase() !== 'ALL') {
        if (filters.vehicleType.toUpperCase() !== scope.vehicleType.toUpperCase()) scopeOk = false
      }

      if (filters.modelYear) {
        if (scope.modelYearFrom && filters.modelYear < scope.modelYearFrom) scopeOk = false
        if (scope.modelYearTo && filters.modelYear > scope.modelYearTo) scopeOk = false
      }

      if (filters.market && scope.market && scope.market.toUpperCase() !== 'ALL') {
        if (filters.market.toUpperCase() !== scope.market.toUpperCase()) scopeOk = false
      }

      if (filters.customerSegment && scope.customerSegment && scope.customerSegment.toUpperCase() !== 'ALL') {
        if (filters.customerSegment.toUpperCase() !== scope.customerSegment.toUpperCase()) scopeOk = false
      }

      if (scopeOk) {
        matchedAnyScope = true
        break
      }
    }
    if (!matchedAnyScope) return false
  } else if (filters.vehicleModel) {
    // If no scopes table attached, check document title / hierarchy / section title
    const normFilterModel = filters.vehicleModel.toLowerCase().replace(/\s+/g, '')
    const fullText = `${candidate.title} ${candidate.hierarchyPath} ${candidate.sectionTitle}`.toLowerCase().replace(/\s+/g, '')
    if (!fullText.includes(normFilterModel)) {
      // If doc does not mention this vehicle model, reject
      return false
    }

    // Typed scopes cannot safely be inferred from arbitrary prose. Fail closed
    // when the caller asks for a non-default typed boundary but no scope row
    // was attached to the candidate.
    if (filters.vehicleType && filters.vehicleType !== 'ALL') return false
    if (filters.modelYear !== undefined && !fullText.includes(String(filters.modelYear))) return false
    if (filters.customerSegment && filters.customerSegment !== 'ALL') return false
    if (filters.market && filters.market.toUpperCase() !== 'VN') return false
  } else {
    if (filters.vehicleType && filters.vehicleType !== 'ALL') return false
    if (filters.modelYear !== undefined) return false
    if (filters.customerSegment && filters.customerSegment !== 'ALL') return false
    if (filters.market && filters.market.toUpperCase() !== 'VN') return false
  }

  return true
}

export function scoreLexicalMatch(
  candidate: RawChunkCandidate,
  tokens: string[],
  normalizedQuery: string
): number {
  if (tokens.length === 0) return 0

  const contentLower = candidate.content.toLowerCase()
  const titleLower = candidate.sectionTitle.toLowerCase()
  const docTitleLower = candidate.title.toLowerCase()
  const pathLower = candidate.hierarchyPath.toLowerCase()
  const tagsLower = candidate.tags.map((t) => t.toLowerCase())

  let score = 0
  let matchedTokens = 0

  // 1. Exact phrase match bonus
  const normQueryLower = normalizedQuery.toLowerCase()
  if (normQueryLower.length > 3) {
    if (titleLower.includes(normQueryLower)) score += 40
    if (contentLower.includes(normQueryLower)) score += 25
  }

  // 2. Token matches with field weights
  for (const token of tokens) {
    let tokenMatched = false

    if (titleLower.includes(token)) {
      score += 10
      tokenMatched = true
    }
    if (docTitleLower.includes(token)) {
      score += 6
      tokenMatched = true
    }
    if (tagsLower.some((t) => t.includes(token))) {
      score += 8
      tokenMatched = true
    }
    if (pathLower.includes(token)) {
      score += 4
      tokenMatched = true
    }
    if (contentLower.includes(token)) {
      // Frequency bonus
      const matches = contentLower.split(token).length - 1
      score += Math.min(15, matches * 2)
      tokenMatched = true
    }

    if (tokenMatched) {
      matchedTokens++
    }
  }

  // Require significant token match coverage
  if (matchedTokens === 0) return 0
  if (tokens.length >= 3 && matchedTokens < 2) return 0

  // Boost for high coverage of query tokens
  const coverageRatio = matchedTokens / tokens.length
  if (coverageRatio < 0.25) return 0
  score *= coverageRatio

  // Leaf chunk preference for precision
  if (candidate.chunkLevel === 3) score *= 1.2
  else if (candidate.chunkLevel === 2) score *= 1.1

  return score
}

const VIETNAMESE_STOPWORDS = new Set([
  'hướng', 'dẫn', 'chi', 'tiết', 'cách', 'sử', 'dụng', 'cho', 'tôi', 'biết',
  'như', 'thế', 'nào', 'làm', 'sao', 'ở', 'đâu', 'xin', 'hỏi', 'giúp',
  'gồm', 'các', 'những', 'về', 'của', 'và', 'tại', 'trong', 'quy', 'trình',
  'xe', 'vinfast', 'là', 'gì', 'có', 'được', 'không', 'khi', 'nào', 'với',
  'sơ', 'đồ', 'hình', 'ảnh', 'tổng', 'quan', 'vị', 'trí', 'bố', 'trí',
])

export function extractSearchKeywords(query: string): string {
  const normalized = normalizeVietnameseSearchQuery(query)
  const words = normalized.split(/\s+/).filter(Boolean)
  if (words.length <= 3) return normalized

  const seen = new Set<string>()
  const filtered: string[] = []
  for (const w of words) {
    const clean = w.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')
    if (!clean || VIETNAMESE_STOPWORDS.has(clean) || seen.has(clean)) continue
    seen.add(clean)
    filtered.push(w)
  }
  return filtered.length >= 1 ? filtered.slice(0, 4).join(' ') : normalized
}

function isMissingRpc(error: any): boolean {
  const code = String(error?.code || '')
  const message = String(error?.message || error || '')
  return code === 'PGRST202' || code === '42883' || /function.+does not exist|could not find.+function/i.test(message)
}

export class PostgresFtsAdapter {
  private client?: SupabaseClient

  constructor(client?: SupabaseClient) {
    this.client = client
  }

  /**
   * Thực hiện tìm kiếm ứng viên FTS trên bộ nhớ hoặc qua Supabase RPC
   */
  async searchCandidates(
    query: string,
    filters: KnowledgeScopeFilter = {},
    options: RetrievalOptions = {},
    inMemoryPool?: RawChunkCandidate[]
  ): Promise<FtsCandidate[]> {
    if (options.signal?.aborted) throw new Error('Knowledge retrieval aborted')
    const limit = Math.max(1, Math.min(options.ftsCandidateLimit ?? 20, 100))
    const normalizedQuery = normalizeVietnameseSearchQuery(query)
    const tokens = tokenizeQuery(normalizedQuery)

    if (!normalizedQuery || tokens.length === 0) {
      return []
    }

    // 1. Nếu có in-memory candidates pool (cho evaluation/unit tests)
    if (inMemoryPool && inMemoryPool.length > 0) {
      const candidates = this.searchInMemoryPool(inMemoryPool, tokens, normalizedQuery, filters, limit)
      if (options.signal?.aborted) throw new Error('Knowledge retrieval aborted')
      return candidates
    }

    // 2. Production path: execute the bounded PostgreSQL FTS RPC. The RPC
    // applies lifecycle, active-version, generation, effective-date and scope
    // predicates before ranking against the GIN-backed tsvector column.
    if (this.client) {
      try {
        let targetQuery = normalizedQuery
        const runRpc = (query: string) => {
          const request = this.client!.rpc('sales_agent_search_knowledge_fts', {
            p_query: query,
            p_index_generation_id: options.generationId ?? OPENAI_EMBEDDING_GENERATION_ID,
            p_limit: limit,
            p_vehicle_model: filters.vehicleModel || null,
            p_vehicle_type: filters.vehicleType || null,
            p_model_year: filters.modelYear ?? null,
            p_market: filters.market || 'VN',
            p_customer_segment: filters.customerSegment || 'ALL',
            p_category: filters.category || null,
            p_locale: filters.locale || 'vi-VN',
            p_effective_at: filters.effectiveAt || new Date().toISOString(),
          })
          return options.signal && typeof (request as any).abortSignal === 'function'
            ? (request as any).abortSignal(options.signal)
            : request
        }
        let { data, error } = await runRpc(targetQuery)

        // Retry with extracted core keywords if sentence was too long for strict tsquery
        if ((!data || data.length === 0) && !error) {
          const keywordQuery = extractSearchKeywords(normalizedQuery)
          if (keywordQuery !== normalizedQuery) {
            const retryRes = await runRpc(keywordQuery)
            if (Array.isArray(retryRes.data) && retryRes.data.length > 0) {
              data = retryRes.data
            }
          }
        }

        if (error) {
          throw new KnowledgeStorageUnavailableError(error.message, error)
        }
        if (!Array.isArray(data)) {
          throw new KnowledgeStorageUnavailableError('FTS RPC returned a null or invalid result set')
        }

        return data.map((row: any, idx: number) => ({
          ...this.mapRpcCandidate(row),
          ftsRank: idx + 1,
          ftsScore: Number(row.fts_score || 0),
        }))
      } catch (err: any) {
        if (err instanceof KnowledgeStorageUnavailableError) throw err
        throw new KnowledgeStorageUnavailableError(err?.message || 'Database query failed', err)
      }
    }

    return []
  }

  /** Load only selected chunks plus their closest parents/procedure neighbors. */
  async loadHierarchyContext(
    selectedCandidates: RawChunkCandidate[],
    filters: KnowledgeScopeFilter = {},
    options: RetrievalOptions = {}
  ): Promise<RawChunkCandidate[]> {
    if (!this.client || selectedCandidates.length === 0) return []
    if (options.signal?.aborted) throw new Error('Knowledge retrieval aborted')

    try {
      const generationId = options.generationId ?? OPENAI_EMBEDDING_GENERATION_ID
      const effectiveAt = filters.effectiveAt || new Date().toISOString()
      const chunkIds = Array.from(new Set(selectedCandidates.map((candidate) => candidate.chunkId).filter(Boolean)))
      const versionIds = Array.from(new Set(selectedCandidates.map((candidate) => candidate.versionId).filter(Boolean)))
      const runRpc = async (name: string, params: Record<string, unknown>) => {
        const request = this.client!.rpc(name, params)
        return await (options.signal && typeof (request as any).abortSignal === 'function'
          ? (request as any).abortSignal(options.signal)
          : request)
      }

      let { data, error } = await runRpc('sales_agent_load_knowledge_hierarchy_targets', {
        p_chunk_ids: chunkIds,
        p_index_generation_id: generationId,
        p_effective_at: effectiveAt,
        p_max_neighbors: 1,
      })

      if (error && isMissingRpc(error)) {
        const fallback = await runRpc('sales_agent_load_knowledge_hierarchy_context', {
          p_version_ids: versionIds,
          p_index_generation_id: generationId,
          p_limit: 5000,
          p_effective_at: effectiveAt,
        })
        data = fallback.data
        error = fallback.error
      }
      if (error) throw new KnowledgeStorageUnavailableError(error.message, error)
      if (!Array.isArray(data)) {
        throw new KnowledgeStorageUnavailableError('Hierarchy RPC returned a null or invalid result set')
      }

      return data
        .map((row: any) => this.mapRpcCandidate(row))
        .filter((candidate: RawChunkCandidate) => matchesScope(candidate, filters))
    } catch (err: any) {
      if (err instanceof KnowledgeStorageUnavailableError) throw err
      throw new KnowledgeStorageUnavailableError(err?.message || 'Hierarchy context query failed', err)
    }
  }

  mapRpcCandidate(row: any): RawChunkCandidate {
    return {
      chunkId: String(row.id),
      documentId: String(row.document_id),
      documentKey: String(row.document_key),
      versionId: String(row.version_id),
      versionNo: Number(row.version_no),
      indexGenerationId: String(row.index_generation_id),
      chunkLevel: Number(row.chunk_level),
      hierarchyPath: String(row.hierarchy_path),
      sectionAnchor: String(row.section_anchor),
      sectionTitle: String(row.section_title),
      content: String(row.content),
      contentHash: String(row.content_hash || ''),
      tokenCount: Number(row.token_count || 0),
      chunkOrdinal: row.chunk_ordinal == null ? null : Number(row.chunk_ordinal),
      tags: Array.isArray(row.tags) ? row.tags : [],
      scopeMetadata: Array.isArray(row.scope_metadata) ? row.scope_metadata : undefined,
      sourceNodeId: row.source_node_id ?? null,
      imageRefs: Array.isArray(row.image_refs) ? row.image_refs : [],
      title: String(row.title),
      slug: String(row.slug || ''),
      category: row.category,
      effectiveFrom: String(row.effective_from),
      effectiveTo: row.effective_to ?? null,
      publicationStatus: row.publication_status,
      indexStatus: row.index_status,
    }
  }

  private searchInMemoryPool(
    pool: RawChunkCandidate[],
    tokens: string[],
    normalizedQuery: string,
    filters: KnowledgeScopeFilter,
    limit: number
  ): FtsCandidate[] {
    const scored: { candidate: RawChunkCandidate; score: number }[] = []

    for (const item of pool) {
      if (!matchesScope(item, filters)) {
        continue
      }
      const score = scoreLexicalMatch(item, tokens, normalizedQuery)
      if (score > 0) {
        scored.push({ candidate: item, score })
      }
    }

    // Sort descending by score, deterministic tie-break
    scored.sort((a, b) => {
      if (Math.abs(b.score - a.score) > 0.0001) return b.score - a.score
      return a.candidate.chunkId.localeCompare(b.candidate.chunkId)
    })

    const topResults = scored.slice(0, limit)

    return topResults.map((item, idx) => ({
      ...item.candidate,
      ftsRank: idx + 1,
      ftsScore: item.score,
    }))
  }
}
