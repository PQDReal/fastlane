import 'server-only'

import { performance } from 'node:perf_hooks'
import { browseCatalogRepository } from '../../catalog/browse'
import { getProductDetailsRepository } from '../../catalog/product-details'
import { compareProductsRepository } from '../../catalog/comparison'
import { getCurrentPromotionsRepository } from '../../catalog/promotions'
import { discoverSalesAgentAccessories } from '../../catalog/accessories'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { HybridHierarchicalRetrievalService } from '../../knowledge/retrieval/retrieval-service'
import { findApprovedVisualKnowledge } from '../../knowledge/visual-retrieval-repository'
import { isSalesAgentVisualKnowledgeRetrievalEnabled } from '../../core/flags'
import type { KnowledgeVisualMediaPointer } from '../../knowledge/retrieval/contracts'
import { guardUntrustedKnowledgeText } from '../../knowledge/untrusted-content'
import { detectKnowledgeAmbiguity } from '../../knowledge/ambiguity'
import type {
  BrowseCatalogInput,
  DataToolName,
  DiscoverAccessoriesInput,
  EvidenceRecord,
  FactPointer,
  GetProductDetailsInput,
  GetCurrentPromotionsInput,
  SearchKnowledgeInput,
  ToolObservationRef,
  ToolResult,
} from '../../contracts'

export async function executeDataTool(
  name: DataToolName,
  args: any,
  toolCallId: string,
): Promise<ToolResult> {
  const readAt = new Date().toISOString()
  const dataAsOf = readAt

  try {
    switch (name) {
      case 'browse_catalog':
        return await browseCatalogRepository(args as BrowseCatalogInput, toolCallId)

      case 'get_product_details':
        return await getProductDetailsRepository(args as GetProductDetailsInput, toolCallId)

      case 'compare_products':
        return await compareProductsRepository(args as any, toolCallId)

      case 'get_current_promotions':
        return await getCurrentPromotionsRepository(args as GetCurrentPromotionsInput, toolCallId)

      case 'discover_accessories': {
        const input = args as DiscoverAccessoriesInput
        const vehicleId = input.mode.kind === 'FOR_PRODUCT' ? input.mode.productId : undefined
        const res = await discoverSalesAgentAccessories({
          vehicleProductId: vehicleId,
          minPrice: input.price?.min,
          maxPrice: input.price?.max,
          limit: input.page?.limit ?? 6,
        })

        const evidence: EvidenceRecord[] = res.items.map((acc: any) => ({
          evidenceId: `ev-acc-${acc.productId}-${readAt}`,
          source: { system: 'SUPABASE', resource: 'accessories' },
          entity: { kind: 'PRODUCT', id: acc.productId },
          facts: [
            { factRef: `fact-price-${acc.productId}`, factPath: 'price', valueHash: String(acc.price) },
            { factRef: `fact-name-${acc.productId}`, factPath: 'name', valueHash: acc.name },
          ],
          readAt,
          sourceUpdatedAt: acc.sourceUpdatedAt ?? undefined,
        }))

        const observation: ToolObservationRef = {
          observationId: `obs-${toolCallId}`,
          toolCallId,
          outcome: res.items.length > 0 ? 'SUCCESS' : 'NO_MATCH',
          issueCodes: [],
          inputHash: JSON.stringify(input),
          readAt,
        }

        return {
          schemaVersion: '2.0',
          toolCallId,
          tool: 'discover_accessories',
          readAt,
          dataAsOf,
          evidence,
          observation,
          issues: [],
          appliedBindings: [],
          outcome: res.items.length > 0 ? 'SUCCESS' : 'NO_MATCH',
          completeness: 'FULL',
          data: {
            items: res.items,
          },
        }
      }

      case 'search_knowledge': {
        const input = args as SearchKnowledgeInput
        const modelMatch = input.query.match(/\b(vf\s*\d+|vf\s*e34|vfe34)\b/i)
        const inferredModel = input.vehicleModel || (modelMatch ? modelMatch[0].toUpperCase().replace(/\s+/g, ' ').replace('VFE34', 'VF e34').replace('VF E34', 'VF e34') : undefined)
        const yearMatch = input.query.match(/\b(20\d{2})\b/)
        const inferredYear = input.modelYear ?? (yearMatch ? Number(yearMatch[1]) : undefined)

        let retrieval: any
        try {
          retrieval = await new HybridHierarchicalRetrievalService({
            client: getSupabaseAdmin(),
          }).retrieve(
            input.query,
            {
              vehicleModel: inferredModel,
              modelYear: inferredYear,
              category: input.categories && input.categories.length === 1 ? input.categories[0] as any : undefined,
            },
            {
              retrievalMode: 'HYBRID_HIERARCHICAL',
              topK: input.topK ?? 5,
            },
          )
        } catch (retrievalErr: any) {
          console.warn('[KNOWLEDGE RETRIEVAL] Search threw error, treating as empty:', retrievalErr?.message || retrievalErr)
          retrieval = { status: 'NO_MATCH', items: [] }
        }

        if (retrieval.status === 'UNAVAILABLE' || !Array.isArray(retrieval.items)) {
          retrieval = { status: 'NO_MATCH', items: [] }
        }

        const searchResults = retrieval.items
        const safeSearchResults = searchResults.map((item: any) => {
          const title = guardUntrustedKnowledgeText(item.title)
          const sectionTitle = guardUntrustedKnowledgeText(item.sectionTitle)
          const content = guardUntrustedKnowledgeText(item.content)
          return {
            ...item,
            title: title.text || 'Tài liệu FASTLANE',
            sectionTitle: sectionTitle.text || 'Nội dung tham chiếu',
            content: content.text,
            contentSafety: title.blocked || sectionTitle.blocked || content.blocked ? 'BLOCKED' : 'SAFE',
          }
        })
        const ambiguity = detectKnowledgeAmbiguity(safeSearchResults, {
          vehicleModel: inferredModel,
          modelYear: inferredYear,
        })
        if (ambiguity) {
          const issues = [{
            code: 'AMBIGUOUS_REFERENCE' as const,
            message: ambiguity.question,
            field: ambiguity.field,
            candidates: ambiguity.candidates,
          }]
          return {
            schemaVersion: '2.0',
            toolCallId,
            tool: 'search_knowledge',
            readAt,
            dataAsOf,
            evidence: [],
            observation: {
              observationId: `obs-${toolCallId}`,
              toolCallId,
              outcome: 'NEEDS_INPUT',
              issueCodes: ['AMBIGUOUS_REFERENCE'],
              inputHash: JSON.stringify(input),
              readAt,
            },
            issues,
            appliedBindings: [],
            outcome: 'NEEDS_INPUT',
            diagnostics: {
              retrieval: {
                status: retrieval.status,
                retrievalMode: retrieval.retrievalMode,
                totalFound: retrieval.totalFound,
                ...retrieval.telemetry,
              },
            },
            data: ambiguity,
          }
        }
        let visualPointers: KnowledgeVisualMediaPointer[] = []
        const visualLookupEnabled = isSalesAgentVisualKnowledgeRetrievalEnabled()
        const visualLookupStartedAt = performance.now()
        if (visualLookupEnabled) {
          try {
            visualPointers = await findApprovedVisualKnowledge(
              getSupabaseAdmin(),
              input.query,
              searchResults,
              3,
            )
          } catch (visualError: any) {
            // Visuals are optional enrichment. Preserve the grounded text result
            // while keeping the separate visual release gate fail-closed.
            console.warn('[VISUAL KNOWLEDGE] Approved media lookup unavailable:', visualError?.message || visualError)
          }
        }
        const visualLookupLatencyMs = Math.max(0, Math.round((performance.now() - visualLookupStartedAt) * 100) / 100)

        const evidence: EvidenceRecord[] = safeSearchResults.map((k: any) => {
          const media = visualPointers.filter((pointer) => pointer.citationId === k.citationId)
          return {
            evidenceId: `ev-kb-${k.chunkId}-${readAt}`,
            source: { system: 'SUPABASE', resource: 'knowledge_chunks' },
            entity: { kind: 'KNOWLEDGE_SNIPPET', id: k.chunkId },
            facts: [
              { factRef: `fact-kb-title-${k.chunkId}`, factPath: 'title', valueHash: k.title },
              { factRef: `fact-kb-section-${k.chunkId}`, factPath: 'section', valueHash: k.sectionTitle },
              { factRef: `fact-kb-content-${k.chunkId}`, factPath: 'content', valueHash: k.content },
              { factRef: `fact-kb-citation-${k.chunkId}`, factPath: 'citationId', valueHash: k.citationId },
              { factRef: `fact-kb-evidence-ref-${k.chunkId}`, factPath: 'evidenceRef', valueHash: k.evidenceRef },
              ...media.map((pointer) => ({
                factRef: `fact-kb-media-${k.chunkId}-${pointer.assetId}`,
                factPath: 'mediaPointer',
                valueHash: JSON.stringify(pointer),
              })),
            ],
            readAt,
          }
        })

        const observation: ToolObservationRef = {
          observationId: `obs-${toolCallId}`,
          toolCallId,
          outcome: searchResults.length > 0 ? 'SUCCESS' : 'NO_MATCH',
          issueCodes: [],
          inputHash: JSON.stringify(input),
          readAt,
        }

        return {
          schemaVersion: '2.0',
          toolCallId,
          tool: 'search_knowledge',
          readAt,
          dataAsOf,
          evidence,
          observation,
          issues: [],
          appliedBindings: [],
          outcome: searchResults.length > 0 ? 'SUCCESS' : 'NO_MATCH',
          completeness: 'FULL',
          diagnostics: {
            retrieval: {
              status: retrieval.status,
              retrievalMode: retrieval.retrievalMode,
              totalFound: retrieval.totalFound,
              ...retrieval.telemetry,
            },
            visualLookup: {
              enabled: visualLookupEnabled,
              latencyMs: visualLookupLatencyMs,
              pointerCount: visualPointers.length,
            },
          },
          data: {
            snippets: safeSearchResults.map((r: any) => ({
              id: r.chunkId,
              documentSlug: r.documentKey,
              title: `${r.title} - ${r.sectionTitle}`,
              content: r.content,
              category: r.category ?? 'TECHNICAL_GUIDE',
              citationPointer: r.citationId,
              contentSafety: r.contentSafety,
              scopeMetadata: r.scopeMetadata,
              media: visualPointers.filter((pointer) => pointer.citationId === r.citationId),
            })),
          },
        }
      }

      default: {
        const exhaustiveCheck: never = name
        throw new Error(`Tool không được hỗ trợ: ${exhaustiveCheck}`)
      }
    }
  } catch (err: any) {
    console.warn(`[DATA TOOL RESILIENCE] Tool ${name} encountered an error:`, err?.message || err)
    const observation: ToolObservationRef = {
      observationId: `obs-err-${toolCallId}`,
      toolCallId,
      outcome: 'UNAVAILABLE',
      issueCodes: ['RESOURCE_UNAVAILABLE'],
      inputHash: JSON.stringify(args),
      readAt,
    }
    return {
      schemaVersion: '2.0',
      toolCallId,
      tool: name,
      readAt,
      dataAsOf,
      evidence: [],
      observation,
      issues: [{ code: 'RESOURCE_UNAVAILABLE', message: 'Dữ liệu tạm thời chưa phản hồi.' }],
      appliedBindings: [],
      outcome: 'UNAVAILABLE',
      data: null,
    }
  }
}
