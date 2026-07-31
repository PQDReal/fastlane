import {
  ACCESSORY_OPTION_PRESETS,
  type AdminAccessoryDraft,
  type DraftContentSection,
  type DraftOptionGroup,
  type DraftVariant,
} from '@/lib/catalog/admin-accessory-draft'
import type { AdminAccessoryEditorData } from '@/lib/catalog/admin-accessory-write'

type UnknownRecord = Record<string, unknown>

function record(value: unknown): UnknownRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as UnknownRecord
    : null
}

function records(value: unknown): UnknownRecord[] {
  if (Array.isArray(value)) return value.map(record).filter((item) => item !== null)
  const item = record(value)
  return item ? [item] : []
}

function firstRecord(value: unknown) {
  return records(value)[0] ?? null
}

function text(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback
}

function nullableText(value: unknown) {
  return typeof value === 'string' && value.trim() ? value : null
}

function integer(value: unknown, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback
}

function isActive(value: UnknownRecord) {
  return value.is_active !== false
}

function metadata(value: unknown) {
  return record(value) ?? {}
}

function ordered(left: UnknownRecord, right: UnknownRecord) {
  return integer(left.display_order) - integer(right.display_order)
    || text(left.id).localeCompare(text(right.id))
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : []
}

function mapSections(value: unknown): DraftContentSection[] {
  const document = record(value)
  if (!document || document.schema !== 'accessory_content_v1' || !Array.isArray(document.sections)) return []
  return document.sections.flatMap((entry, sectionIndex) => {
    const section = record(entry)
    if (!section || typeof section.type !== 'string') return []
    const rawAttributes = Array.isArray(section.attributes) ? section.attributes : []
    return [{
      id: text(section.key, `section_${sectionIndex + 1}`),
      type: section.type as DraftContentSection['type'],
      title: text(section.title),
      body: nullableText(section.body) ?? '',
      itemsText: stringArray(section.items).join('\n'),
      attributes: rawAttributes.flatMap((entry, attributeIndex) => {
        const attribute = record(entry)
        return attribute ? [{
          id: `${text(section.key, `section_${sectionIndex + 1}`)}_attribute_${attributeIndex + 1}`,
          label: text(attribute.label),
          value: text(attribute.value),
        }] : []
      }),
    }]
  })
}

export function mapAdminAccessoryEditorRow(value: unknown): AdminAccessoryEditorData {
  const row = record(value)
  if (!row || row.product_type !== 'ACCESSORY') {
    throw new Error('Sản phẩm không tồn tại hoặc không phải phụ kiện.')
  }

  const media = records(row.media ?? row.product_media).filter(isActive).sort(ordered)
  const mediaByOptionValue = new Map<string, string[]>()
  const mediaByVariant = new Map<string, string[]>()
  const productMedia: string[] = []
  for (const item of media) {
    const url = text(item.url).trim()
    if (!url) continue
    const optionValueId = nullableText(item.option_value_id)
    const variantId = nullableText(item.variant_id)
    if (optionValueId) {
      const urls = mediaByOptionValue.get(optionValueId) ?? []
      urls.push(url)
      mediaByOptionValue.set(optionValueId, urls)
    } else if (variantId) {
      const urls = mediaByVariant.get(variantId) ?? []
      urls.push(url)
      mediaByVariant.set(variantId, urls)
    } else {
      productMedia.push(url)
    }
  }

  const groups = records(row.option_groups ?? row.product_option_groups)
    .filter(isActive)
    .sort(ordered)
  const optionGroups: DraftOptionGroup[] = groups.map((group) => {
    const code = text(group.code)
    const groupMetadata = metadata(group.metadata)
    return {
      id: text(group.id),
      presetCode: ACCESSORY_OPTION_PRESETS.some((preset) => preset.code === code) ? code : '',
      code,
      name: text(group.name),
      displayType: group.display_type === 'SWATCH' || group.display_type === 'SELECT'
        ? group.display_type
        : 'BUTTON',
      minimumSelections: integer(group.minimum_selections) >= 1 ? 1 : 0,
      maximumSelections: 1,
      mediaEnabled: typeof groupMetadata.drivesMedia === 'boolean'
        ? groupMetadata.drivesMedia
        : undefined,
      values: records(group.option_values ?? group.values)
        .filter(isActive)
        .sort(ordered)
        .map((option) => ({
          id: text(option.id),
          code: text(option.code),
          name: text(option.name),
          colorHex: nullableText(option.color_hex) ?? '',
          swatchUrl: nullableText(option.swatch_url) ?? '',
          imageUrls: mediaByOptionValue.get(text(option.id)) ?? [''],
        })),
    }
  })

  const groupById = new Map(optionGroups.map((group) => [group.id, group]))
  const activeVariantRows = records(row.variants ?? row.product_variants)
    .filter(isActive)
    .sort(ordered)
  const fallbackVariantRows = activeVariantRows.length > 0
    ? activeVariantRows
    : records(row.variants ?? row.product_variants).sort(ordered).slice(0, 1)
  const variants: DraftVariant[] = fallbackVariantRows.map((variant) => {
    const selections: Record<string, string | null> = {}
    for (const mapping of records(variant.option_mappings ?? variant.product_variant_option_values)) {
      const groupId = text(mapping.option_group_id)
      const valueId = text(mapping.option_value_id)
      if (groupById.get(groupId)?.values.some((option) => option.id === valueId)) {
        selections[groupId] = valueId
      }
    }
    return {
      id: text(variant.id),
      name: text(variant.name),
      sku: text(variant.sku),
      originalPrice: String(integer(variant.original_price)),
      salePrice: variant.sale_price === null || variant.sale_price === undefined
        ? ''
        : String(integer(variant.sale_price)),
      isActive: variant.is_active === true,
      isIncluded: true,
      selections,
      imageUrls: mediaByVariant.get(text(variant.id)) ?? [''],
    }
  })

  const memberships = records(row.collection_memberships ?? row.product_collection_memberships)
    .filter(isActive)
    .map((membership) => ({
      row: membership,
      collection: firstRecord(membership.collection ?? membership.catalog_collections),
    }))
    .filter((item): item is { row: UnknownRecord; collection: UnknownRecord } => Boolean(item.collection && isActive(item.collection)))
  const primaryMembership = memberships.find((item) => item.row.is_primary === true && item.collection.kind === 'CATEGORY')
    ?? memberships.find((item) => item.collection.kind === 'CATEGORY')
  const modelCollectionSlugs = [...new Set(memberships
    .filter((item) => item.collection.kind === 'MODEL')
    .map((item) => text(item.collection.slug))
    .filter(Boolean))]
  const serviceLabelIds = [...new Set(records(
    row.service_label_assignments ?? row.product_service_label_assignments,
  ).filter((assignment) => {
    const label = firstRecord(assignment.service_label ?? assignment.catalog_service_labels)
    return !label || isActive(label)
  }).map((assignment) => text(assignment.service_label_id)).filter(Boolean))]
  const mediaOptionGroup = optionGroups.find((group) => group.mediaEnabled)
  const legacyImages = stringArray(row.image_urls)

  const draft: AdminAccessoryDraft = {
    rootCategoryId: text(row.category_id),
    primaryCollectionSlug: primaryMembership ? text(primaryMembership.collection.slug) : '',
    modelCollectionSlugs,
    name: text(row.name),
    slug: text(row.slug),
    description: text(row.description),
    isActive: row.is_active === true,
    serviceLabelIds,
    sections: mapSections(row.specifications),
    optionGroups,
    mediaOptionGroupId: mediaOptionGroup?.id,
    variants,
    productImageUrls: productMedia.length > 0
      ? productMedia
      : media.length > 0
        ? ['']
        : legacyImages.length > 0
          ? legacyImages
          : [''],
  }

  return {
    id: text(row.id),
    productType: 'ACCESSORY',
    isActive: row.is_active === true,
    updatedAt: text(row.updated_at),
    draft,
  }
}
