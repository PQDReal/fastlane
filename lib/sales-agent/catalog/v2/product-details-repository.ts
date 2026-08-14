import 'server-only'

import { getSupabaseAdmin } from '@/lib/supabase-admin'
import {
  normalizeVehicleSpecFactsWithDiagnostics,
  type NormalizedVehicleSpec,
  type VehicleProductType,
  type VehicleSpecKey,
} from '@/lib/catalog/vehicle-specifications'
import { salesAgentProductUrl } from '../../navigation/paths'
import type {
  EvidenceRecord,
  FactPointerV2,
  GetProductDetailsInput,
  ProductTypeV2,
  ToolObservationRefV2,
  ToolResultV2,
} from '../../contracts/v2'

export type ProductDetailConfigurationV2 = {
  id: string
  version: string | null
  color: string | null
  interiorColor: string | null
  imageUrl: string | null
  swatchUrl: string | null
}

export type ProductDetailVariantV2 = {
  id: string
  name: string
  sku: string
  price: number | null
  depositAmount: number | null
  configurations: ProductDetailConfigurationV2[]
}

export type ProductDetailSnapshotV2 = {
  productId: string
  productType: ProductTypeV2
  name: string
  slug: string
  url: string
  isActive: true
  description: string | null
  pricing: { from: number | null; currency: 'VND' }
  specs: Partial<Record<VehicleSpecKey, NormalizedVehicleSpec>>
  variants: ProductDetailVariantV2[]
  sourceUpdatedAt: string | null
  warnings: Array<{ code: string; message: string }>
}

export type GetProductDetailsResultData = {
  products: ProductDetailSnapshotV2[]
  factPointers: FactPointerV2[]
}

const PRODUCT_SELECT = 'id,name,slug,description,product_type,displayed_price,specifications,updated_at,is_active,product_variants(id,name,sku,original_price,sale_price,deposit_amount,updated_at,is_active),vehicle_variants(id,product_variant_id,version,color,image_car_url,image_color_url,interior_color,updated_at,is_active)'

function mapProductType(value: string | null): ProductTypeV2 {
  const normalized = value?.toUpperCase()
  if (normalized === 'ACCESSORY') return 'ACCESSORY'
  if (normalized === 'BIKE' || normalized === 'MOTORBIKE') return 'BIKE'
  return 'CAR'
}

function finiteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function effectivePrice(variant: { sale_price?: unknown; original_price?: unknown }): number | null {
  return finiteNumber(variant.sale_price) ?? finiteNumber(variant.original_price)
}

function toVehicleSnapshot(row: any, dataAsOf: string): ProductDetailSnapshotV2 {
  const type = mapProductType(row.product_type)
  const variants = (row.product_variants ?? []).filter((variant: any) => variant.is_active !== false)
  const configurations = (row.vehicle_variants ?? []).filter((cfg: any) => cfg.is_active !== false)
  const sourceUpdatedAt = row.updated_at ?? null
  const specResult = type === 'ACCESSORY'
    ? { facts: {}, warnings: [] }
    : normalizeVehicleSpecFactsWithDiagnostics(type as VehicleProductType, row.specifications, sourceUpdatedAt ?? dataAsOf)

  const snapshotVariants: ProductDetailVariantV2[] = variants.map((variant: any) => ({
    id: String(variant.id),
    name: String(variant.name),
    sku: String(variant.sku),
    price: effectivePrice(variant),
    depositAmount: finiteNumber(variant.deposit_amount),
    configurations: configurations
      .filter((cfg: any) => cfg.product_variant_id === variant.id)
      .map((cfg: any) => ({
        id: String(cfg.id),
        version: cfg.version ?? null,
        color: cfg.color ?? null,
        interiorColor: cfg.interior_color ?? null,
        imageUrl: cfg.image_car_url ?? cfg.image_color_url ?? null,
        swatchUrl: cfg.image_color_url ?? null,
      })),
  }))

  const prices = snapshotVariants.map((v) => v.price).filter((p): p is number => p !== null)

  return {
    productId: String(row.id),
    productType: type,
    name: String(row.name),
    slug: String(row.slug),
    url: salesAgentProductUrl(type, String(row.slug)),
    isActive: true,
    description: typeof row.description === 'string' ? row.description : null,
    pricing: { from: prices.length ? Math.min(...prices) : null, currency: 'VND' },
    specs: specResult.facts,
    variants: snapshotVariants,
    sourceUpdatedAt,
    warnings: specResult.warnings,
  }
}

export async function getProductDetailsRepository(
  input: GetProductDetailsInput,
  toolCallId: string,
): Promise<ToolResultV2<GetProductDetailsResultData>> {
  const readAt = new Date().toISOString()
  const dataAsOf = readAt
  const ids = [...new Set(input.productIds)].slice(0, 3)

  if (!ids.length) {
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
      tool: 'get_product_details',
      readAt,
      dataAsOf,
      evidence: [],
      observation,
      issues: [{
        code: 'INVALID_ARGUMENT',
        severity: 'ERROR',
        recovery: 'Cung cấp ít nhất 1 product ID hợp lệ.',
        message: 'Danh sách product IDs không được để trống.',
      }],
      appliedBindings: [],
      outcome: 'REJECTED',
      data: null,
    }
  }

  const client = getSupabaseAdmin()
  const { data, error } = await client
    .from('products')
    .select(PRODUCT_SELECT)
    .eq('is_active', true)
    .in('id', ids)

  if (error) {
    const observation: ToolObservationRefV2 = {
      observationId: `obs-${toolCallId}`,
      toolCallId,
      outcome: 'UNAVAILABLE',
      issueCodes: ['DATA_SOURCE_ERROR'],
      inputHash: JSON.stringify(input),
      readAt,
    }
    return {
      schemaVersion: '2.0',
      toolCallId,
      tool: 'get_product_details',
      readAt,
      dataAsOf,
      evidence: [],
      observation,
      issues: [{
        code: 'DATA_SOURCE_ERROR',
        severity: 'ERROR',
        recovery: 'Thử lại sau ít phút.',
        message: `Lỗi đọc chi tiết sản phẩm: ${error.message}`,
      }],
      appliedBindings: [],
      outcome: 'UNAVAILABLE',
      data: null,
    }
  }

  const rows = (data ?? []) as any[]
  const products = rows.map((r) => toVehicleSnapshot(r, dataAsOf))

  if (products.length === 0) {
    const observation: ToolObservationRefV2 = {
      observationId: `obs-${toolCallId}`,
      toolCallId,
      outcome: 'NO_MATCH',
      issueCodes: ['UNKNOWN_ENTITY_REFERENCE'],
      inputHash: JSON.stringify(input),
      readAt,
    }
    return {
      schemaVersion: '2.0',
      toolCallId,
      tool: 'get_product_details',
      readAt,
      dataAsOf,
      evidence: [],
      observation,
      issues: [{
        code: 'UNKNOWN_ENTITY_REFERENCE',
        severity: 'WARNING',
        recovery: 'Kiểm tra lại ID hoặc tra cứu lại tên xe.',
        message: 'Không tìm thấy thông tin cho các product IDs được yêu cầu.',
      }],
      appliedBindings: [],
      outcome: 'NO_MATCH',
      data: null,
    }
  }

  const evidence: EvidenceRecord[] = products.map((p) => ({
    evidenceId: `ev-detail-${p.productId}-${readAt}`,
    source: { system: 'SUPABASE', resource: 'products' },
    entity: { kind: 'PRODUCT', id: p.productId },
    facts: [
      { factRef: `fact-price-${p.productId}`, factPath: 'pricing.from', valueHash: String(p.pricing.from) },
      { factRef: `fact-name-${p.productId}`, factPath: 'name', valueHash: p.name },
      { factRef: `fact-slug-${p.productId}`, factPath: 'slug', valueHash: p.slug },
      ...Object.entries(p.specs).map(([specKey, specFact]) => ({
        factRef: `fact-spec-${p.productId}-${specKey}`,
        factPath: `specs.${specKey}`,
        valueHash: String(specFact?.displayValue ?? ''),
      })),
    ],
    readAt,
    sourceUpdatedAt: p.sourceUpdatedAt ?? undefined,
  }))

  const factPointers: FactPointerV2[] = products.flatMap((p) => [
    {
      factRef: `fact-price-${p.productId}`,
      evidenceId: `ev-detail-${p.productId}-${readAt}`,
      entityKind: 'PRODUCT' as const,
      entityId: p.productId,
      factPath: 'pricing.from',
    },
    {
      factRef: `fact-name-${p.productId}`,
      evidenceId: `ev-detail-${p.productId}-${readAt}`,
      entityKind: 'PRODUCT' as const,
      entityId: p.productId,
      factPath: 'name',
    },
    ...Object.keys(p.specs).map((specKey) => ({
      factRef: `fact-spec-${p.productId}-${specKey}`,
      evidenceId: `ev-detail-${p.productId}-${readAt}`,
      entityKind: 'PRODUCT' as const,
      entityId: p.productId,
      factPath: `specs.${specKey}`,
    })),
  ])

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
    tool: 'get_product_details',
    readAt,
    dataAsOf,
    evidence,
    observation,
    issues: [],
    appliedBindings: [],
    outcome: 'SUCCESS',
    completeness: products.length === ids.length ? 'FULL' : 'PARTIAL',
    data: {
      products,
      factPointers,
    },
  }
}
