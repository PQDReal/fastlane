import 'server-only'

import { getProductDetailsRepository } from './product-details'
import type {
  CompareProductsInput,
  EvidenceRecord,
  FactPointer,
  ToolObservationRef,
  ToolResult,
} from '../contracts'

export type ComparisonMatrixRow = {
  criterion: string
  label: string
  unit?: string
  values: Array<{
    productId: string
    productName: string
    value: string
    factRef: string
  }>
}

export type CompareProductsData = {
  products: Array<{
    productId: string
    name: string
    slug: string
    thumbnailUrl: string | null
    url: string
    price: number | null
  }>
  rows: ComparisonMatrixRow[]
  highlights: string[]
}

const CRITERIA_LABELS: Record<string, string> = {
  battery_capacity_kwh: 'Thông số pin',
  battery: 'Thông số pin',
  top_speed_kmh: 'Tốc độ tối đa',
  top_speed: 'Tốc độ tối đa',
  topSpeed: 'Tốc độ tối đa',
  range_km: 'Quãng đường di chuyển',
  range: 'Quãng đường di chuyển',
  weight: 'Trọng lượng / Khối lượng',
  max_power_kw: 'Công suất tối đa',
  power: 'Công suất',
  seats: 'Số chỗ ngồi',
  chargingTime: 'Thời gian sạc',
  charging_time: 'Thời gian sạc',
  trunk: 'Thể tích cốp',
  warranty: 'Bảo hành',
  dimensions: 'Kích thước',
}

export async function compareProductsRepository(
  input: CompareProductsInput,
  toolCallId: string = `call-compare-${Date.now()}`,
): Promise<ToolResult<CompareProductsData>> {
  const readAt = new Date().toISOString()
  const dataAsOf = readAt

  const detailsRes = await getProductDetailsRepository({ productIds: input.productIds }, toolCallId)

  if (detailsRes.outcome !== 'SUCCESS') {
    return {
      schemaVersion: '2.0',
      toolCallId,
      tool: 'compare_products',
      readAt,
      dataAsOf,
      evidence: [],
      observation: {
        observationId: `obs-${toolCallId}`,
        toolCallId,
        outcome: detailsRes.outcome,
        issueCodes: detailsRes.issues.map((i) => i.code),
        inputHash: JSON.stringify(input),
        readAt,
      },
      issues: detailsRes.issues,
      appliedBindings: [],
      outcome: detailsRes.outcome,
      data: null as any,
    }
  }

  const products = detailsRes.data.products
  const hasBike = products.some((p) => p.productType === 'BIKE')
  const defaultCriteria = hasBike
    ? ['price', 'battery_capacity_kwh', 'top_speed_kmh', 'range_km', 'weight', 'max_power_kw']
    : ['price', 'battery_capacity_kwh', 'top_speed_kmh', 'range_km', 'max_power_kw', 'seats', 'chargingTime']

  const criteriaKeys = input.criteria && input.criteria.length > 0
    ? input.criteria
    : defaultCriteria

  const rows: ComparisonMatrixRow[] = []

  // Add price row
  rows.push({
    criterion: 'price',
    label: 'Giá khởi điểm',
    unit: 'VNĐ',
    values: products.map((p) => ({
      productId: p.productId,
      productName: p.name,
      value: p.pricing.from ? `${p.pricing.from.toLocaleString('vi-VN')} VNĐ` : 'Liên hệ',
      factRef: `fact-price-${p.productId}`,
    })),
  })

  for (const criterionKey of criteriaKeys) {
    if (criterionKey === 'price') continue
    const label = CRITERIA_LABELS[criterionKey] || criterionKey
    const normKey = criterionKey.toLowerCase().replace(/[-_]/g, '')

    rows.push({
      criterion: criterionKey,
      label,
      values: products.map((p) => {
        let specFact = (p.specs as any)[criterionKey]
        if (!specFact) {
          for (const [k, v] of Object.entries(p.specs)) {
            const nk = k.toLowerCase().replace(/[-_]/g, '')
            if (nk === normKey || k.toLowerCase() === criterionKey.toLowerCase()) {
              specFact = v
              break
            }
          }
        }
        return {
          productId: p.productId,
          productName: p.name,
          value: specFact ? specFact.displayValue : 'Chưa cập nhật',
          factRef: specFact?.factRef || `fact-spec-${p.productId}-${criterionKey}`,
        }
      }),
    })
  }

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
    tool: 'compare_products',
    readAt,
    dataAsOf,
    evidence: detailsRes.evidence,
    observation,
    issues: [],
    appliedBindings: [],
    outcome: 'SUCCESS',
    completeness: 'FULL',
    data: {
      products: products.map((p) => ({
        productId: p.productId,
        name: p.name,
        slug: p.slug,
        thumbnailUrl: p.thumbnailUrl,
        url: p.publication.url,
        price: p.pricing.from,
      })),
      rows,
      highlights: [],
    },
  }
}
