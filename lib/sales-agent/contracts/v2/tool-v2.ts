import { z } from 'zod'
import { agentResponsePlanV2Schema, factPointerV2Schema, toolObservationRefV2Schema, type ToolObservationRefV2 } from './response-v2'
import { interactionIntentV2Schema } from './interaction-v2'
import { productTypeV2Schema, type ProductTypeV2 } from './turn-v2'

export const priceRangeV2Schema = z.object({
  currency: z.literal('VND').default('VND'),
  min: z.number().min(0).optional(),
  max: z.number().min(0).optional(),
})
export type PriceRangeV2 = z.infer<typeof priceRangeV2Schema>

export const pageInputV2Schema = z.object({
  limit: z.number().int().min(1).max(50).optional().default(8),
  cursor: z.string().trim().optional(),
})
export type PageInputV2 = z.infer<typeof pageInputV2Schema>

// Data Tool Inputs
export const browseCatalogInputSchema = z.object({
  productTypes: z.array(productTypeV2Schema).optional(),
  price: priceRangeV2Schema.optional(),
  sort: z.object({
    field: z.enum(['PRICE', 'NAME', 'UPDATED_AT']).default('PRICE'),
    direction: z.enum(['ASC', 'DESC']).default('ASC'),
  }).optional(),
  page: pageInputV2Schema.optional(),
})
export type BrowseCatalogInput = z.infer<typeof browseCatalogInputSchema>

export const resolveReferenceSchema = z.object({
  clientRef: z.string().trim().min(1),
  mention: z.string().trim().min(1),
  kindHint: z.enum(['PRODUCT', 'ACCESSORY_CATEGORY']).optional(),
  productTypes: z.array(productTypeV2Schema).optional(),
})
export type ResolveReference = z.infer<typeof resolveReferenceSchema>

export const resolveCatalogEntitiesInputSchema = z.object({
  references: z.array(resolveReferenceSchema).min(1).max(5),
  candidateLimit: z.number().int().min(1).max(10).optional().default(3),
})
export type ResolveCatalogEntitiesInput = z.input<typeof resolveCatalogEntitiesInputSchema>

export const getProductDetailsInputSchema = z.object({
  productIds: z.array(z.string().trim().min(1)).min(1).max(3),
  sections: z.array(z.enum([
    'PRICING',
    'SPECIFICATIONS',
    'VARIANTS',
    'DESCRIPTION',
    'PUBLICATION',
  ])).optional(),
})
export type GetProductDetailsInput = z.infer<typeof getProductDetailsInputSchema>

export const compareProductsInputSchema = z.object({
  productIds: z.array(z.string().trim().min(1)).min(2).max(3),
  criteria: z.array(z.string().trim().min(1)).optional(),
})
export type CompareProductsInput = z.infer<typeof compareProductsInputSchema>

export const getCurrentPromotionsInputSchema = z.object({
  scope: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('ALL_PUBLIC') }),
    z.object({ kind: z.literal('PRODUCT_TYPES'), productTypes: z.array(productTypeV2Schema).min(1) }),
    z.object({ kind: z.literal('PRODUCTS'), productIds: z.array(z.string().trim().min(1)).min(1) }),
  ]).default({ kind: 'ALL_PUBLIC' }),
  page: pageInputV2Schema.optional(),
})
export type GetCurrentPromotionsInput = z.infer<typeof getCurrentPromotionsInputSchema>

export const discoverAccessoriesInputSchema = z.object({
  mode: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('BROWSE') }),
    z.object({ kind: z.literal('BY_CATEGORIES'), categoryIds: z.array(z.string().trim().min(1)).min(1) }),
    z.object({
      kind: z.literal('FOR_PRODUCT'),
      productId: z.string().trim().min(1),
      categoryIds: z.array(z.string().trim().min(1)).optional(),
      compatibilityPolicy: z.enum(['VERIFIED_ONLY', 'INCLUDE_UNVERIFIED']).default('INCLUDE_UNVERIFIED'),
    }),
  ]).default({ kind: 'BROWSE' }),
  price: priceRangeV2Schema.optional(),
  page: pageInputV2Schema.optional(),
})
export type DiscoverAccessoriesInput = z.infer<typeof discoverAccessoriesInputSchema>

export const searchKnowledgeInputSchema = z.object({
  question: z.string().trim().min(1).max(500),
  topics: z.array(z.string().trim()).optional(),
  limit: z.number().int().min(1).max(10).optional().default(3),
})
export type SearchKnowledgeInput = z.infer<typeof searchKnowledgeInputSchema>

// Terminal Tool Inputs
export const submitResponseInputSchema = agentResponsePlanV2Schema
export type SubmitResponseInput = z.infer<typeof submitResponseInputSchema>

export const requestUserInputInputSchema = interactionIntentV2Schema
export type RequestUserInputInput = z.infer<typeof requestUserInputInputSchema>

// Evidence & Issue contracts
export const evidenceRecordSchema = z.object({
  evidenceId: z.string().trim().min(1),
  source: z.object({
    system: z.enum(['SUPABASE', 'CATALOG_SERVICE', 'KNOWLEDGE_STORE']),
    resource: z.string(),
  }),
  entity: z.object({
    kind: z.enum(['PRODUCT', 'VARIANT', 'PROMOTION', 'ACCESSORY_CATEGORY', 'KNOWLEDGE_CHUNK']),
    id: z.string(),
  }),
  facts: z.array(z.object({
    factRef: z.string(),
    factPath: z.string(),
    valueHash: z.string(),
  })),
  readAt: z.string().datetime(),
  sourceUpdatedAt: z.string().datetime().optional(),
})
export type EvidenceRecord = z.infer<typeof evidenceRecordSchema>

export const toolIssueSchema = z.object({
  code: z.string(),
  severity: z.enum(['INFO', 'WARNING', 'ERROR']),
  recovery: z.string(),
  path: z.string().optional(),
  message: z.string(),
})
export type ToolIssue = z.infer<typeof toolIssueSchema>

export const appliedBindingSchema = z.object({
  field: z.string(),
  value: z.any(),
  authority: z.enum(['ENFORCED', 'CONFIRMED', 'HINT']),
  provenance: z.object({
    kind: z.string(),
    id: z.string().optional(),
  }),
})
export type AppliedBinding = z.infer<typeof appliedBindingSchema>

export type ToolOutcomeV2 = 'SUCCESS' | 'NO_MATCH' | 'NEEDS_INPUT' | 'REJECTED' | 'UNAVAILABLE'

export type ToolResultV2<TSuccess = any, TNeedsInput = any, TNoMatch = any> = {
  schemaVersion: '2.0'
  toolCallId: string
  tool: string
  readAt: string
  dataAsOf?: string
  evidence: EvidenceRecord[]
  observation: ToolObservationRefV2
  issues: ToolIssue[]
  appliedBindings: AppliedBinding[]
} & (
  | { outcome: 'SUCCESS'; completeness: 'FULL' | 'PARTIAL'; data: TSuccess }
  | { outcome: 'NO_MATCH'; data: TNoMatch }
  | { outcome: 'NEEDS_INPUT'; data: TNeedsInput }
  | { outcome: 'REJECTED'; data: null }
  | { outcome: 'UNAVAILABLE'; data: null; retryAfterMs?: number }
)

export const DATA_TOOL_NAMES_V2 = [
  'browse_catalog',
  'resolve_catalog_entities',
  'get_product_details',
  'compare_products',
  'get_current_promotions',
  'discover_accessories',
  'search_knowledge',
] as const
export type DataToolNameV2 = typeof DATA_TOOL_NAMES_V2[number]

export const TERMINAL_TOOL_NAMES_V2 = [
  'submit_response',
  'request_user_input',
] as const
export type TerminalToolNameV2 = typeof TERMINAL_TOOL_NAMES_V2[number]

export type ToolNameV2 = DataToolNameV2 | TerminalToolNameV2

export const TOOL_CONTRACTS: Record<DataToolNameV2, {
  name: DataToolNameV2
  description: string
  inputSchema: z.ZodType<any>
}> = {
  browse_catalog: {
    name: 'browse_catalog',
    description: 'Duyệt danh sách sản phẩm (ô tô điện, xe máy điện, phụ kiện) theo bộ lọc phân loại, khoảng giá hoặc sắp xếp. Dùng khi người dùng muốn xem danh sách sản phẩm, bảng giá tổng quan hoặc tìm xe theo ngân sách. KHÔNG dùng cho tìm kiếm tên model cụ thể.',
    inputSchema: browseCatalogInputSchema,
  },
  resolve_catalog_entities: {
    name: 'resolve_catalog_entities',
    description: 'Tra cứu canonical ID từ tên model xe hoặc phụ kiện do người dùng nhắc đến (ví dụ: VF 8, VF 5, Evo 200, Klara S). Chỉ truyền tên model ngắn vào mention. Kết quả trả về ID chính xác để dùng tiếp cho các tool xem chi tiết hoặc so sánh.',
    inputSchema: resolveCatalogEntitiesInputSchema,
  },
  get_product_details: {
    name: 'get_product_details',
    description: 'Lấy thông tin chi tiết, thông số kỹ thuật, các phiên bản và giá của 1 đến 3 sản phẩm theo canonical product IDs.',
    inputSchema: getProductDetailsInputSchema,
  },
  compare_products: {
    name: 'compare_products',
    description: 'So sánh thông số kỹ thuật và giá giữa 2 hoặc 3 sản phẩm theo canonical product IDs.',
    inputSchema: compareProductsInputSchema,
  },
  get_current_promotions: {
    name: 'get_current_promotions',
    description: 'Lấy các chương trình khuyến mãi, ưu đãi hiện hành của Fastlane theo loại sản phẩm hoặc theo sản phẩm cụ thể.',
    inputSchema: getCurrentPromotionsInputSchema,
  },
  discover_accessories: {
    name: 'discover_accessories',
    description: 'Khám phá phụ kiện theo danh mục hoặc theo mẫu xe tương thích (VF 3, VF 5, VF 8...).',
    inputSchema: discoverAccessoriesInputSchema,
  },
  search_knowledge: {
    name: 'search_knowledge',
    description: 'Tìm kiếm chính sách, quy trình, thủ tục (sạc pin, bảo hành, đăng ký lái thử, thủ tục trả góp) trong kho kiến thức Fastlane.',
    inputSchema: searchKnowledgeInputSchema,
  },
}
