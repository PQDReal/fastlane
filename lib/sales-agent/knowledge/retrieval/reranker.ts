import type { KnowledgeScopeFilter } from './contracts'
import { normalizeVietnameseSearchQuery, tokenizeQuery } from './fts-adapter'
import type { FusedCandidate } from './rrf-fusion'

/**
 * A deliberately local, deterministic reranker for the second retrieval
 * stage. It reorders the small candidate set returned by FTS/vector/RRF; it
 * never scans the knowledge table and it never changes the stored embeddings.
 */
export interface RerankOptions {
  limit?: number
  filters?: KnowledgeScopeFilter
}

export interface RerankedCandidate extends FusedCandidate {
  rerankScore: number
}

const RERANK_STOPWORDS = new Set([
  'các',
  'có',
  'của',
  'cho',
  'gì',
  'hỏi',
  'khi',
  'là',
  'những',
  'nào',
  'trên',
  'tôi',
  'và',
  'về',
  'xe',
])

/** Common Vietnamese automotive paraphrases that embeddings/FTS can miss. */
const QUERY_EXPANSIONS: Array<{ pattern: RegExp; phrase: string }> = [
  { pattern: /\bnút\b/iu, phrase: 'phím' },
  { pattern: /\btính\s+năng\b/iu, phrase: 'chức năng' },
  { pattern: /\btay\s+lái\b/iu, phrase: 'vô lăng' },
  { pattern: /\bcốp\b/iu, phrase: 'cửa hậu' },
  { pattern: /\bwifi\b|\bwi-fi\b/iu, phrase: 'Wi-Fi mạng không dây' },
]

function expandRerankQuery(query: string): string {
  const normalized = normalizeVietnameseSearchQuery(query)
  const additions = QUERY_EXPANSIONS
    .filter(({ pattern }) => pattern.test(normalized))
    .map(({ phrase }) => phrase)

  return additions.length > 0 ? `${normalized} ${additions.join(' ')}` : normalized
}

function uniqueQueryTokens(query: string): string[] {
  return tokenizeQuery(query).filter((token) => !RERANK_STOPWORDS.has(token))
}

function coverage(tokens: string[], text: string): number {
  if (tokens.length === 0) return 0
  const normalized = text.toLowerCase()
  const matched = tokens.filter((token) => normalized.includes(token)).length
  return matched / tokens.length
}

function phrasePresence(phrases: string[], text: string): number {
  if (phrases.length === 0) return 0
  const normalized = text.toLowerCase()
  const matched = phrases.filter((phrase) => normalized.includes(phrase.toLowerCase())).length
  return matched / phrases.length
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

function buildRerankScore(
  candidate: FusedCandidate,
  query: string,
  queryTokens: string[],
  queryPhrases: string[],
  rrfPrior: number,
): number {
  const sectionText = `${candidate.sectionTitle} ${candidate.hierarchyPath}`
  const titleText = candidate.title
  const contentText = `${candidate.content} ${candidate.tags.join(' ')}`
  const normalizedQuery = query.toLowerCase()
  const sectionLower = sectionText.toLowerCase()
  const intentQuery = /\b(nút|phím|tính năng|chức năng|menu|vô lăng|tay lái)\b/iu.test(normalizedQuery)
  const intentSection = /\b(nút|phím|tính năng|chức năng|menu|vô lăng|tay lái)\b/iu.test(sectionLower)
  const tableBonus = intentQuery && candidate.content.includes('|') ? 1 : 0
  const intentBonus = intentQuery && intentSection ? 1 : 0
  const warningPenalty =
    /cảnh báo|an toàn|nguy hiểm/iu.test(contentText) && !/cảnh báo|an toàn|nguy hiểm/iu.test(normalizedQuery)
      ? 1
      : 0
  const phraseBonus = Math.max(
    phrasePresence(queryPhrases, sectionText),
    phrasePresence(queryPhrases, titleText) * 0.8,
    phrasePresence(queryPhrases, contentText) * 0.5,
  )

  // Headings are intentionally weighted above body text: they carry the
  // inherited breadcrumb that makes sparse tables answerable to paraphrases.
  const score =
    coverage(queryTokens, sectionText) * 0.40 +
    coverage(queryTokens, titleText) * 0.14 +
    coverage(queryTokens, contentText) * 0.12 +
    phraseBonus * 0.10 +
    intentBonus * 0.08 +
    tableBonus * 0.12 +
    clamp01(rrfPrior) * 0.04 -
    warningPenalty * 0.06

  return Number(clamp01(score).toFixed(6))
}

/**
 * Reorder a bounded RRF candidate set and retain deterministic tie-breaking.
 * The optional filter argument is reserved for future scope-aware boosts;
 * hard scope filtering has already happened inside the DB/FTS/vector stage.
 */
export function rerankFusedCandidates(
  query: string,
  candidates: FusedCandidate[],
  options: RerankOptions = {},
): RerankedCandidate[] {
  const limit = Math.max(1, options.limit ?? (candidates.length || 1))
  const expandedQuery = expandRerankQuery(query)
  const queryTokens = uniqueQueryTokens(expandedQuery)
  const queryPhrases = [
    normalizeVietnameseSearchQuery(query).toLowerCase(),
    ...QUERY_EXPANSIONS
      .filter(({ pattern }) => pattern.test(query))
      .map(({ phrase }) => phrase.toLowerCase()),
  ].filter((phrase) => phrase.length > 3)

  // Keep this parameter in the API so a future scope-aware reranker can use
  // it without changing the retrieval call site. Scope was already enforced
  // upstream, so it has no effect in the deterministic implementation.
  void options.filters

  if (candidates.length === 0) return []

  const rrfScores = candidates.map((candidate) => candidate.rrfScore)
  const minRrf = Math.min(...rrfScores)
  const maxRrf = Math.max(...rrfScores)
  const rrfRange = maxRrf - minRrf

  const ranked = candidates.map((candidate, index) => {
    const rrfPrior = rrfRange > 0
      ? (candidate.rrfScore - minRrf) / rrfRange
      : 1 - index / Math.max(1, candidates.length)

    return {
      ...candidate,
      rerankScore: buildRerankScore(candidate, expandedQuery, queryTokens, queryPhrases, rrfPrior),
    }
  })

  ranked.sort((a, b) => {
    if (Math.abs(b.rerankScore - a.rerankScore) > 0.000001) {
      return b.rerankScore - a.rerankScore
    }
    if (Math.abs(b.rrfScore - a.rrfScore) > 0.000001) {
      return b.rrfScore - a.rrfScore
    }
    return a.chunkId.localeCompare(b.chunkId)
  })

  return ranked.slice(0, limit)
}
