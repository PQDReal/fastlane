import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  KnowledgeEvidenceItem,
  KnowledgeVisualMediaPointer,
} from './retrieval/contracts'
import {
  mapApprovedVisualRowsToPointers,
  type ApprovedVisualRow,
} from './visual-retrieval-mapper'
import { isSalesAgentVisualKnowledgeDraftsAllowed } from '../core/flags'
import {
  buildVisualRetrievalScope,
  selectVisualEvidenceItems,
} from './visual-retrieval-scope'

const VISUAL_QUERY_TIMEOUT_MS = 8_000

function withTimeout<T>(operation: PromiseLike<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  return Promise.race([
    Promise.resolve(operation),
    new Promise<T>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error('Visual knowledge query timed out.')),
        VISUAL_QUERY_TIMEOUT_MS,
      )
    }),
  ]).finally(() => {
    if (timer) clearTimeout(timer)
  })
}

/**
 * Resolves context-linked media through the RPC that accepts APPROVED and
 * AI_DRAFT (admin "chờ duyệt") annotations. REJECTED/IGNORED/STALE rows are
 * never eligible, and the SQL gate still excludes decorative/EXCLUDE media.
 */
export async function findApprovedVisualKnowledge(
  client: SupabaseClient,
  query: string,
  evidenceItems: KnowledgeEvidenceItem[],
  limit = 3,
): Promise<KnowledgeVisualMediaPointer[]> {
  if (!evidenceItems.length) return []

  const visualEvidenceItems = selectVisualEvidenceItems(evidenceItems)
  if (!visualEvidenceItems.length) return []

  const { versionIds, sourceNodeIds, sectionAnchors } = buildVisualRetrievalScope(visualEvidenceItems)

  const rpcName = isSalesAgentVisualKnowledgeDraftsAllowed()
    ? 'sales_agent_search_knowledge_visuals_with_drafts'
    : 'sales_agent_search_knowledge_visuals'
  const { data, error } = await withTimeout(client.rpc(
    rpcName,
    {
      p_query: query,
      p_version_ids: versionIds,
      p_source_node_ids: sourceNodeIds,
      p_section_anchors: sectionAnchors,
      p_limit: Math.min(6, Math.max(1, limit)),
    },
  ))
  if (error) throw new Error(`Visual knowledge query failed: ${error.message}`)

  return mapApprovedVisualRowsToPointers(
    (data || []) as ApprovedVisualRow[],
    visualEvidenceItems,
  ).slice(0, limit)
}
