import {
  normalizeVehicleSpecFactsWithDiagnostics,
  type NormalizedVehicleSpec,
} from '../catalog/vehicle-specifications'

import { CATALOG_SPEC_DEFINITIONS } from './definitions'
import { buildCatalogPersistencePayload, type CatalogPersistenceFact } from './persistence'
import {
  CORE_VEHICLE_SPEC_KEYS,
  type CatalogProductInput,
  type CoreVehicleSpecKey,
} from './types'

export type CatalogShadowStatus =
  | 'MATCH'
  | 'VALUE_MISMATCH'
  | 'LEGACY_ONLY'
  | 'CANONICAL_ONLY'
  | 'CONTEXT_SPLIT'
  | 'CANONICAL_BLOCKED'

export type CatalogShadowFactComparison = {
  canonicalKey: CoreVehicleSpecKey
  status: CatalogShadowStatus
  legacy: null | {
    value: number | string | null
    displayValue: string
    sourcePath: string
  }
  canonical: Array<{
    value: CatalogPersistenceFact['value']
    contextKey: string
    sourcePath: string
  }>
  reason: string
}

export type CatalogShadowProductReport = {
  productId: string
  productName: string
  productType: CatalogProductInput['productType']
  inputHash: string
  sourceReviewDisposition: string | null
  legacyWarningCodes: string[]
  factComparisons: CatalogShadowFactComparison[]
}

export type CatalogShadowKeyReadiness = Record<CoreVehicleSpecKey, {
  match: number
  valueMismatch: number
  legacyOnly: number
  canonicalOnly: number
  contextSplit: number
  canonicalBlocked: number
  readyForCutover: boolean
}>

export type CatalogShadowReport = {
  mode: 'SHADOW_READ_ONLY'
  products: number
  vehicleProducts: number
  accessoryProductsSkipped: number
  sourceBlockedProducts: number
  legacyWarningProducts: number
  factsCompared: number
  matches: number
  valueMismatches: number
  legacyOnly: number
  canonicalOnly: number
  contextSplits: number
  canonicalBlocked: number
  matchRate: number | null
  writes: 0
  keyReadiness: CatalogShadowKeyReadiness
  productReports: CatalogShadowProductReport[]
}

const definitions = new Map(CATALOG_SPEC_DEFINITIONS.map((definition) => [definition.canonicalKey, definition]))

function normalizedDisplay(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/<br\s*\/?\s*>/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function matchesCanonicalValue(key: CoreVehicleSpecKey, legacy: NormalizedVehicleSpec, canonical: CatalogPersistenceFact) {
  const value = canonical.value
  const tolerance = definitions.get(key)?.changeTolerance ?? 0
  if (typeof legacy.value === 'number' && value.numericValue !== null) {
    return Math.abs(legacy.value - value.numericValue) <= tolerance
  }
  if (typeof legacy.value === 'string' && value.textValue !== null) {
    return normalizedDisplay(legacy.value) === normalizedDisplay(value.textValue)
  }
  return normalizedDisplay(legacy.displayValue) === normalizedDisplay(value.displayValue)
}

function comparison(
  key: CoreVehicleSpecKey,
  legacy: NormalizedVehicleSpec | undefined,
  canonical: CatalogPersistenceFact[],
  blocked: boolean,
): CatalogShadowFactComparison | null {
  const legacyValue = legacy ? {
    value: legacy.value,
    displayValue: legacy.displayValue,
    sourcePath: legacy.sourcePath,
  } : null
  const canonicalValues = canonical.map((fact) => ({
    value: fact.value,
    contextKey: fact.contextKey,
    sourcePath: fact.sourcePath,
  }))

  if (blocked) {
    if (!legacy) return null
    return {
      canonicalKey: key,
      status: 'CANONICAL_BLOCKED',
      legacy: legacyValue,
      canonical: [],
      reason: 'Snapshot canonical bị chặn bởi source review; không so sánh hoặc cut-over.',
    }
  }
  if (!legacy && canonical.length === 0) return null
  if (legacy && canonical.length === 0) {
    return {
      canonicalKey: key,
      status: 'LEGACY_ONLY',
      legacy: legacyValue,
      canonical: [],
      reason: 'Legacy reader có fact nhưng canonical planner chưa tạo proposal.',
    }
  }
  if (!legacy) {
    return {
      canonicalKey: key,
      status: 'CANONICAL_ONLY',
      legacy: null,
      canonical: canonicalValues,
      reason: 'Canonical planner có fact mà legacy reader chưa biểu diễn.',
    }
  }
  if (canonical.length > 1) {
    return {
      canonicalKey: key,
      status: 'CONTEXT_SPLIT',
      legacy: legacyValue,
      canonical: canonicalValues,
      reason: 'Canonical planner giữ nhiều context; legacy reader chỉ có một giá trị phẳng.',
    }
  }
  if (matchesCanonicalValue(key, legacy, canonical[0])) {
    return {
      canonicalKey: key,
      status: 'MATCH',
      legacy: legacyValue,
      canonical: canonicalValues,
      reason: 'Legacy và canonical có cùng giá trị trong tolerance đã đăng ký.',
    }
  }
  return {
    canonicalKey: key,
    status: 'VALUE_MISMATCH',
    legacy: legacyValue,
    canonical: canonicalValues,
    reason: 'Legacy và canonical khác giá trị sau chuẩn hóa.',
  }
}

function emptyKeyReadiness(): CatalogShadowKeyReadiness {
  return Object.fromEntries(CORE_VEHICLE_SPEC_KEYS.map((key) => [key, {
    match: 0,
    valueMismatch: 0,
    legacyOnly: 0,
    canonicalOnly: 0,
    contextSplit: 0,
    canonicalBlocked: 0,
    readyForCutover: false,
  }])) as CatalogShadowKeyReadiness
}

export function compareLegacyAndCanonicalCatalog(products: readonly CatalogProductInput[]): CatalogShadowReport {
  const productReports: CatalogShadowProductReport[] = []
  let accessoryProductsSkipped = 0

  for (const product of [...products].sort((left, right) => left.id.localeCompare(right.id))) {
    if (product.productType === 'ACCESSORY') {
      accessoryProductsSkipped += 1
      continue
    }
    const canonicalPayload = buildCatalogPersistencePayload(product)
    const legacy = normalizeVehicleSpecFactsWithDiagnostics(
      product.productType === 'CAR' ? 'CAR' : 'BIKE',
      product.specifications,
      product.updatedAt ?? '1970-01-01T00:00:00.000Z',
    )
    const canonicalByKey = new Map<CoreVehicleSpecKey, CatalogPersistenceFact[]>()
    for (const fact of canonicalPayload.canonicalFacts) {
      if (!(CORE_VEHICLE_SPEC_KEYS as readonly string[]).includes(fact.definitionKey)) continue
      const key = fact.definitionKey as CoreVehicleSpecKey
      canonicalByKey.set(key, [...(canonicalByKey.get(key) ?? []), fact])
    }
    const blocked = canonicalPayload.sourceReview !== null
    const factComparisons = CORE_VEHICLE_SPEC_KEYS
      .map((key) => comparison(key, legacy.facts[key], canonicalByKey.get(key) ?? [], blocked))
      .filter((item): item is CatalogShadowFactComparison => item !== null)

    productReports.push({
      productId: product.id,
      productName: product.name,
      productType: product.productType,
      inputHash: canonicalPayload.inputHash,
      sourceReviewDisposition: canonicalPayload.sourceReview?.disposition ?? null,
      legacyWarningCodes: legacy.warnings.map((warning) => warning.code).sort(),
      factComparisons,
    })
  }

  const comparisons = productReports.flatMap((product) => product.factComparisons)
  const count = (status: CatalogShadowStatus) => comparisons.filter((item) => item.status === status).length
  const matches = count('MATCH')
  const valueMismatches = count('VALUE_MISMATCH')
  const keyReadiness = emptyKeyReadiness()
  for (const item of comparisons) {
    const readiness = keyReadiness[item.canonicalKey]
    if (item.status === 'MATCH') readiness.match += 1
    if (item.status === 'VALUE_MISMATCH') readiness.valueMismatch += 1
    if (item.status === 'LEGACY_ONLY') readiness.legacyOnly += 1
    if (item.status === 'CANONICAL_ONLY') readiness.canonicalOnly += 1
    if (item.status === 'CONTEXT_SPLIT') readiness.contextSplit += 1
    if (item.status === 'CANONICAL_BLOCKED') readiness.canonicalBlocked += 1
  }
  for (const readiness of Object.values(keyReadiness)) {
    readiness.readyForCutover = readiness.match > 0
      && readiness.valueMismatch === 0
      && readiness.legacyOnly === 0
      && readiness.contextSplit === 0
  }

  return {
    mode: 'SHADOW_READ_ONLY',
    products: products.length,
    vehicleProducts: productReports.length,
    accessoryProductsSkipped,
    sourceBlockedProducts: productReports.filter((product) => product.sourceReviewDisposition !== null).length,
    legacyWarningProducts: productReports.filter((product) => product.legacyWarningCodes.length > 0).length,
    factsCompared: comparisons.length,
    matches,
    valueMismatches,
    legacyOnly: count('LEGACY_ONLY'),
    canonicalOnly: count('CANONICAL_ONLY'),
    contextSplits: count('CONTEXT_SPLIT'),
    canonicalBlocked: count('CANONICAL_BLOCKED'),
    matchRate: matches + valueMismatches > 0
      ? matches / (matches + valueMismatches)
      : null,
    writes: 0,
    keyReadiness,
    productReports,
  }
}
