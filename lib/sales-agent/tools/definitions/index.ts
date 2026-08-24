import 'server-only'

import { browseCatalogRepository } from '../../catalog/browse'
import { resolveCatalogEntitiesRepository } from '../../catalog/identity'
import { getProductDetailsRepository } from '../../catalog/product-details'
import { compareProductsRepository } from '../../catalog/comparison'
import { getCurrentPromotionsRepository } from '../../catalog/promotions'
import { discoverSalesAgentAccessories } from '../../catalog/accessories'
import { searchKnowledgeRepository, searchUserManualRepository } from '../../knowledge/repository'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { HybridHierarchicalRetrievalService } from '../../knowledge/retrieval/retrieval-service'
import type {
  BrowseCatalogInput,
  DataToolName,
  DiscoverAccessoriesInput,
  EvidenceRecord,
  FactPointer,
  GetProductDetailsInput,
  GetCurrentPromotionsInput,
  ResolveCatalogEntitiesInput,
  SearchKnowledgeInput,
  SearchUserManualsInput,
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

      case 'resolve_catalog_entities':
        return await resolveCatalogEntitiesRepository(args as ResolveCatalogEntitiesInput, toolCallId)

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
        const retrieval = await new HybridHierarchicalRetrievalService({
          client: getSupabaseAdmin(),
        }).retrieve(
          input.query,
          {},
          {
            retrievalMode: 'HYBRID_HIERARCHICAL',
            topK: input.topK ?? 4,
          },
        )

        if (retrieval.status === 'UNAVAILABLE') {
          throw new Error('Knowledge retrieval is unavailable')
        }

        const searchResults = retrieval.items

        const evidence: EvidenceRecord[] = searchResults.map((k) => {
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
          data: {
            snippets: searchResults.map((r) => ({
              id: r.chunkId,
              documentSlug: r.documentKey,
              title: `${r.title} - ${r.sectionTitle}`,
              content: r.content,
              category: r.category ?? 'TECHNICAL_GUIDE',
              citationPointer: r.citationId,
            })),
          },
        }
      }

      case 'search_user_manuals': {
        // Trigger Turbopack recompile
        const input = args as SearchUserManualsInput
        const searchResults = await searchUserManualRepository(input.query, input.modelSeries, input.year, input.topK ?? 3)

        const evidence: EvidenceRecord[] = searchResults.map((k, index) => {
          const lastUnderscore = k.articleId.lastIndexOf('_')
          const parsedModelId = lastUnderscore > 0 ? k.articleId.substring(0, lastUnderscore) : ''
          const parsedArticleId = lastUnderscore > 0 ? k.articleId.substring(lastUnderscore + 1) : k.articleId

          const facts = [
            { factRef: `fact-manual-title-${k.chunkId}`, factPath: 'title', valueHash: k.articleTitle },
            { factRef: `fact-manual-section-${k.chunkId}`, factPath: 'section', valueHash: k.sectionTitle },
            { factRef: `fact-manual-content-${k.chunkId}`, factPath: 'content', valueHash: k.content },
            { factRef: `fact-manual-articleId-${k.chunkId}`, factPath: 'article_id', valueHash: parsedArticleId },
            { factRef: `fact-manual-modelId-${k.chunkId}`, factPath: 'model_id', valueHash: parsedModelId },
          ]
          if (k.imageUrl) {
            facts.push({ factRef: `fact-manual-image-${k.chunkId}`, factPath: 'image_url', valueHash: k.imageUrl })
          }
          return {
            evidenceId: `ev-manual-${k.chunkId}-${readAt}`,
            source: { system: 'SUPABASE', resource: 'manual_article_chunks' },
            entity: { kind: 'KNOWLEDGE_SNIPPET', id: k.chunkId },
            facts,
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
          tool: 'search_user_manuals',
          readAt,
          dataAsOf,
          evidence,
          observation,
          issues: [],
          appliedBindings: [],
          outcome: searchResults.length > 0 ? 'SUCCESS' : 'NO_MATCH',
          completeness: 'FULL',
          data: {
            snippets: searchResults.map((r) => {
              const lastUnderscore = r.articleId.lastIndexOf('_')
              const parsedModelId = lastUnderscore > 0 ? r.articleId.substring(0, lastUnderscore) : ''
              const parsedArticleId = lastUnderscore > 0 ? r.articleId.substring(lastUnderscore + 1) : r.articleId
              return {
                id: r.chunkId,
                articleId: parsedArticleId,
                modelId: parsedModelId,
                title: `${r.articleTitle} - ${r.sectionTitle}`,
                content: r.content,
                imageUrl: r.imageUrl,
              }
            }),
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
