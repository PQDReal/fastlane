import type { CatalogProductInput, CatalogProductType, ExtractionResult, RawSpecObservation } from './types'

type JsonRecord = Record<string, unknown>

const CAR_TECHNICAL_SECTIONS = new Set(['dimension', 'exterior', 'interior', 'powertrain', 'safety', 'adas'])
const HIDDEN_MOTORBIKE_KEYS = new Set(['url', 'name', 'product_type', 'catalog', 'marketing', 'gallery', 'landing_page_blocks'])

function asRecord(value: unknown): JsonRecord | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : null
}

function sourceUri(root: JsonRecord | null) {
  return typeof root?.url === 'string' && root.url.trim() ? root.url.trim() : null
}

function scalar(value: unknown): value is string | number | boolean {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
}

function flattenScalarLeaves(value: JsonRecord, prefix = ''): Array<{ path: string; key: string; value: string | number | boolean }> {
  const leaves: Array<{ path: string; key: string; value: string | number | boolean }> = []
  for (const key of Object.keys(value).sort((left, right) => left.localeCompare(right, 'vi'))) {
    const child = value[key]
    const path = prefix ? `${prefix}.${key}` : key
    if (scalar(child)) {
      if (String(child).trim()) leaves.push({ path, key, value: child })
      continue
    }
    const record = asRecord(child)
    if (record) leaves.push(...flattenScalarLeaves(record, path))
  }
  return leaves
}

function observation(input: CatalogProductInput, data: Omit<RawSpecObservation, 'productId' | 'productName' | 'productType'>): RawSpecObservation {
  return { productId: input.id, productName: input.name, productType: input.productType, ...data }
}

function extractCar(input: CatalogProductInput): ExtractionResult {
  const root = asRecord(input.specifications)
  const versions = asRecord(root?.specs)
  const uri = sourceUri(root)
  const observations: RawSpecObservation[] = []

  if (versions) {
    for (const versionName of Object.keys(versions).sort((left, right) => left.localeCompare(right, 'vi'))) {
      const wrapper = asRecord(versions[versionName])
      const detail = asRecord(wrapper?.specs)
      if (!detail) continue
      for (const sectionName of Object.keys(detail).sort()) {
        if (!CAR_TECHNICAL_SECTIONS.has(sectionName)) continue
        const section = asRecord(detail[sectionName])
        if (!section) continue
        for (const leaf of flattenScalarLeaves(section, sectionName)) {
          observations.push(observation(input, {
            productVariantId: null,
            sourceVariantKey: versionName,
            sourceSchema: 'fastlane_car_nested_v1',
            sourcePath: `specs.${versionName}.specs.${leaf.path}`,
            rawKey: leaf.key,
            rawValue: leaf.value,
            sourceUri: uri,
          }))
        }
      }
    }
  }

  if (observations.length === 0) {
    const flat = asRecord(root?.specifications_flat)
    if (flat) {
      for (const leaf of flattenScalarLeaves(flat)) {
        observations.push(observation(input, {
          productVariantId: null,
          sourceVariantKey: null,
          sourceSchema: 'fastlane_car_flat_v1',
          sourcePath: `specifications_flat.${leaf.path}`,
          rawKey: leaf.key,
          rawValue: leaf.value,
          sourceUri: uri,
        }))
      }
    }
  }

  return observations.length
    ? { observations, warnings: [] }
    : { observations: [], warnings: [{ code: 'UNSUPPORTED_SPEC_SCHEMA', productId: input.id, message: 'Không tìm thấy vùng thông số kỹ thuật CAR được hỗ trợ.' }] }
}

function extractMotorbike(input: CatalogProductInput): ExtractionResult {
  const root = asRecord(input.specifications)
  const detail = asRecord(root?.specs) ?? root
  if (!detail) return { observations: [], warnings: [{ code: 'UNSUPPORTED_SPEC_SCHEMA', productId: input.id, message: 'Thông số MOTORBIKE không phải object.' }] }

  const technicalDetail = Object.fromEntries(
    Object.entries(detail).filter(([key]) => !key.startsWith('_') && !HIDDEN_MOTORBIKE_KEYS.has(key)),
  )
  const observations = flattenScalarLeaves(technicalDetail)
    .filter((leaf) => !leaf.key.startsWith('_') && !HIDDEN_MOTORBIKE_KEYS.has(leaf.key))
    .map((leaf) => observation(input, {
      productVariantId: null,
      sourceVariantKey: null,
      sourceSchema: root?.specs ? 'fastlane_motorbike_nested_v1' : 'fastlane_motorbike_flat_v1',
      sourcePath: `${root?.specs ? 'specs.' : ''}${leaf.path}`,
      rawKey: leaf.key,
      rawValue: leaf.value,
      sourceUri: sourceUri(root),
    }))

  return observations.length
    ? { observations, warnings: [] }
    : { observations: [], warnings: [{ code: 'UNSUPPORTED_SPEC_SCHEMA', productId: input.id, message: 'Không có scalar kỹ thuật MOTORBIKE để extract.' }] }
}

function extractAccessory(input: CatalogProductInput): ExtractionResult {
  const root = asRecord(input.specifications)
  const flat = asRecord(root?.specifications_flat)
  if (!flat) {
    return { observations: [], warnings: [{ code: 'UNSUPPORTED_PRODUCT_TYPE', productId: input.id, message: 'ACCESSORY chưa có technical extractor được đăng ký; dữ liệu được fail-closed.' }] }
  }
  const observations = flattenScalarLeaves(flat).map((leaf) => observation(input, {
    productVariantId: null,
    sourceVariantKey: null,
    sourceSchema: 'fastlane_accessory_flat_v1',
    sourcePath: `specifications_flat.${leaf.path}`,
    rawKey: leaf.key,
    rawValue: leaf.value,
    sourceUri: sourceUri(root),
  }))
  return { observations, warnings: [] }
}

export function canonicalProductType(value: string | null | undefined): CatalogProductType | null {
  const normalized = value?.trim().toUpperCase()
  if (normalized === 'CAR' || normalized === 'VEHICLE') return 'CAR'
  if (normalized === 'BIKE' || normalized === 'MOTORBIKE') return 'MOTORBIKE'
  if (normalized === 'ACCESSORY') return 'ACCESSORY'
  return null
}

export function extractProductSpecifications(input: CatalogProductInput): ExtractionResult {
  if (input.productType === 'CAR') return extractCar(input)
  if (input.productType === 'MOTORBIKE') return extractMotorbike(input)
  return extractAccessory(input)
}
