import 'server-only'

import { browseCatalogRepository } from '../../../catalog/v2/browse-repository'
import { resolveCatalogEntitiesRepository } from '../../../catalog/v2/identity-repository'
import { getProductDetailsRepository } from '../../../catalog/v2/product-details-repository'
import { compareProductsRepository } from '../../../catalog/v2/comparison-repository'
import { getCurrentPromotionsRepository } from '../../../catalog/v2/promotions-repository'
import { discoverSalesAgentAccessories } from '../../../catalog/accessories'
import type {
  BrowseCatalogInput,
  DataToolNameV2,
  DiscoverAccessoriesInput,
  EvidenceRecord,
  FactPointerV2,
  GetProductDetailsInput,
  GetCurrentPromotionsInput,
  ResolveCatalogEntitiesInput,
  SearchKnowledgeInput,
  ToolObservationRefV2,
  ToolResultV2,
} from '../../../contracts/v2'

export async function executeDataToolV2(
  name: DataToolNameV2,
  args: any,
  toolCallId: string,
): Promise<ToolResultV2> {
  const readAt = new Date().toISOString()
  const dataAsOf = readAt

  switch (name) {
    case 'browse_catalog':
      return browseCatalogRepository(args as BrowseCatalogInput, toolCallId)

    case 'resolve_catalog_entities':
      return resolveCatalogEntitiesRepository(args as ResolveCatalogEntitiesInput, toolCallId)

    case 'get_product_details':
      return getProductDetailsRepository(args as GetProductDetailsInput, toolCallId)

    case 'compare_products':
      return compareProductsRepository(args as any, toolCallId)

    case 'get_current_promotions':
      return getCurrentPromotionsRepository(args as GetCurrentPromotionsInput, toolCallId)

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

      const factPointers: FactPointerV2[] = res.items.map((acc: any) => ({
        factRef: `fact-price-${acc.productId}`,
        evidenceId: `ev-acc-${acc.productId}-${readAt}`,
        entityKind: 'PRODUCT',
        entityId: acc.productId,
        factPath: 'price',
      }))

      const observation: ToolObservationRefV2 = {
        observationId: `obs-${toolCallId}`,
        toolCallId,
        outcome: res.items.length > 0 ? 'SUCCESS' : 'NO_MATCH',
        issueCodes: [],
        inputHash: JSON.stringify(input),
        readAt,
      }

      if (res.items.length === 0) {
        return {
          schemaVersion: '2.0',
          toolCallId,
          tool: 'discover_accessories',
          readAt,
          dataAsOf,
          evidence: [],
          observation,
          issues: [],
          appliedBindings: [],
          outcome: 'NO_MATCH',
          data: null,
        }
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
        outcome: 'SUCCESS',
        completeness: 'FULL',
        data: {
          accessories: res.items,
          factPointers,
        },
      }
    }

    case 'search_knowledge': {
      const input = args as SearchKnowledgeInput
      // Knowledge base lookup (mock/placeholder for versioned knowledge chunk until V2-07)
      const observation: ToolObservationRefV2 = {
        observationId: `obs-${toolCallId}`,
        toolCallId,
        outcome: 'NO_MATCH',
        issueCodes: ['KNOWLEDGE_TOPIC_UNAVAILABLE'],
        inputHash: JSON.stringify(input),
        readAt,
      }
      return {
        schemaVersion: '2.0',
        toolCallId,
        tool: 'search_knowledge',
        readAt,
        dataAsOf,
        evidence: [],
        observation,
        issues: [{
          code: 'KNOWLEDGE_TOPIC_UNAVAILABLE',
          severity: 'INFO',
          recovery: 'Tư vấn thông tin xe/phụ kiện hoặc hướng dẫn liên hệ tư vấn viên.',
          message: 'Hệ thống tri thức Fastlane đang được cập nhật.',
        }],
        appliedBindings: [],
        outcome: 'NO_MATCH',
        data: null,
      }
    }

    default: {
      const observation: ToolObservationRefV2 = {
        observationId: `obs-${toolCallId}`,
        toolCallId,
        outcome: 'REJECTED',
        issueCodes: ['UNKNOWN_TOOL'],
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
        issues: [{
          code: 'UNKNOWN_TOOL',
          severity: 'ERROR',
          recovery: 'Chỉ gọi các tool hợp lệ trong registry.',
          message: `Tool ${name} không tồn tại trong V2 registry.`,
        }],
        appliedBindings: [],
        outcome: 'REJECTED',
        data: null,
      }
    }
  }
}
