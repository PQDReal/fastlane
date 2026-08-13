import type { SalesAgentProductType } from '../catalog/context'
import { SALES_AGENT_COMPARE_CRITERIA, type SalesAgentCompareCriteria } from './criteria'

export const SALES_AGENT_TOOL_NAMES = [
  'resolve_vehicle_references',
  'request_user_choice',
  'search_catalog',
  'get_vehicle_details',
  'compare_vehicles',
  'get_current_promotions',
  'discover_accessories',
] as const

export type SalesAgentToolName = (typeof SALES_AGENT_TOOL_NAMES)[number]

export type SalesAgentToolStatus =
  | 'OK'
  | 'PARTIAL'
  | 'NOT_FOUND'
  | 'AMBIGUOUS'
  | 'UNAVAILABLE'

export type SalesAgentToolWarning = {
  code: string
  message: string
}

export type SalesAgentToolEvidence = {
  source: string
  entityIds: string[]
  updatedAt?: string
}

export type SalesAgentToolEnvelope<T> = {
  schemaVersion: '1.0'
  status: SalesAgentToolStatus
  data: T | null
  readAt: string
  dataAsOf: string | null
  evidence: SalesAgentToolEvidence[]
  warnings: SalesAgentToolWarning[]
}

export type SalesAgentToolCall =
  | {
      name: 'resolve_vehicle_references'
      arguments: { query: string; limit?: number }
    }
  | {
      name: 'request_user_choice'
      arguments: {
        slot: 'vehicles' | 'vehicle' | 'criteria' | 'budget' | 'usage'
        mode: 'single' | 'multiple'
        minSelections: number
        maxSelections: number
        allowFreeText?: boolean
        productType?: SalesAgentProductType
      }
    }
  | {
      name: 'search_catalog'
      arguments: {
        query?: string
        productTypes?: SalesAgentProductType[]
        minPrice?: number
        maxPrice?: number
        stockFilter?: 'ALL' | 'IN_STOCK'
        limit?: number
      }
    }
  | { name: 'get_vehicle_details'; arguments: { productId: string } }
  | { name: 'compare_vehicles'; arguments: { productIds: string[]; criteria?: SalesAgentCompareCriteria[] } }
  | {
      name: 'get_current_promotions'
      arguments: { productType?: SalesAgentProductType }
    }
  | {
      name: 'discover_accessories'
      arguments: {
        query?: string
        vehicleProductId?: string
        minPrice?: number
        maxPrice?: number
        stockFilter?: 'ALL' | 'IN_STOCK'
        limit?: number
      }
    }

export type SalesAgentToolResult<T = unknown> = SalesAgentToolEnvelope<T> & {
  tool: SalesAgentToolName
}

export const SALES_AGENT_TOOL_DEFINITIONS = [
  {
    name: 'resolve_vehicle_references',
    description: 'Xác định tên các mẫu xe trong câu hỏi thành product UUID thật từ catalog active. Luôn dùng tool này trước khi gọi get_vehicle_details hoặc compare_vehicles nếu chưa có UUID tin cậy.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['query'],
      properties: {
        query: { type: 'string', minLength: 1, maxLength: 300 },
        limit: { type: 'integer', minimum: 1, maximum: 3 },
      },
    },
  },
  {
    name: 'request_user_choice',
    description: 'Yêu cầu UI hiển thị lựa chọn có cấu trúc khi còn thiếu slot; server sẽ tự dựng option từ catalog hoặc allowlist. Không dùng để tạo product ID hay dữ liệu tùy ý.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['slot', 'mode', 'minSelections', 'maxSelections'],
      properties: {
        slot: { type: 'string', enum: ['vehicles', 'vehicle', 'criteria', 'budget', 'usage'] },
        mode: { type: 'string', enum: ['single', 'multiple'] },
        minSelections: { type: 'integer', minimum: 0, maximum: 8 },
        maxSelections: { type: 'integer', minimum: 1, maximum: 8 },
        allowFreeText: { type: 'boolean' },
        productType: { type: 'string', enum: ['CAR', 'BIKE', 'ACCESSORY'] },
      },
    },
  },
  {
    name: 'search_catalog',
    description: 'Tìm xe hoặc phụ kiện đang hoạt động trong catalog Fastlane theo nhu cầu, tên và ngân sách.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        query: { type: 'string', maxLength: 300 },
        productTypes: { type: 'array', maxItems: 3, items: { type: 'string', enum: ['CAR', 'BIKE', 'ACCESSORY'] } },
        minPrice: { type: 'number', minimum: 0 },
        maxPrice: { type: 'number', minimum: 0 },
        stockFilter: { type: 'string', enum: ['ALL', 'IN_STOCK'] },
        limit: { type: 'integer', minimum: 1, maximum: 20 },
      },
    },
  },
  {
    name: 'get_vehicle_details',
    description: 'Lấy giá, tồn kho, phiên bản và thông số chuẩn hóa của một mẫu xe bằng product UUID.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['productId'],
      properties: { productId: { type: 'string', format: 'uuid' } },
    },
  },
  {
    name: 'compare_vehicles',
    description: 'Đối chiếu dữ liệu của từ hai đến ba mẫu xe bằng product UUID.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['productIds'],
      properties: {
        productIds: { type: 'array', minItems: 2, maxItems: 3, items: { type: 'string', format: 'uuid' } },
        criteria: { type: 'array', minItems: 1, maxItems: 6, items: { type: 'string', enum: SALES_AGENT_COMPARE_CRITERIA } },
      },
    },
  },
  {
    name: 'get_current_promotions',
    description: 'Liệt kê khuyến mãi công khai đang hiệu lực theo loại sản phẩm; chỉ là phạm vi cấp loại sản phẩm.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: { productType: { type: 'string', enum: ['CAR', 'BIKE', 'ACCESSORY'] } },
    },
  },
  {
    name: 'discover_accessories',
    description: 'Khám phá phụ kiện active theo catalog association; không đảm bảo tương thích kỹ thuật.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        query: { type: 'string', maxLength: 300 },
        vehicleProductId: { type: 'string', format: 'uuid' },
        minPrice: { type: 'number', minimum: 0 },
        maxPrice: { type: 'number', minimum: 0 },
        stockFilter: { type: 'string', enum: ['ALL', 'IN_STOCK'] },
        limit: { type: 'integer', minimum: 1, maximum: 20 },
      },
    },
  },
] as const

const PRODUCT_TYPES: SalesAgentProductType[] = ['CAR', 'BIKE', 'ACCESSORY']
// PostgreSQL UUID accepts any hexadecimal UUID layout; it does not require
// RFC 4122 version/variant bits. Keep the shape strict without rejecting
// canonical IDs imported from existing catalog data.
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Tool arguments phải là JSON object.')
  }
  return value as Record<string, unknown>
}

function exactKeys(input: Record<string, unknown>, allowed: string[]) {
  const unexpected = Object.keys(input).find((key) => !allowed.includes(key))
  if (unexpected) throw new Error(`Tool argument ${unexpected} không được hỗ trợ.`)
}

function optionalText(value: unknown, field: string, maxLength: number) {
  if (value === undefined) return undefined
  if (typeof value !== 'string') throw new Error(`${field} không hợp lệ.`)
  const trimmed = value.trim()
  if (trimmed.length > maxLength) throw new Error(`${field} quá dài.`)
  return trimmed || undefined
}

function requiredText(value: unknown, field: string, maxLength: number) {
  const text = optionalText(value, field, maxLength)
  if (!text) throw new Error(`${field} không được để trống.`)
  return text
}

function uuid(value: unknown, field: string) {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value.trim())) {
    throw new Error(`${field} phải là UUID canonical.`)
  }
  return value.trim()
}

function boundedLimit(value: unknown, fallback: number) {
  if (value === undefined) return fallback
  if (!Number.isInteger(value) || Number(value) < 1) throw new Error('limit không hợp lệ.')
  return Math.min(20, Number(value))
}

function boundedPrice(value: unknown, field: string) {
  if (value === undefined) return undefined
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new Error(`${field} không hợp lệ.`)
  }
  return value
}

function productTypes(value: unknown) {
  if (value === undefined) return undefined
  if (!Array.isArray(value) || value.length < 1 || value.length > PRODUCT_TYPES.length) {
    throw new Error('productTypes không hợp lệ.')
  }
  const values = value.map((item) => String(item))
  if (values.some((item) => !PRODUCT_TYPES.includes(item as SalesAgentProductType))) {
    throw new Error('productTypes không hợp lệ.')
  }
  return [...new Set(values)] as SalesAgentProductType[]
}

function compareCriteria(value: unknown) {
  if (value === undefined) return undefined
  if (!Array.isArray(value) || value.length < 1 || value.length > SALES_AGENT_COMPARE_CRITERIA.length) {
    throw new Error('criteria không hợp lệ.')
  }
  const values = value.map((item) => String(item))
  if (values.some((item) => !SALES_AGENT_COMPARE_CRITERIA.includes(item as SalesAgentCompareCriteria))) {
    throw new Error('criteria không hợp lệ.')
  }
  return [...new Set(values)] as SalesAgentCompareCriteria[]
}

function stockFilter(value: unknown) {
  if (value === undefined) return 'ALL' as const
  if (value !== 'ALL' && value !== 'IN_STOCK') throw new Error('stockFilter không hợp lệ.')
  return value
}

function assertPriceRange(minPrice: number | undefined, maxPrice: number | undefined) {
  if (minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice) {
    throw new Error('Khoảng giá không hợp lệ.')
  }
}

export function parseSalesAgentToolCall(name: string, value: unknown): SalesAgentToolCall {
  const input = record(value)

  if (name === 'resolve_vehicle_references') {
    exactKeys(input, ['query', 'limit'])
    return {
      name,
      arguments: {
        query: requiredText(input.query, 'query', 300),
        limit: Math.min(3, boundedLimit(input.limit, 3)),
      },
    }
  }

  if (name === 'request_user_choice') {
    exactKeys(input, ['slot', 'mode', 'minSelections', 'maxSelections', 'allowFreeText', 'productType'])
    const slot = String(input.slot)
    const mode = String(input.mode)
    const minSelections = input.minSelections
    const maxSelections = input.maxSelections
    if (!['vehicles', 'vehicle', 'criteria', 'budget', 'usage'].includes(slot)) throw new Error('slot không hợp lệ.')
    if (mode !== 'single' && mode !== 'multiple') throw new Error('mode không hợp lệ.')
    if (!Number.isInteger(minSelections) || !Number.isInteger(maxSelections) || Number(minSelections) < 0 || Number(maxSelections) < 1 || Number(maxSelections) > 8 || Number(maxSelections) < Number(minSelections)) {
      throw new Error('Giới hạn lựa chọn không hợp lệ.')
    }
    if (mode === 'single' && (Number(minSelections) !== 1 || Number(maxSelections) !== 1)) throw new Error('single phải có đúng một lựa chọn.')
    const productType = input.productType === undefined ? undefined : String(input.productType)
    if (productType !== undefined && !PRODUCT_TYPES.includes(productType as SalesAgentProductType)) throw new Error('productType không hợp lệ.')
    return {
      name,
      arguments: {
        slot: slot as 'vehicles' | 'vehicle' | 'criteria' | 'budget' | 'usage',
        mode: mode as 'single' | 'multiple',
        minSelections: Number(minSelections),
        maxSelections: Number(maxSelections),
        allowFreeText: input.allowFreeText === true,
        productType: productType as SalesAgentProductType | undefined,
      },
    }
  }

  if (name === 'search_catalog') {
    exactKeys(input, ['query', 'productTypes', 'minPrice', 'maxPrice', 'stockFilter', 'limit'])
    const minPrice = boundedPrice(input.minPrice, 'minPrice')
    const maxPrice = boundedPrice(input.maxPrice, 'maxPrice')
    assertPriceRange(minPrice, maxPrice)
    return {
      name,
      arguments: {
        query: optionalText(input.query, 'query', 300),
        productTypes: productTypes(input.productTypes),
        minPrice,
        maxPrice,
        stockFilter: stockFilter(input.stockFilter),
        limit: boundedLimit(input.limit, 8),
      },
    }
  }

  if (name === 'get_vehicle_details') {
    exactKeys(input, ['productId'])
    return { name, arguments: { productId: uuid(input.productId, 'productId') } }
  }

  if (name === 'compare_vehicles') {
    exactKeys(input, ['productIds', 'criteria'])
    if (!Array.isArray(input.productIds) || input.productIds.length < 2 || input.productIds.length > 3) {
      throw new Error('productIds cần từ 2 đến 3 xe.')
    }
    const productIds = input.productIds.map((item) => uuid(item, 'productIds'))
    if (new Set(productIds).size !== productIds.length) throw new Error('productIds không được trùng.')
    const criteria = compareCriteria(input.criteria)
    return { name, arguments: { productIds, ...(criteria ? { criteria } : {}) } }
  }

  if (name === 'get_current_promotions') {
    exactKeys(input, ['productType'])
    const productType = input.productType === undefined ? undefined : String(input.productType)
    if (productType !== undefined && !PRODUCT_TYPES.includes(productType as SalesAgentProductType)) {
      throw new Error('productType không hợp lệ.')
    }
    return { name, arguments: { productType: productType as SalesAgentProductType | undefined } }
  }

  if (name === 'discover_accessories') {
    exactKeys(input, ['query', 'vehicleProductId', 'minPrice', 'maxPrice', 'stockFilter', 'limit'])
    const minPrice = boundedPrice(input.minPrice, 'minPrice')
    const maxPrice = boundedPrice(input.maxPrice, 'maxPrice')
    assertPriceRange(minPrice, maxPrice)
    return {
      name,
      arguments: {
        query: optionalText(input.query, 'query', 300),
        vehicleProductId: input.vehicleProductId === undefined ? undefined : uuid(input.vehicleProductId, 'vehicleProductId'),
        minPrice,
        maxPrice,
        stockFilter: stockFilter(input.stockFilter),
        limit: boundedLimit(input.limit, 8),
      },
    }
  }

  throw new Error('Tool không được hỗ trợ.')
}
