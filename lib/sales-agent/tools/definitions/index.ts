import 'server-only'

import { browseCatalogRepository } from '../../catalog/browse'
import { resolveCatalogEntitiesRepository } from '../../catalog/identity'
import { getProductDetailsRepository } from '../../catalog/product-details'
import { compareProductsRepository } from '../../catalog/comparison'
import { getCurrentPromotionsRepository } from '../../catalog/promotions'
import { discoverSalesAgentAccessories } from '../../catalog/accessories'
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
      const knowledgeFacts = [
        {
          id: 'policy-warranty-car',
          title: 'Chính sách bảo hành ô tô điện VinFast',
          content: 'Bảo hành chính hãng 10 năm hoặc 200.000 km (tùy điều kiện nào đến trước) cho các dòng xe VF 8, VF 9, VF 7, VF 6, VF 5, VF e34. Pin cao áp bảo hành 10 năm không giới hạn số km.',
        },
        {
          id: 'policy-battery-subscription',
          title: 'Chính sách thuê pin & mua pin',
          content: 'Khách hàng có thể lựa chọn mua xe kèm pin hoặc thuê pin theo gói linh hoạt/cố định hàng tháng. Pin được bảo hành/thay mới miễn phí khi dung lượng nạp xả tối đa dưới 70%.',
        },
        {
          id: 'charging-stations-vgreen',
          title: 'Hệ thống trạm sạc V-Green toàn quốc',
          content: 'Mạng lưới trạm sạc phủ khắp 63 tỉnh thành, các tuyến cao tốc, quốc lộ, trung tâm thương mại và khu đô thị lớn với công suất sạc nhanh từ 30kW đến 250kW.',
        },
      ]

      const matched = knowledgeFacts.filter((k) =>
        k.title.toLowerCase().includes(input.query.toLowerCase())
        || k.content.toLowerCase().includes(input.query.toLowerCase())
        || input.query.toLowerCase().includes('pin') && k.id.includes('battery')
        || input.query.toLowerCase().includes('bảo hành') && k.id.includes('warranty')
        || input.query.toLowerCase().includes('sạc') && k.id.includes('charging'),
      )

      const results = matched.length > 0 ? matched : knowledgeFacts.slice(0, 2)

      const evidence: EvidenceRecord[] = results.map((k) => ({
        evidenceId: `ev-kb-${k.id}-${readAt}`,
        source: { system: 'MEMORY', resource: 'knowledge' },
        entity: { kind: 'KNOWLEDGE_SNIPPET', id: k.id },
        facts: [
          { factRef: `fact-kb-title-${k.id}`, factPath: 'title', valueHash: k.title },
          { factRef: `fact-kb-content-${k.id}`, factPath: 'content', valueHash: k.content },
        ],
        readAt,
      }))

      const observation: ToolObservationRef = {
        observationId: `obs-${toolCallId}`,
        toolCallId,
        outcome: 'SUCCESS',
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
        outcome: 'SUCCESS',
        completeness: 'FULL',
        data: {
          snippets: results,
        },
      }
    }
  }
}
