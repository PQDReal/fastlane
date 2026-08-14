import 'server-only'

import { getSupabaseAdmin } from '@/lib/supabase-admin'
import {
  normalizeVehicleSpecFactsWithDiagnostics,
  type VehicleProductType,
} from '@/lib/catalog/vehicle-specifications'
import { salesAgentProductUrl } from '../../navigation/paths'
import { discoverSalesAgentAccessories } from '../accessories'
import type {
  BrowseCatalogInput,
  EvidenceRecord,
  FactPointerV2,
  ProductTypeV2,
  ToolObservationRefV2,
  ToolResultV2,
} from '../../contracts/v2'

export type CatalogProductFactV2 = {
  id: string
  name: string
  slug: string
  url: string
  productType: ProductTypeV2
  isActive: true
  description: string | null
  price: number | null
  facts: Record<string, string>
  dataAsOf: string
  sourceUpdatedAt: string | null
}

export type BrowseCatalogResultData = {
  items: CatalogProductFactV2[]
  total: number
  factPointers: FactPointerV2[]
}

type ProductVariantRow = {
  id: string
  name: string
  sku: string
  original_price: number | string
  sale_price: number | string | null
  deposit_amount?: number | string | null
  updated_at?: string | null
  is_active: boolean
}

type VehicleVariantRow = {
  id: string
  product_variant_id: string | null
  version: string | null
  color: string | null
  image_car_url: string | null
  image_color_url: string | null
  interior_color: string | null
  updated_at?: string | null
  is_active: boolean
}

type ProductRow = {
  id: string
  name: string
  slug: string
  description?: string | null
  product_type: string | null
  displayed_price: number | string | null
  specifications: unknown
  updated_at?: string | null
  is_active: boolean
  product_variants?: ProductVariantRow[]
  vehicle_variants?: VehicleVariantRow[]
}

const PRODUCT_SELECT = 'id,name,slug,description,product_type,displayed_price,specifications,updated_at,is_active,product_variants(id,name,sku,original_price,sale_price,deposit_amount,updated_at,is_active),vehicle_variants(id,product_variant_id,version,color,image_car_url,image_color_url,interior_color,updated_at,is_active)'

function mapProductType(value: string | null): ProductTypeV2 | null {
  const normalized = value?.toUpperCase()
  if (normalized === 'ACCESSORY') return 'ACCESSORY'
  if (normalized === 'BIKE' || normalized === 'MOTORBIKE') return 'BIKE'
  if (normalized === 'CAR' || normalized === 'VEHICLE') return 'CAR'
  return null
}

function mapDatabaseTypes(types?: ProductTypeV2[]): string[] {
  if (!types || types.length === 0) return ['CAR', 'VEHICLE', 'BIKE', 'MOTORBIKE']
  return [...new Set(types.flatMap((t) => {
    if (t === 'BIKE') return ['BIKE', 'MOTORBIKE']
    if (t === 'CAR') return ['CAR', 'VEHICLE']
    return ['ACCESSORY']
  }))]
}

function finiteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function effectivePrice(variant: ProductVariantRow): number | null {
  return finiteNumber(variant.sale_price) ?? finiteNumber(variant.original_price)
}

function toCatalogProductFact(row: ProductRow, dataAsOf: string): CatalogProductFactV2 | null {
  const type = mapProductType(row.product_type)
  if (!type) return null
  const activeVariants = (row.product_variants ?? []).filter((variant) => variant.is_active !== false)
  const prices = activeVariants.map(effectivePrice).filter((value): value is number => value !== null)
  const normalizedSpecs = type === 'ACCESSORY'
    ? {}
    : normalizeVehicleSpecFactsWithDiagnostics(type as VehicleProductType, row.specifications, row.updated_at ?? dataAsOf).facts

  return {
    id: String(row.id),
    name: String(row.name),
    slug: String(row.slug),
    url: salesAgentProductUrl(type, String(row.slug)),
    productType: type,
    isActive: true,
    description: typeof row.description === 'string' ? row.description : null,
    price: prices.length ? Math.min(...prices) : null,
    facts: Object.fromEntries(Object.entries(normalizedSpecs).flatMap(([key, fact]) => fact ? [[key, fact.displayValue]] : [])),
    dataAsOf,
    sourceUpdatedAt: row.updated_at ?? null,
  }
}

export async function browseCatalogRepository(
  input: BrowseCatalogInput,
  toolCallId: string,
): Promise<ToolResultV2<BrowseCatalogResultData>> {
  const readAt = new Date().toISOString()
  const dataAsOf = readAt
  const limit = Math.min(20, Math.max(1, input.page?.limit ?? 8))
  const requestedTypes = input.productTypes?.length ? input.productTypes : undefined

  // Handle ACCESSORY only browse
  if (requestedTypes?.length === 1 && requestedTypes[0] === 'ACCESSORY') {
    const accResult = await discoverSalesAgentAccessories({
      minPrice: input.price?.min,
      maxPrice: input.price?.max,
      limit,
    })

    const items: CatalogProductFactV2[] = accResult.items.map((acc) => ({
      id: acc.productId,
      name: acc.name,
      slug: acc.slug,
      url: acc.url,
      productType: 'ACCESSORY',
      isActive: true,
      description: acc.description,
      price: acc.price,
      facts: acc.facts,
      dataAsOf,
      sourceUpdatedAt: acc.sourceUpdatedAt,
    }))

    const evidence: EvidenceRecord[] = items.map((item) => ({
      evidenceId: `ev-${item.id}-${readAt}`,
      source: { system: 'SUPABASE', resource: 'accessories' },
      entity: { kind: 'PRODUCT', id: item.id },
      facts: [
        { factRef: `fact-price-${item.id}`, factPath: 'price', valueHash: String(item.price) },
      ],
      readAt,
      sourceUpdatedAt: item.sourceUpdatedAt ?? undefined,
    }))

    const factPointers: FactPointerV2[] = items.map((item) => ({
      factRef: `fact-price-${item.id}`,
      evidenceId: `ev-${item.id}-${readAt}`,
      entityKind: 'PRODUCT',
      entityId: item.id,
      factPath: 'price',
    }))

    const observation: ToolObservationRefV2 = {
      observationId: `obs-${toolCallId}`,
      toolCallId,
      outcome: items.length > 0 ? 'SUCCESS' : 'NO_MATCH',
      issueCodes: [],
      inputHash: JSON.stringify(input),
      readAt,
    }

    if (items.length === 0) {
      return {
        schemaVersion: '2.0',
        toolCallId,
        tool: 'browse_catalog',
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
      tool: 'browse_catalog',
      readAt,
      dataAsOf,
      evidence,
      observation,
      issues: [],
      appliedBindings: [],
      outcome: 'SUCCESS',
      completeness: 'FULL',
      data: {
        items,
        total: items.length,
        factPointers,
      },
    }
  }

  const client = getSupabaseAdmin()
  const dbTypes = mapDatabaseTypes(requestedTypes)
  let queryBuilder = client
    .from('products')
    .select(PRODUCT_SELECT)
    .eq('is_active', true)
    .in('product_type', dbTypes)

  if (input.price?.min !== undefined) {
    queryBuilder = queryBuilder.gte('displayed_price', input.price.min)
  }
  if (input.price?.max !== undefined) {
    queryBuilder = queryBuilder.lte('displayed_price', input.price.max)
  }

  // Sort query
  const sortField = input.sort?.field ?? 'PRICE'
  const sortDirection = input.sort?.direction ?? 'ASC'
  if (sortField === 'PRICE') {
    queryBuilder = queryBuilder.order('displayed_price', { ascending: sortDirection === 'ASC' })
  } else if (sortField === 'NAME') {
    queryBuilder = queryBuilder.order('name', { ascending: sortDirection === 'ASC' })
  } else {
    queryBuilder = queryBuilder.order('updated_at', { ascending: sortDirection === 'ASC' })
  }

  queryBuilder = queryBuilder.limit(50)

  const { data, error } = await queryBuilder
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
      tool: 'browse_catalog',
      readAt,
      dataAsOf,
      evidence: [],
      observation,
      issues: [{
        code: 'DATA_SOURCE_ERROR',
        severity: 'ERROR',
        recovery: 'Thử lại sau ít phút hoặc nới lỏng điều kiện lọc.',
        message: `Lỗi đọc catalog: ${error.message}`,
      }],
      appliedBindings: [],
      outcome: 'UNAVAILABLE',
      data: null,
    }
  }

  const rawRows = (data ?? []) as unknown as ProductRow[]
  const candidateFacts = rawRows
    .map((row) => toCatalogProductFact(row, dataAsOf))
    .filter((item): item is CatalogProductFactV2 => Boolean(item))
    .filter((item) => {
      if (input.price?.min !== undefined && item.price !== null && item.price < input.price.min) return false
      if (input.price?.max !== undefined && item.price !== null && item.price > input.price.max) return false
      return true
    })

  // Sort in-memory if effective prices differ from displayed prices
  if (sortField === 'PRICE') {
    candidateFacts.sort((a, b) => {
      const pA = a.price ?? Number.MAX_SAFE_INTEGER
      const pB = b.price ?? Number.MAX_SAFE_INTEGER
      return sortDirection === 'ASC' ? pA - pB : pB - pA
    })
  }

  const items = candidateFacts.slice(0, limit)
  const evidence: EvidenceRecord[] = items.map((item) => ({
    evidenceId: `ev-${item.id}-${readAt}`,
    source: { system: 'SUPABASE', resource: 'products' },
    entity: { kind: 'PRODUCT', id: item.id },
    facts: [
      { factRef: `fact-price-${item.id}`, factPath: 'price', valueHash: String(item.price) },
      { factRef: `fact-name-${item.id}`, factPath: 'name', valueHash: item.name },
    ],
    readAt,
    sourceUpdatedAt: item.sourceUpdatedAt ?? undefined,
  }))

  const factPointers: FactPointerV2[] = items.map((item) => ({
    factRef: `fact-price-${item.id}`,
    evidenceId: `ev-${item.id}-${readAt}`,
    entityKind: 'PRODUCT',
    entityId: item.id,
    factPath: 'price',
  }))

  const observation: ToolObservationRefV2 = {
    observationId: `obs-${toolCallId}`,
    toolCallId,
    outcome: items.length > 0 ? 'SUCCESS' : 'NO_MATCH',
    issueCodes: [],
    inputHash: JSON.stringify(input),
    readAt,
  }

  if (items.length === 0) {
    return {
      schemaVersion: '2.0',
      toolCallId,
      tool: 'browse_catalog',
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
    tool: 'browse_catalog',
    readAt,
    dataAsOf,
    evidence,
    observation,
    issues: [],
    appliedBindings: [],
    outcome: 'SUCCESS',
    completeness: 'FULL',
    data: {
      items,
      total: items.length,
      factPointers,
    },
  }
}
