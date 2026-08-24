import { z } from 'zod'
import { agentResponsePlanSchema, factPointerSchema, toolObservationRefSchema, type ToolObservationRef } from './response'
import { interactionIntentSchema } from './interaction'
import { productTypeSchema, type ProductType } from './turn'

export const priceRangeSchema = z.object({
  currency: z.literal('VND').default('VND'),
  min: z.number().min(0).optional(),
  max: z.number().min(0).optional(),
})
export type PriceRange = z.infer<typeof priceRangeSchema>

export const pageInputSchema = z.object({
  limit: z.number().int().min(1).max(50).optional().default(8),
  cursor: z.string().trim().optional(),
})
export type PageInput = z.infer<typeof pageInputSchema>

// Data Tool Inputs
export const browseCatalogInputSchema = z.object({
  productTypes: z.array(productTypeSchema).optional(),
  price: priceRangeSchema.optional(),
  sort: z.object({
    field: z.enum(['PRICE', 'NAME', 'UPDATED_AT']).default('PRICE'),
    direction: z.enum(['ASC', 'DESC']).default('ASC'),
  }).optional(),
  page: pageInputSchema.optional(),
})
export type BrowseCatalogInput = z.infer<typeof browseCatalogInputSchema>

export const resolveReferenceSchema = z.object({
  clientRef: z.string().trim().min(1),
  mention: z.string().trim().min(1),
  kindHint: z.enum(['PRODUCT', 'ACCESSORY_CATEGORY']).optional(),
  productTypes: z.array(productTypeSchema).optional(),
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
  productTypes: z.array(productTypeSchema).optional(),
  productIds: z.array(z.string().trim().min(1)).optional(),
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
  price: priceRangeSchema.optional(),
  page: pageInputSchema.optional(),
})
export type DiscoverAccessoriesInput = z.infer<typeof discoverAccessoriesInputSchema>

export const searchKnowledgeInputSchema = z.object({
  query: z.string().trim().min(1).max(200),
  categories: z.array(z.enum([
    'PURCHASE_POLICY',
    'WARRANTY_POLICY',
    'BATTERY_POLICY',
    'CHARGING_NETWORK',
    'REGISTRATION_PROCEDURE',
  ])).optional(),
  topK: z.number().int().min(1).max(5).default(3),
})
export type SearchKnowledgeInput = z.infer<typeof searchKnowledgeInputSchema>

export const searchUserManualsInputSchema = z.object({
  query: z.string().trim().min(1).max(200),
  modelSeries: z.string().trim().optional().describe('Dòng xe người dùng đang sử dụng, vd: VF 5, VF 8'),
  year: z.number().int().optional().describe('Đời xe người dùng đang sử dụng, vd: 2024'),
  topK: z.number().int().min(1).max(5).default(3),
})
export type SearchUserManualsInput = z.infer<typeof searchUserManualsInputSchema>

export const afterSalesVehicleTypeSchema = z.enum(['car', 'motorbike', 'bus'])
export type AfterSalesVehicleType = z.infer<typeof afterSalesVehicleTypeSchema>

export const searchAfterSalesInputSchema = z.object({
  serviceType: z.enum(['warranty', 'maintenance', 'repair', 'rescue'])
    .describe('Luồng hậu mãi cần tra cứu.'),
  vehicleType: afterSalesVehicleTypeSchema.optional()
    .describe('Loại xe nếu người dùng đã nêu: car, motorbike hoặc bus.'),
  model: z.string().trim().min(1).max(80).optional()
    .describe('Tên dòng xe nếu có, ví dụ VF 8 hoặc President.'),
  query: z.string().trim().min(1).max(300)
    .describe('Nguyên văn phần câu hỏi về hậu mãi để repository xếp hạng facts.'),
  topK: z.number().int().min(1).max(10).default(6)
    .describe('Số nhóm facts tối đa cần trả về.'),
})
export type SearchAfterSalesInput = z.infer<typeof searchAfterSalesInputSchema>

export const findServiceLocationsInputSchema = z.object({
  vehicleType: afterSalesVehicleTypeSchema.optional()
    .describe('Loại xe cần phục vụ nếu người dùng đã nêu.'),
  category: z.enum([
    'official_car_workshop',
    'partner_car_workshop',
    'electric_motorbike_workshop',
  ]).optional().describe('Loại xưởng nếu cần giới hạn chính xác.'),
  province: z.string().trim().min(1).max(100).optional()
    .describe('Tỉnh/thành người dùng yêu cầu, ví dụ Hồ Chí Minh.'),
  district: z.string().trim().min(1).max(100).optional()
    .describe('Quận/huyện/phường nếu người dùng yêu cầu.'),
  query: z.string().trim().min(1).max(300)
    .describe('Nguyên văn phần câu hỏi về địa điểm dịch vụ.'),
  limit: z.number().int().min(1).max(20).default(8),
})
export type FindServiceLocationsInput = z.infer<typeof findServiceLocationsInputSchema>

// Terminal Tool Inputs
export const submitResponseInputSchema = z.object({
  plan: agentResponsePlanSchema,
})
export type SubmitResponseInput = z.infer<typeof submitResponseInputSchema>

export const requestUserInputInputSchema = z.object({
  interaction: interactionIntentSchema,
  rationale: z.string().trim().min(1),
})
export type RequestUserInputInput = z.infer<typeof requestUserInputInputSchema>

// Evidence & Issue Schemas
export const evidenceRecordSchema = z.object({
  evidenceId: z.string().trim().min(1),
  source: z.object({
    system: z.enum(['SUPABASE', 'MEMORY', 'UPSTREAM_API']),
    resource: z.string().trim().min(1),
  }),
  entity: z.object({
    kind: z.enum([
      'PRODUCT',
      'PROMOTION',
      'KNOWLEDGE_SNIPPET',
      'ORDER',
      'AFTER_SALES_FACT',
      'SERVICE_LOCATION',
    ]),
    id: z.string().trim().min(1),
  }),
  facts: z.array(z.object({
    factRef: z.string().trim().min(1),
    factPath: z.string().trim().min(1),
    valueHash: z.string().trim().min(1),
  })).min(1),
  readAt: z.string().datetime(),
  sourceUpdatedAt: z.string().datetime().optional(),
})
export type EvidenceRecord = z.infer<typeof evidenceRecordSchema>

export const toolIssueSchema = z.object({
  code: z.enum([
    'CONSTRAINT_CONFLICT',
    'AMBIGUOUS_REFERENCE',
    'UNKNOWN_ENTITY_REFERENCE',
    'RESOURCE_UNAVAILABLE',
    'RATE_LIMITED',
    'INVALID_TOOL_ARGUMENTS',
  ]),
  message: z.string().trim().min(1),
  field: z.string().optional(),
  candidates: z.array(z.unknown()).optional(),
})
export type ToolIssue = z.infer<typeof toolIssueSchema>

export const appliedBindingSchema = z.object({
  field: z.string().trim().min(1),
  value: z.unknown(),
  authority: z.enum(['ENFORCED', 'CONFIRMED']),
  provenance: z.object({
    kind: z.enum(['SIGNED_INTERACTION', 'BUSINESS_INVARIANT', 'PAGE_CONTEXT']),
    id: z.string().optional(),
  }),
})
export type AppliedBinding = z.infer<typeof appliedBindingSchema>

export type ToolOutcome = 'SUCCESS' | 'NO_MATCH' | 'NEEDS_INPUT' | 'REJECTED' | 'UNAVAILABLE'

export type ToolResult<TSuccess = any, TNeedsInput = any, TNoMatch = any> = {
  schemaVersion: '2.0'
  toolCallId: string
  tool: string
  readAt: string
  dataAsOf?: string
  evidence: EvidenceRecord[]
  observation: ToolObservationRef
  issues: ToolIssue[]
  appliedBindings: AppliedBinding[]
} & (
  | { outcome: 'SUCCESS'; completeness: 'FULL' | 'PARTIAL'; data: TSuccess }
  | { outcome: 'NO_MATCH'; data: TNoMatch }
  | { outcome: 'NEEDS_INPUT'; data: TNeedsInput }
  | { outcome: 'REJECTED'; data: null }
  | { outcome: 'UNAVAILABLE'; data: null; retryAfterMs?: number }
)

export const DATA_TOOL_NAMES = [
  'browse_catalog',
  'resolve_catalog_entities',
  'get_product_details',
  'compare_products',
  'get_current_promotions',
  'discover_accessories',
  'search_knowledge',
  'search_user_manuals',
  'search_after_sales',
  'find_service_locations',
] as const
export type DataToolName = typeof DATA_TOOL_NAMES[number]

export const TERMINAL_TOOL_NAMES = [
  'submit_response',
  'request_user_input',
] as const
export type TerminalToolName = typeof TERMINAL_TOOL_NAMES[number]

export const TOOL_CONTRACTS: Record<DataToolName, { description: string; inputSchema: z.ZodTypeAny }> = {
  browse_catalog: {
    description: 'Duyệt và phân trang danh mục sản phẩm FASTLANE (ô tô, xe máy, phụ kiện) theo loại và khoảng giá. Không dùng chuỗi search query tự do.',
    inputSchema: browseCatalogInputSchema,
  },
  resolve_catalog_entities: {
    description: 'Tra cứu canonical product ID và metadata theo tên ngắn, slug hoặc alias do người dùng nhập.',
    inputSchema: resolveCatalogEntitiesInputSchema,
  },
  get_product_details: {
    description: 'Lấy thông số kỹ thuật, phiên bản và giá khởi điểm chi tiết theo danh sách canonical product IDs đã resolve.',
    inputSchema: getProductDetailsInputSchema,
  },
  compare_products: {
    description: 'So sánh bảng thông số kỹ thuật và giá bán giữa 2-3 sản phẩm theo danh sách canonical product IDs.',
    inputSchema: compareProductsInputSchema,
  },
  get_current_promotions: {
    description: 'Lấy danh sách các chương trình khuyến mãi và ưu đãi hiện hành của FASTLANE.',
    inputSchema: getCurrentPromotionsInputSchema,
  },
  discover_accessories: {
    description: 'Tìm kiếm danh sách phụ kiện chính hãng, hỗ trợ lọc theo danh mục hoặc độ tương thích với mẫu xe.',
    inputSchema: discoverAccessoriesInputSchema,
  },
  search_knowledge: {
    description: 'Tra cứu tài liệu tri thức, cẩm nang kỹ thuật, thông số xe, chính sách bảo hành, thuê/mua pin, trạm sạc và quy trình mua bán xe điện FASTLANE.',
    inputSchema: searchKnowledgeInputSchema,
  },
  search_user_manuals: {
    description: 'Tra cứu Hướng dẫn sử dụng xe (vị trí cổng sạc, ý nghĩa đèn cảnh báo, cách khởi động, v.v.). Bắt buộc phải có thông tin năm sản xuất trước khi gọi.',
    inputSchema: searchUserManualsInputSchema,
  },
  search_after_sales: {
    description: 'Tra cứu facts hậu mãi đã được admin duyệt và publish: bảo hành ô tô, lịch bảo dưỡng ô tô/xe máy điện, quy định sửa chữa và thời gian cứu hộ. Dùng query nguyên văn để giữ đúng ngữ cảnh; bảo hành pin xe máy điện vẫn dùng search_knowledge.',
    inputSchema: searchAfterSalesInputSchema,
  },
  find_service_locations: {
    description: 'Tìm xưởng dịch vụ VinFast đã được duyệt theo loại xe, loại xưởng, tỉnh/thành hoặc quận/huyện; trả địa chỉ, liên hệ, giờ hoạt động và đường đi.',
    inputSchema: findServiceLocationsInputSchema,
  },
}
