import {
  createAdminAccessoryDraft,
  type CompatibilityMode,
  type AdminAccessoryDraft,
  type DraftCategoryAssignment,
  type DraftOptionGroup,
  type DraftOptionValue,
  type DraftVariant,
} from '@/lib/catalog/admin-accessory-draft'
import { isAccessoryTemplateCode } from '@/lib/catalog/admin-accessory-templates'

export const ADMIN_ACCESSORY_SESSION_KEY = 'fastlane.admin.accessory.prototype.v5'
export const ADMIN_ACCESSORY_SESSION_VERSION = 6
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type DraftSnapshot = {
  schemaVersion: number
  savedAt: string
  draft: AdminAccessoryDraft
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function strings(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function compatibilityMode(value: unknown): CompatibilityMode | null {
  return value === 'ALL_MODELS' || value === 'SELECTED_MODELS' || value === 'NOT_APPLICABLE'
    ? value
    : null
}

function normalizeCategoryAssignments(value: unknown, legacyRow: Record<string, unknown>): DraftCategoryAssignment[] {
  if (Array.isArray(value)) {
    return value.flatMap((entry) => {
      const row = record(entry)
      const categoryId = typeof row?.categoryId === 'string' ? row.categoryId : ''
      if (!categoryId) return []
      return [{
        categoryId,
        compatibilityMode: compatibilityMode(row?.compatibilityMode),
        modelIds: strings(row?.modelIds),
      }]
    })
  }

  const primaryCollectionSlug = typeof legacyRow.primaryCollectionSlug === 'string'
    ? legacyRow.primaryCollectionSlug
    : ''
  if (!primaryCollectionSlug) return []
  const modelIds = strings(legacyRow.modelCollectionSlugs)
  return [{
    // Snapshot v3 only has slugs. They are resolved against taxonomy before write.
    categoryId: primaryCollectionSlug,
    compatibilityMode: modelIds.length > 0 ? 'SELECTED_MODELS' : null,
    modelIds,
  }]
}

function normalizeValue(value: unknown, index: number): DraftOptionValue {
  const row = record(value) ?? {}
  return {
    id: typeof row.id === 'string' ? row.id : `restored-value-${index + 1}`,
    code: typeof row.code === 'string' ? row.code : '',
    name: typeof row.name === 'string' ? row.name : '',
    colorHex: typeof row.colorHex === 'string' ? row.colorHex : '',
    swatchUrl: typeof row.swatchUrl === 'string' ? row.swatchUrl : '',
    imageUrls: strings(row.imageUrls),
  }
}

function normalizeGroup(value: unknown, index: number): DraftOptionGroup {
  const row = record(value) ?? {}
  const legacyRequired = row.required !== false
  return {
    id: typeof row.id === 'string' ? row.id : `restored-group-${index + 1}`,
    presetCode: typeof row.presetCode === 'string' ? row.presetCode : '',
    code: typeof row.code === 'string' ? row.code : '',
    name: typeof row.name === 'string' ? row.name : '',
    displayType: row.displayType === 'SWATCH' || row.displayType === 'SELECT' ? row.displayType : 'BUTTON',
    minimumSelections: Number.isInteger(row.minimumSelections) ? Number(row.minimumSelections) : legacyRequired ? 1 : 0,
    maximumSelections: Number.isInteger(row.maximumSelections) ? Number(row.maximumSelections) : 1,
    mediaEnabled: typeof row.mediaEnabled === 'boolean' ? row.mediaEnabled : undefined,
    values: Array.isArray(row.values) ? row.values.map(normalizeValue) : [],
  }
}

function normalizeVariant(value: unknown, index: number): DraftVariant {
  const row = record(value) ?? {}
  const id = typeof row.id === 'string' ? row.id : `restored-variant-${index + 1}`
  const rawSelections = record(row.selections) ?? {}
  return {
    id,
    name: typeof row.name === 'string' ? row.name : '',
    sku: UUID_PATTERN.test(id) && typeof row.sku === 'string' ? row.sku : '',
    originalPrice: typeof row.originalPrice === 'string' ? row.originalPrice : '',
    salePrice: typeof row.salePrice === 'string' ? row.salePrice : '',
    isActive: row.isActive !== false,
    isIncluded: row.isIncluded !== false,
    selections: Object.fromEntries(Object.entries(rawSelections).filter((entry): entry is [string, string | null] => (
      typeof entry[1] === 'string' || entry[1] === null
    ))),
    imageUrls: strings(row.imageUrls).length > 0 ? strings(row.imageUrls) : [''],
  }
}

export function normalizeAdminAccessoryDraft(
  value: unknown,
  rootCategoryId: string,
): AdminAccessoryDraft {
  const fallback = createAdminAccessoryDraft()
  const row = record(value)
  if (!row) throw new Error('Bản nháp không đúng định dạng.')
  return {
    rootCategoryId,
    templateCode: isAccessoryTemplateCode(row.templateCode) ? row.templateCode : 'custom',
    templateVersion: Number.isInteger(row.templateVersion) && Number(row.templateVersion) > 0
      ? Number(row.templateVersion)
      : 1,
    templateVersionId: typeof row.templateVersionId === 'string'
      ? row.templateVersionId
      : row.templateVersionId === null
        ? null
        : undefined,
    categoryAssignments: normalizeCategoryAssignments(row.categoryAssignments, row),
    primaryCollectionSlug: typeof row.primaryCollectionSlug === 'string' ? row.primaryCollectionSlug : '',
    modelCollectionSlugs: strings(row.modelCollectionSlugs),
    productImageUrls: strings(row.productImageUrls).length > 0 ? strings(row.productImageUrls) : [''],
    mediaOptionGroupId: typeof row.mediaOptionGroupId === 'string'
      ? row.mediaOptionGroupId
      : row.mediaOptionGroupId === null ? null : undefined,
    name: typeof row.name === 'string' ? row.name : '',
    slug: typeof row.slug === 'string' ? row.slug : '',
    description: typeof row.description === 'string' ? row.description : '',
    isActive: row.isActive === true,
    serviceLabelIds: strings(row.serviceLabelIds),
    sections: Array.isArray(row.sections) ? row.sections as AdminAccessoryDraft['sections'] : [],
    optionGroups: Array.isArray(row.optionGroups) ? row.optionGroups.map(normalizeGroup) : [],
    variants: Array.isArray(row.variants) && row.variants.length > 0
      ? row.variants.map(normalizeVariant)
      : fallback.variants,
  }
}

export function serializeAdminAccessoryDraft(draft: AdminAccessoryDraft) {
  const snapshot: DraftSnapshot = {
    schemaVersion: ADMIN_ACCESSORY_SESSION_VERSION,
    savedAt: new Date().toISOString(),
    draft,
  }
  return JSON.stringify(snapshot)
}

export function restoreAdminAccessoryDraft(serialized: string, rootCategoryId: string) {
  const parsed: unknown = JSON.parse(serialized)
  const snapshot = record(parsed)
  if (!snapshot || ![3, 4, 5, ADMIN_ACCESSORY_SESSION_VERSION].includes(Number(snapshot.schemaVersion))) {
    throw new Error('Phiên bản bản nháp không được hỗ trợ.')
  }
  return normalizeAdminAccessoryDraft(snapshot.draft, rootCategoryId)
}
