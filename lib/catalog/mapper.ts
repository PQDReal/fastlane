import type {
  CatalogCategory,
  CatalogCollection,
  CatalogCollectionKind,
  CatalogCollectionMembership,
  CatalogMedia,
  CatalogMediaCollection,
  CatalogMediaRole,
  CatalogMediaType,
  CatalogOptionDisplayType,
  CatalogOptionGroup,
  CatalogOptionValue,
  CatalogProduct,
  CatalogProductContent,
  CatalogAccessoryContentSectionType,
  CatalogProductType,
  CatalogSelectedOption,
  CatalogVariant,
  CatalogVehicleFilterMode,
  CatalogVehicleModel,
} from '@/lib/catalog/types'
import type { CatalogServiceLabel } from '@/lib/catalog/service-labels'

type UnknownRecord = Record<string, unknown>

function record(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as UnknownRecord
    : null
}

function records(value: unknown): UnknownRecord[] {
  if (Array.isArray(value)) return value.map(record).filter((item) => item !== null)
  const item = record(value)
  return item ? [item] : []
}

function firstRecord(value: unknown): UnknownRecord | null {
  return records(value)[0] ?? null
}

function string(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null
}

function number(value: unknown, fallback = 0): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function nullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const parsed = number(value, Number.NaN)
  return Number.isFinite(parsed) ? parsed : null
}

function integer(value: unknown, fallback = 0): number {
  return Math.trunc(number(value, fallback))
}

function object(value: unknown): UnknownRecord {
  return record(value) ?? {}
}

function isActive(row: UnknownRecord): boolean {
  return row.is_active !== false
}

function strings(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return [...new Set(value.flatMap((item) => (
    typeof item === 'string' && item.trim().length > 0 ? [item.trim()] : []
  )))]
}

function mapCategory(value: unknown): CatalogCategory | null {
  const row = firstRecord(value)
  if (!row) return null
  return {
    id: string(row.id),
    name: string(row.name),
    slug: string(row.slug),
  }
}

function collectionKind(value: unknown): CatalogCollectionKind {
  if (value === 'MODEL' || value === 'CAMPAIGN') return value
  return 'CATEGORY'
}

function vehicleFilterMode(value: unknown): CatalogVehicleFilterMode {
  if (value === 'COLLECTION_MEMBERSHIP' || value === 'VERIFIED_FITMENT') return value
  return 'NONE'
}

function vehicleKind(value: unknown): CatalogVehicleModel['vehicleKind'] {
  if (value === 'MOTORBIKE' || value === 'OTHER') return value
  return 'CAR'
}

function mapVehicleModel(value: unknown): CatalogVehicleModel | null {
  const row = firstRecord(value)
  if (!row || !isActive(row)) return null
  return {
    id: string(row.id),
    code: string(row.code),
    slug: string(row.slug),
    name: string(row.name),
    vehicleKind: vehicleKind(row.vehicle_kind),
    metadata: object(row.metadata),
  }
}

function mapCollection(value: unknown): CatalogCollection | null {
  const row = firstRecord(value)
  if (!row || !isActive(row)) return null
  return {
    id: string(row.id),
    parentId: nullableString(row.parent_id),
    kind: collectionKind(row.kind),
    sourceSystem: string(row.source_system),
    sourceKey: string(row.source_key),
    slug: string(row.slug),
    name: string(row.name),
    vehicleFilterMode: vehicleFilterMode(row.vehicle_filter_mode),
    displayOrder: integer(row.display_order),
    metadata: object(row.metadata),
    vehicleModel: mapVehicleModel(row.vehicle_model ?? row.vehicle_models),
  }
}

function mapCollectionMemberships(value: unknown): CatalogCollectionMembership[] {
  return records(value)
    .filter(isActive)
    .flatMap((row) => {
      const collection = mapCollection(row.collection ?? row.catalog_collections)
      if (!collection) return []
      return [{
        id: string(row.id),
        sourceSystem: string(row.source_system),
        isPrimary: row.is_primary === true,
        firstSeenAt: string(row.first_seen_at),
        lastSeenAt: string(row.last_seen_at),
        metadata: object(row.metadata),
        collection,
      }]
    })
    .sort((left, right) => (
      left.collection.displayOrder - right.collection.displayOrder
      || left.collection.id.localeCompare(right.collection.id)
    ))
}

const ACCESSORY_SECTION_TYPES = new Set<CatalogAccessoryContentSectionType>([
  'TECHNICAL_SPECS', 'FEATURES', 'USAGE_GUIDE', 'CARE_GUIDE',
  'INSTALLATION_GUIDE', 'PACKAGE_CONTENTS', 'WARRANTY',
  'SHIPPING_NOTE', 'SAFETY_NOTE', 'PURCHASE_NOTE', 'OTHER',
])

function exactKeys(value: UnknownRecord, expected: string[]): boolean {
  const keys = Object.keys(value).sort()
  const expectedKeys = [...expected].sort()
  return keys.length === expectedKeys.length
    && keys.every((key, index) => key === expectedKeys[index])
}

function mapProductContent(value: unknown): CatalogProductContent {
  const source = record(value)
  if (!source
      || !exactKeys(source, ['schema', 'sections'])
      || source.schema !== 'accessory_content_v1'
      || !Array.isArray(source.sections)) {
    throw new Error('Invalid accessory_content_v1 document.')
  }

  const seenKeys = new Set<string>()
  const sections = source.sections.map((value, index) => {
    const section = record(value)
    const key = section && typeof section.key === 'string' ? section.key : ''
    const type = section?.type
    const title = section && typeof section.title === 'string' ? section.title : ''
    const displayOrder = section ? number(section.display_order, Number.NaN) : Number.NaN
    const body = section?.body === null ? null : nullableString(section?.body)
    const rawItems = section && Array.isArray(section.items) ? section.items : null
    const items = rawItems
      ? rawItems.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      : null
    const rawAttributes = section && Array.isArray(section.attributes) ? section.attributes : null
    const attributes = rawAttributes
      ? rawAttributes.map(record)
      : null

    if (!section
        || !exactKeys(section, ['key', 'type', 'title', 'display_order', 'body', 'items', 'attributes'])
        || !/^[a-z0-9_]+$/.test(key)
        || seenKeys.has(key)
        || !ACCESSORY_SECTION_TYPES.has(type as CatalogAccessoryContentSectionType)
        || !title.trim()
        || !Number.isInteger(displayOrder)
        || displayOrder !== (index + 1) * 10
        || (section.body !== null && body === null)
        || !items
        || items.length !== rawItems?.length
        || !attributes
        || attributes.length !== rawAttributes?.length) {
      throw new Error(`Invalid accessory_content_v1 section at index ${index}.`)
    }

    const mappedAttributes = attributes.map((attribute) => {
      if (!attribute
          || !exactKeys(attribute, ['label', 'value'])
          || typeof attribute.label !== 'string'
          || !attribute.label.trim()
          || typeof attribute.value !== 'string'
          || !attribute.value.trim()) {
        throw new Error(`Invalid accessory_content_v1 attribute in section ${key}.`)
      }
      return { label: attribute.label, value: attribute.value }
    })

    if (body === null && items.length === 0 && mappedAttributes.length === 0) {
      throw new Error(`Empty accessory_content_v1 section ${key}.`)
    }
    seenKeys.add(key)
    return {
      key,
      type: type as CatalogAccessoryContentSectionType,
      title,
      displayOrder,
      body,
      items,
      attributes: mappedAttributes,
    }
  })

  return { schema: 'accessory_content_v1', sections }
}

function mapServiceLabelAssignments(value: unknown): CatalogServiceLabel[] {
  const labels = records(value).flatMap((assignment) => {
    const row = firstRecord(
      assignment.service_label
      ?? assignment.catalog_service_labels
      ?? assignment.label,
    )
    if (!row || !isActive(row)) return []
    return [{
      id: string(row.id),
      code: string(row.code),
      name: string(row.name),
      description: nullableString(row.description),
      displayOrder: integer(row.display_order),
      isActive: true,
      assignmentCount: 0,
    }]
  })

  return [...new Map(labels.map((label) => [label.id, label])).values()]
    .sort((left, right) => (
      left.displayOrder - right.displayOrder
      || left.name.localeCompare(right.name, 'vi-VN')
    ))
}

function optionDisplayType(value: unknown): CatalogOptionDisplayType {
  return value === 'SWATCH' || value === 'SELECT' ? value : 'BUTTON'
}

function mediaRole(value: unknown): CatalogMediaRole {
  switch (value) {
    case 'THUMBNAIL':
    case 'HERO':
    case 'SWATCH':
    case 'DETAIL':
    case 'EXTERIOR':
    case 'INTERIOR':
    case 'TECH':
      return value
    default:
      return 'GALLERY'
  }
}

function mediaType(value: unknown): CatalogMediaType {
  return value === 'VIDEO' ? 'VIDEO' : 'IMAGE'
}

function productType(value: unknown): CatalogProductType {
  return value === 'VEHICLE' ? 'VEHICLE' : 'ACCESSORY'
}

function compareOrdered(
  left: { displayOrder: number; id: string },
  right: { displayOrder: number; id: string },
): number {
  return left.displayOrder - right.displayOrder || left.id.localeCompare(right.id)
}

function mapOptionValue(row: UnknownRecord): CatalogOptionValue {
  return {
    id: string(row.id),
    code: string(row.code),
    name: string(row.name),
    swatchUrl: nullableString(row.swatch_url),
    colorHex: nullableString(row.color_hex),
    priceAdjustment: number(row.price_adjustment),
    displayOrder: integer(row.display_order),
    metadata: object(row.metadata),
  }
}

function mapOptionGroup(row: UnknownRecord): CatalogOptionGroup {
  const minimumSelections = number(row.minimum_selections) >= 1 ? 1 : 0
  return {
    id: string(row.id),
    code: string(row.code),
    name: string(row.name),
    displayType: optionDisplayType(row.display_type),
    minimumSelections,
    maximumSelections: 1,
    displayOrder: integer(row.display_order),
    metadata: object(row.metadata),
    values: records(row.option_values ?? row.values)
      .filter(isActive)
      .map(mapOptionValue)
      .sort(compareOrdered),
  }
}

function mapMedia(row: UnknownRecord): CatalogMedia {
  return {
    id: string(row.id),
    productId: string(row.product_id),
    variantId: nullableString(row.variant_id),
    optionValueId: nullableString(row.option_value_id),
    role: mediaRole(row.role),
    mediaType: mediaType(row.media_type),
    url: string(row.url),
    altText: nullableString(row.alt_text),
    displayOrder: integer(row.display_order),
    metadata: object(row.metadata),
  }
}

function collectMedia(value: unknown): CatalogMediaCollection {
  const collection: CatalogMediaCollection = {
    product: [],
    byVariant: {},
    byOptionValue: {},
  }
  const media = records(value)
    .filter((row) => isActive(row) && string(row.url).trim().length > 0)
    .map(mapMedia)
    .sort(compareOrdered)

  for (const item of media) {
    if (item.variantId) {
      ;(collection.byVariant[item.variantId] ??= []).push(item)
    } else if (item.optionValueId) {
      ;(collection.byOptionValue[item.optionValueId] ??= []).push(item)
    } else {
      collection.product.push(item)
    }
  }
  return collection
}

function availableQuantity(value: unknown): number {
  return records(value).reduce(
    (total, row) => total + Math.max(0, integer(row.on_hand_quantity)),
    0,
  )
}

function selectedOptionDetails(
  mappings: UnknownRecord[],
  groupsById: Map<string, CatalogOptionGroup>,
): CatalogSelectedOption[] {
  const details: CatalogSelectedOption[] = []
  for (const mapping of mappings) {
    const group = groupsById.get(string(mapping.option_group_id))
    const valueId = string(mapping.option_value_id)
    const value = group?.values.find((item) => item.id === valueId)
    if (!group || !value) continue
    details.push({
      groupId: group.id,
      groupCode: group.code,
      groupName: group.name,
      valueId: value.id,
      valueCode: value.code,
      valueName: value.name,
      priceAdjustment: value.priceAdjustment,
    })
  }
  return details.sort((left, right) => {
    const leftGroup = groupsById.get(left.groupId)
    const rightGroup = groupsById.get(right.groupId)
    return (leftGroup?.displayOrder ?? 0) - (rightGroup?.displayOrder ?? 0)
      || left.groupCode.localeCompare(right.groupCode)
  })
}

function mapVariant(
  row: UnknownRecord,
  groupsById: Map<string, CatalogOptionGroup>,
): CatalogVariant {
  const originalPrice = number(row.original_price)
  const salePrice = nullableNumber(row.sale_price)
  const details = selectedOptionDetails(
    records(row.option_mappings ?? row.product_variant_option_values),
    groupsById,
  )
  return {
    id: string(row.id),
    productId: string(row.product_id),
    sku: string(row.sku),
    name: string(row.name),
    originalPrice,
    salePrice,
    effectivePrice: salePrice ?? originalPrice,
    depositAmount: nullableNumber(row.deposit_amount),
    availableQuantity: availableQuantity(row.inventory ?? row.inventory_items),
    optionSignature: nullableString(row.option_signature),
    metadata: object(row.metadata),
    selectedOptions: Object.fromEntries(
      details.map((detail) => [detail.groupCode, detail.valueCode]),
    ),
    selectedOptionDetails: details,
  }
}

/** Maps a nested PostgREST product row to the consumer-facing catalog model. */
export function mapCatalogProduct(value: unknown): CatalogProduct {
  const row = record(value)
  if (!row) throw new Error('Invalid catalog product row.')

  const optionGroups = records(row.option_groups ?? row.product_option_groups)
    .filter(isActive)
    .map(mapOptionGroup)
    .sort(compareOrdered)
  const groupsById = new Map(optionGroups.map((group) => [group.id, group]))
  const variants = records(row.variants ?? row.product_variants)
    .filter(isActive)
    .map((variant) => mapVariant(variant, groupsById))
    .sort((left, right) => left.effectivePrice - right.effectivePrice || left.sku.localeCompare(right.sku))
  const effectivePrices = variants.map((variant) => variant.effectivePrice)

  return {
    id: string(row.id),
    categoryId: nullableString(row.category_id),
    category: mapCategory(row.category ?? row.categories),
    name: string(row.name),
    slug: string(row.slug),
    description: nullableString(row.description),
    productType: productType(row.product_type),
    displayedPrice: nullableNumber(row.displayed_price),
    createdAt: nullableString(row.created_at),
    content: mapProductContent(row.specifications),
    serviceLabels: mapServiceLabelAssignments(
      row.service_label_assignments ?? row.product_service_label_assignments,
    ),
    collectionMemberships: mapCollectionMemberships(
      row.collection_memberships ?? row.product_collection_memberships,
    ),
    legacyImageUrls: strings(row.image_urls),
    optionGroups,
    variants,
    media: collectMedia(row.media ?? row.product_media),
    priceRange: effectivePrices.length > 0
      ? { minimum: Math.min(...effectivePrices), maximum: Math.max(...effectivePrices) }
      : null,
    availableQuantity: variants.reduce(
      (total, variant) => total + variant.availableQuantity,
      0,
    ),
  }
}
