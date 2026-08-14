import 'server-only'

import { getProductDetailsRepository, type ProductDetailSnapshotV2 } from './product-details-repository'
import { SALES_AGENT_COMPARE_CRITERIA } from '../../contracts/criteria'
import type {
  CompareProductsInput,
  EvidenceRecord,
  FactPointerV2,
  ToolObservationRefV2,
  ToolResultV2,
} from '../../contracts/v2'

export type ComparisonRowV2 = {
  criterion: string
  label: string
  unit?: string
  values: Array<{
    productId: string
    productName: string
    value: string | null
    factRef?: string
  }>
}

export type CompareProductsResultData = {
  products: Array<{ id: string; name: string; slug: string; price: number | null; url: string }>
  headers: string[]
  rows: ComparisonRowV2[]
  factPointers: FactPointerV2[]
}

export async function compareProductsRepository(
  input: CompareProductsInput,
  toolCallId: string,
): Promise<ToolResultV2<CompareProductsResultData>> {
  const readAt = new Date().toISOString()
  const dataAsOf = readAt
  const productIds = [...new Set(input.productIds)].slice(0, 3)

  if (productIds.length < 2) {
    const observation: ToolObservationRefV2 = {
      observationId: `obs-${toolCallId}`,
      toolCallId,
      outcome: 'REJECTED',
      issueCodes: ['INVALID_ARGUMENT'],
      inputHash: JSON.stringify(input),
      readAt,
    }
    return {
      schemaVersion: '2.0',
      toolCallId,
      tool: 'compare_products',
      readAt,
      dataAsOf,
      evidence: [],
      observation,
      issues: [{
        code: 'INVALID_ARGUMENT',
        severity: 'ERROR',
        recovery: 'Cung cấp ít nhất 2 product IDs để so sánh.',
        message: 'So sánh sản phẩm yêu cầu tối thiểu 2 mẫu xe.',
      }],
      appliedBindings: [],
      outcome: 'REJECTED',
      data: null,
    }
  }

  const detailResult = await getProductDetailsRepository({ productIds }, toolCallId)
  if (detailResult.outcome !== 'SUCCESS') {
    return {
      schemaVersion: '2.0',
      toolCallId,
      tool: 'compare_products',
      readAt,
      dataAsOf,
      evidence: detailResult.evidence,
      observation: {
        ...detailResult.observation,
        toolCallId,
      },
      issues: detailResult.issues,
      appliedBindings: [],
      outcome: detailResult.outcome,
      data: null,
    }
  }

  const products: ProductDetailSnapshotV2[] = detailResult.data.products
  if (products.length < 2) {
    return {
      schemaVersion: '2.0',
      toolCallId,
      tool: 'compare_products',
      readAt,
      dataAsOf,
      evidence: detailResult.evidence,
      observation: {
        observationId: `obs-${toolCallId}`,
        toolCallId,
        outcome: 'NO_MATCH',
        issueCodes: ['INSUFFICIENT_COMPARE_PRODUCTS'],
        inputHash: JSON.stringify(input),
        readAt,
      },
      issues: [{
        code: 'INSUFFICIENT_COMPARE_PRODUCTS',
        severity: 'WARNING',
        recovery: 'Chọn thêm mẫu xe khác để thực hiện so sánh.',
        message: 'Chỉ tìm thấy 1 mẫu xe hợp lệ, cần ít nhất 2 mẫu để so sánh.',
      }],
      appliedBindings: [],
      outcome: 'NO_MATCH',
      data: null,
    }
  }

  const criteriaKeys = input.criteria?.length ? input.criteria : ['price', 'range', 'power', 'chargingTime', 'seats', 'topSpeed']
  const headers = ['Tiêu chí', ...products.map((p) => p.name)]

  const rows: ComparisonRowV2[] = []

  // Add Price row
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

  const observation: ToolObservationRefV2 = {
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
    evidence: detailResult.evidence,
    observation,
    issues: [],
    appliedBindings: [],
    outcome: 'SUCCESS',
    completeness: 'FULL',
    data: {
      products: products.map((p) => ({
        id: p.productId,
        name: p.name,
        slug: p.slug,
        price: p.pricing.from,
        url: p.url,
      })),
      headers,
      rows,
      factPointers: detailResult.data.factPointers,
    },
  }
}
