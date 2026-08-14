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
  battery_capacity_kwh: 'Dung lượng pin',
  top_speed_kmh: 'Tốc độ tối đa',
  range_km: 'Quãng đường di chuyển',
  max_power_kw: 'Công suất tối đa',
  power: 'Công suất',
  seats: 'Số chỗ ngồi',
  chargingTime: 'Thời gian sạc',
  topSpeed: 'Tốc độ tối đa',
  range: 'Quãng đường',
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
  const criteriaKeys = input.criteria && input.criteria.length > 0
    ? input.criteria
    : ['price', 'battery_capacity_kwh', 'top_speed_kmh', 'range_km', 'max_power_kw', 'seats']

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

    rows.push({
      criterion: criterionKey,
      label,
      values: products.map((p) => {
        const specFact = (p.specs as any)[criterionKey]
        return {
          productId: p.productId,
          productName: p.name,
          value: specFact ? specFact.displayValue : 'Chưa cập nhật',
          factRef: `fact-spec-${p.productId}-${criterionKey}`,
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
