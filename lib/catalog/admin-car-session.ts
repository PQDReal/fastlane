import {
  createAdminAccessoryDraft,
  type AdminAccessoryDraft,
  type DraftOptionGroup,
  type DraftOptionValue,
  type DraftVariant,
} from '@/lib/catalog/admin-accessory-draft'

export const ADMIN_CAR_SESSION_KEY = 'fastlane.admin.car.prototype.v3'
export const ADMIN_CAR_SESSION_VERSION = 3

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

function normalizeValue(value: unknown, index: number): DraftOptionValue {
  const row = record(value) ?? {}
  return {
    id: typeof row.id === 'string' ? row.id : `restored-value-${index + 1}`,
    code: typeof row.code === 'string' ? row.code : '',
    name: typeof row.name === 'string' ? row.name : '',
    colorHex: typeof row.colorHex === 'string' ? row.colorHex : '',
    swatchUrl: typeof row.swatchUrl === 'string' ? row.swatchUrl : '',
    imageUrls: strings(row.imageUrls).length > 0 ? strings(row.imageUrls) : [''],
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
    maximumSelections: 1,
    mediaEnabled: typeof row.mediaEnabled === 'boolean' ? row.mediaEnabled : undefined,
    values: Array.isArray(row.values) ? row.values.map(normalizeValue) : [],
  }
}

function normalizeVariant(value: unknown, index: number): DraftVariant {
  const row = record(value) ?? {}
  const rawSelections = record(row.selections) ?? {}
  return {
    id: typeof row.id === 'string' ? row.id : `restored-variant-${index + 1}`,
    name: typeof row.name === 'string' ? row.name : '',
    sku: typeof row.sku === 'string' ? row.sku : '',
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

export function normalizeAdminCarDraft(
  value: unknown,
  rootCategoryId: string,
): AdminAccessoryDraft {
  const fallback = createAdminAccessoryDraft()
  const row = record(value)
  if (!row) throw new Error('Bản nháp không đúng định dạng.')
  return {
    rootCategoryId,
    primaryCollectionSlug: typeof row.primaryCollectionSlug === 'string' ? row.primaryCollectionSlug : '',
    modelCollectionSlugs: strings(row.modelCollectionSlugs),
    name: typeof row.name === 'string' ? row.name : '',
    slug: typeof row.slug === 'string' ? row.slug : '',
    description: typeof row.description === 'string' ? row.description : '',
    isActive: row.isActive === true,
    serviceLabelIds: strings(row.serviceLabelIds),
    sections: Array.isArray(row.sections) ? row.sections as AdminAccessoryDraft['sections'] : [],
    optionGroups: Array.isArray(row.optionGroups) ? row.optionGroups.map(normalizeGroup) : [],
    mediaOptionGroupId: row.mediaOptionGroupId === null
      ? null
      : typeof row.mediaOptionGroupId === 'string'
        ? row.mediaOptionGroupId
        : undefined,
    variants: Array.isArray(row.variants) && row.variants.length > 0
      ? row.variants.map(normalizeVariant)
      : fallback.variants,
    productImageUrls: strings(row.productImageUrls).length > 0 ? strings(row.productImageUrls) : [''],
  }
}

export function serializeAdminCarDraft(draft: AdminAccessoryDraft) {
  const snapshot: DraftSnapshot = {
    schemaVersion: ADMIN_CAR_SESSION_VERSION,
    savedAt: new Date().toISOString(),
    draft,
  }
  return JSON.stringify(snapshot)
}

export function restoreAdminCarDraft(serialized: string, rootCategoryId: string) {
  const parsed: unknown = JSON.parse(serialized)
  const snapshot = record(parsed)
  if (!snapshot || snapshot.schemaVersion !== ADMIN_CAR_SESSION_VERSION) {
    throw new Error('Phiên bản bản nháp không được hỗ trợ.')
  }
  return normalizeAdminCarDraft(snapshot.draft, rootCategoryId)
}
