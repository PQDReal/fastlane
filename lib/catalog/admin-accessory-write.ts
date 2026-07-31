import {
  ACCESSORY_SECTION_TYPES,
  draftOptionGroupIsRequired,
  isSectionComplete,
  nonEmptyUrls,
  resolvedDraftMediaOptionGroupId,
  type AdminAccessoryDraft,
  type DraftCollection,
} from '@/lib/catalog/admin-accessory-draft'
import type {
  CatalogAccessoryContentSectionType,
  CatalogProductContent,
} from '@/lib/catalog/types'

export type AdminAccessoryOptionValueInput = {
  existingId?: string
  code: string
  name: string
  colorHex: string | null
  swatchUrl: string | null
  displayOrder: number
  imageUrls: string[]
}

export type AdminAccessoryOptionGroupInput = {
  existingId?: string
  code: string
  name: string
  displayType: 'BUTTON' | 'SWATCH' | 'SELECT'
  minimumSelections: 0 | 1
  maximumSelections: 1
  displayOrder: number
  drivesMedia: boolean
  values: AdminAccessoryOptionValueInput[]
}

export type AdminAccessoryVariantInput = {
  existingId?: string
  name: string
  sku: string
  originalPrice: number
  salePrice: number | null
  isActive: boolean
  optionValues: Record<string, string>
  imageUrls: string[]
}

export type AdminAccessoryWriteRequest = {
  expectedUpdatedAt?: string
  categoryId: string
  primaryCollectionId: string
  modelCollectionIds: string[]
  name: string
  slug: string
  description: string
  isActive: boolean
  serviceLabelIds: string[]
  content: CatalogProductContent
  optionGroups: AdminAccessoryOptionGroupInput[]
  variants: AdminAccessoryVariantInput[]
  productImageUrls: string[]
}

export type AdminAccessorySaveResult = {
  id: string
  productType: 'ACCESSORY'
  isActive: boolean
  updatedAt: string
}

export type AdminAccessoryEditorData = AdminAccessorySaveResult & {
  draft: AdminAccessoryDraft
}

export class AdminAccessoryWriteValidationError extends Error {
  constructor(
    readonly path: string,
    readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'AdminAccessoryWriteValidationError'
  }
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const GROUP_CODE_PATTERN = /^[a-z][a-z0-9_]*$/
const VALUE_CODE_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const COLOR_PATTERN = /^#[0-9a-f]{6}$/i
const CONTENT_KEY_PATTERN = /^[a-z0-9_]+$/
const CONTENT_TYPES = new Set(ACCESSORY_SECTION_TYPES.map((item) => item.value))
const MAX_MONEY = Number.MAX_SAFE_INTEGER

type UnknownRecord = Record<string, unknown>

function fail(path: string, code: string, message: string): never {
  throw new AdminAccessoryWriteValidationError(path, code, message)
}

function record(value: unknown, path: string): UnknownRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(path, 'OBJECT_REQUIRED', 'Dữ liệu phải là một object.')
  }
  return value as UnknownRecord
}

function exactKeys(value: UnknownRecord, allowed: string[], path: string) {
  const allowedKeys = new Set(allowed)
  const unexpected = Object.keys(value).find((key) => !allowedKeys.has(key))
  if (unexpected) fail(`${path}.${unexpected}`, 'UNKNOWN_FIELD', 'Trường dữ liệu không được hỗ trợ.')
}

function requiredString(
  value: unknown,
  path: string,
  options: { max: number; pattern?: RegExp } = { max: 10_000 },
) {
  if (typeof value !== 'string') fail(path, 'STRING_REQUIRED', 'Giá trị phải là chuỗi.')
  const normalized = value.trim()
  if (!normalized || normalized.length > options.max || (options.pattern && !options.pattern.test(normalized))) {
    fail(path, 'STRING_INVALID', 'Giá trị không hợp lệ.')
  }
  return normalized
}

function optionalString(
  value: unknown,
  path: string,
  options: { max: number; pattern?: RegExp },
) {
  if (value === null || value === undefined || value === '') return null
  return requiredString(value, path, options)
}

function uuid(value: unknown, path: string) {
  return requiredString(value, path, { max: 36, pattern: UUID_PATTERN }).toLowerCase()
}

function optionalUuid(value: unknown, path: string) {
  if (value === undefined) return undefined
  return uuid(value, path)
}

function boolean(value: unknown, path: string) {
  if (typeof value !== 'boolean') fail(path, 'BOOLEAN_REQUIRED', 'Giá trị phải là boolean.')
  return value
}

function integer(value: unknown, path: string, minimum: number, maximum: number) {
  if (!Number.isSafeInteger(value) || Number(value) < minimum || Number(value) > maximum) {
    fail(path, 'INTEGER_INVALID', `Giá trị phải là số nguyên từ ${minimum} đến ${maximum}.`)
  }
  return Number(value)
}

function unique(values: string[], path: string, code: string) {
  const seen = new Set<string>()
  for (const value of values) {
    const normalized = value.toLocaleLowerCase('vi-VN')
    if (seen.has(normalized)) fail(path, code, 'Danh sách chứa giá trị trùng lặp.')
    seen.add(normalized)
  }
}

function httpUrl(value: unknown, path: string) {
  const normalized = requiredString(value, path, { max: 2_048 })
  try {
    const parsed = new URL(normalized)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error('protocol')
  } catch {
    fail(path, 'URL_INVALID', 'URL phải dùng HTTP hoặc HTTPS.')
  }
  return normalized
}

function urlArray(value: unknown, path: string, maxItems = 20) {
  if (!Array.isArray(value) || value.length > maxItems) {
    fail(path, 'URL_LIST_INVALID', `Danh sách URL không được vượt quá ${maxItems} phần tử.`)
  }
  const urls = value.map((item, index) => httpUrl(item, `${path}.${index}`))
  unique(urls, path, 'URL_DUPLICATE')
  return urls
}

function uuidArray(value: unknown, path: string, maxItems: number) {
  if (!Array.isArray(value) || value.length > maxItems) {
    fail(path, 'UUID_LIST_INVALID', `Danh sách không được vượt quá ${maxItems} phần tử.`)
  }
  const ids = value.map((item, index) => uuid(item, `${path}.${index}`))
  unique(ids, path, 'UUID_DUPLICATE')
  return ids
}

function parseContent(value: unknown): CatalogProductContent {
  const document = record(value, 'content')
  exactKeys(document, ['schema', 'sections'], 'content')
  if (document.schema !== 'accessory_content_v1') {
    fail('content.schema', 'CONTENT_SCHEMA_INVALID', 'Nội dung phụ kiện phải dùng accessory_content_v1.')
  }
  if (!Array.isArray(document.sections) || document.sections.length > 30) {
    fail('content.sections', 'CONTENT_SECTIONS_INVALID', 'Nội dung không được vượt quá 30 mục.')
  }

  const keys: string[] = []
  const sections = document.sections.map((item, sectionIndex) => {
    const path = `content.sections.${sectionIndex}`
    const section = record(item, path)
    exactKeys(section, ['key', 'type', 'title', 'displayOrder', 'body', 'items', 'attributes'], path)
    const key = requiredString(section.key, `${path}.key`, { max: 80, pattern: CONTENT_KEY_PATTERN })
    const type = section.type
    if (typeof type !== 'string' || !CONTENT_TYPES.has(type as CatalogAccessoryContentSectionType)) {
      fail(`${path}.type`, 'CONTENT_TYPE_INVALID', 'Loại nội dung không được hỗ trợ.')
    }
    const title = requiredString(section.title, `${path}.title`, { max: 200 })
    const displayOrder = integer(section.displayOrder, `${path}.displayOrder`, 10, 300)
    if (displayOrder !== (sectionIndex + 1) * 10) {
      fail(`${path}.displayOrder`, 'CONTENT_ORDER_INVALID', 'Thứ tự nội dung phải tăng theo bước 10.')
    }
    const body = optionalString(section.body, `${path}.body`, { max: 20_000 })
    if (!Array.isArray(section.items) || section.items.length > 100) {
      fail(`${path}.items`, 'CONTENT_ITEMS_INVALID', 'Danh sách nội dung không được vượt quá 100 phần tử.')
    }
    const items = section.items.map((entry, index) => requiredString(entry, `${path}.items.${index}`, { max: 2_000 }))
    if (!Array.isArray(section.attributes) || section.attributes.length > 100) {
      fail(`${path}.attributes`, 'CONTENT_ATTRIBUTES_INVALID', 'Danh sách thuộc tính không được vượt quá 100 phần tử.')
    }
    const attributes = section.attributes.map((entry, index) => {
      const attributePath = `${path}.attributes.${index}`
      const attribute = record(entry, attributePath)
      exactKeys(attribute, ['label', 'value'], attributePath)
      return {
        label: requiredString(attribute.label, `${attributePath}.label`, { max: 300 }),
        value: requiredString(attribute.value, `${attributePath}.value`, { max: 2_000 }),
      }
    })
    if (body === null && items.length === 0 && attributes.length === 0) {
      fail(path, 'CONTENT_SECTION_EMPTY', 'Mỗi mục nội dung phải có ít nhất một nội dung.')
    }
    keys.push(key)
    return {
      key,
      type: type as CatalogAccessoryContentSectionType,
      title,
      displayOrder,
      body,
      items,
      attributes,
    }
  })
  unique(keys, 'content.sections', 'CONTENT_KEY_DUPLICATE')
  return { schema: 'accessory_content_v1', sections }
}

function parseOptionGroups(value: unknown): AdminAccessoryOptionGroupInput[] {
  if (!Array.isArray(value) || value.length > 20) {
    fail('optionGroups', 'OPTION_GROUPS_INVALID', 'Sản phẩm không được vượt quá 20 nhóm tùy chọn.')
  }
  const groupCodes: string[] = []
  const groups = value.map((item, groupIndex) => {
    const path = `optionGroups.${groupIndex}`
    const group = record(item, path)
    exactKeys(group, ['existingId', 'code', 'name', 'displayType', 'minimumSelections', 'maximumSelections', 'displayOrder', 'drivesMedia', 'values'], path)
    const code = requiredString(group.code, `${path}.code`, { max: 80, pattern: GROUP_CODE_PATTERN })
    const name = requiredString(group.name, `${path}.name`, { max: 160 })
    if (group.displayType !== 'BUTTON' && group.displayType !== 'SWATCH' && group.displayType !== 'SELECT') {
      fail(`${path}.displayType`, 'OPTION_DISPLAY_TYPE_INVALID', 'Kiểu hiển thị tùy chọn không hợp lệ.')
    }
    const displayType = group.displayType as AdminAccessoryOptionGroupInput['displayType']
    const minimumSelections = integer(group.minimumSelections, `${path}.minimumSelections`, 0, 1) as 0 | 1
    const maximumSelections = integer(group.maximumSelections, `${path}.maximumSelections`, 1, 1) as 1
    const displayOrder = integer(group.displayOrder, `${path}.displayOrder`, 0, 1_000_000)
    if (!Array.isArray(group.values) || group.values.length < 1 || group.values.length > 100) {
      fail(`${path}.values`, 'OPTION_VALUES_INVALID', 'Mỗi nhóm cần từ 1 đến 100 giá trị.')
    }
    const valueCodes: string[] = []
    const values = group.values.map((entry, valueIndex) => {
      const valuePath = `${path}.values.${valueIndex}`
      const option = record(entry, valuePath)
      exactKeys(option, ['existingId', 'code', 'name', 'colorHex', 'swatchUrl', 'displayOrder', 'imageUrls'], valuePath)
      const optionCode = requiredString(option.code, `${valuePath}.code`, { max: 80, pattern: VALUE_CODE_PATTERN })
      valueCodes.push(optionCode)
      const existingId = optionalUuid(option.existingId, `${valuePath}.existingId`)
      return {
        ...(existingId ? { existingId } : {}),
        code: optionCode,
        name: requiredString(option.name, `${valuePath}.name`, { max: 160 }),
        colorHex: optionalString(option.colorHex, `${valuePath}.colorHex`, { max: 7, pattern: COLOR_PATTERN }),
        swatchUrl: option.swatchUrl === null ? null : httpUrl(option.swatchUrl, `${valuePath}.swatchUrl`),
        displayOrder: integer(option.displayOrder, `${valuePath}.displayOrder`, 0, 1_000_000),
        imageUrls: urlArray(option.imageUrls, `${valuePath}.imageUrls`),
      }
    })
    unique(valueCodes, `${path}.values`, 'OPTION_VALUE_CODE_DUPLICATE')
    groupCodes.push(code)
    const existingId = optionalUuid(group.existingId, `${path}.existingId`)
    return {
      ...(existingId ? { existingId } : {}),
      code,
      name,
      displayType,
      minimumSelections,
      maximumSelections,
      displayOrder,
      drivesMedia: boolean(group.drivesMedia, `${path}.drivesMedia`),
      values,
    }
  })
  unique(groupCodes, 'optionGroups', 'OPTION_GROUP_CODE_DUPLICATE')
  if (groups.filter((group) => group.drivesMedia).length > 1) {
    fail('optionGroups', 'MEDIA_GROUP_DUPLICATE', 'Chỉ một nhóm tùy chọn được điều khiển hình ảnh.')
  }
  const mediaOutsideDriver = groups.find((group) => (
    !group.drivesMedia && group.values.some((option) => option.imageUrls.length > 0)
  ))
  if (mediaOutsideDriver) {
    fail('optionGroups', 'OPTION_MEDIA_GROUP_INVALID', 'Ảnh theo giá trị chỉ được lưu ở nhóm điều khiển hình ảnh.')
  }
  return groups
}

function parseVariants(value: unknown, groups: AdminAccessoryOptionGroupInput[]): AdminAccessoryVariantInput[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 500) {
    fail('variants', 'VARIANTS_INVALID', 'Sản phẩm cần từ 1 đến 500 SKU.')
  }
  const groupByCode = new Map(groups.map((group) => [group.code, group]))
  const skus: string[] = []
  const signatures: string[] = []
  const variants = value.map((item, variantIndex) => {
    const path = `variants.${variantIndex}`
    const variant = record(item, path)
    exactKeys(variant, ['existingId', 'name', 'sku', 'originalPrice', 'salePrice', 'isActive', 'optionValues', 'imageUrls'], path)
    const sku = requiredString(variant.sku, `${path}.sku`, { max: 80 })
    const originalPrice = integer(variant.originalPrice, `${path}.originalPrice`, 0, MAX_MONEY)
    const salePrice = variant.salePrice === null
      ? null
      : integer(variant.salePrice, `${path}.salePrice`, 0, MAX_MONEY)
    if (salePrice !== null && salePrice >= originalPrice) {
      fail(`${path}.salePrice`, 'VARIANT_SALE_PRICE_INVALID', 'Giá khuyến mại phải thấp hơn giá niêm yết.')
    }
    const rawOptions = record(variant.optionValues, `${path}.optionValues`)
    const optionValues: Record<string, string> = {}
    for (const [groupCode, valueCodeValue] of Object.entries(rawOptions)) {
      const group = groupByCode.get(groupCode)
      if (!group) fail(`${path}.optionValues.${groupCode}`, 'VARIANT_GROUP_UNKNOWN', 'SKU tham chiếu nhóm tùy chọn không tồn tại.')
      const valueCode = requiredString(valueCodeValue, `${path}.optionValues.${groupCode}`, { max: 80, pattern: VALUE_CODE_PATTERN })
      if (!group.values.some((option) => option.code === valueCode)) {
        fail(`${path}.optionValues.${groupCode}`, 'VARIANT_VALUE_UNKNOWN', 'SKU tham chiếu giá trị tùy chọn không tồn tại.')
      }
      optionValues[groupCode] = valueCode
    }
    for (const group of groups) {
      if (group.minimumSelections === 1 && !optionValues[group.code]) {
        fail(`${path}.optionValues.${group.code}`, 'VARIANT_SELECTION_REQUIRED', `SKU phải chọn giá trị cho ${group.name}.`)
      }
    }
    const signature = Object.entries(optionValues)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([groupCode, valueCode]) => `${groupCode}=${valueCode}`)
      .join('|')
    skus.push(sku)
    signatures.push(signature || '<default>')
    const existingId = optionalUuid(variant.existingId, `${path}.existingId`)
    return {
      ...(existingId ? { existingId } : {}),
      name: requiredString(variant.name, `${path}.name`, { max: 200 }),
      sku,
      originalPrice,
      salePrice,
      isActive: boolean(variant.isActive, `${path}.isActive`),
      optionValues,
      imageUrls: urlArray(variant.imageUrls, `${path}.imageUrls`),
    }
  })
  unique(skus, 'variants', 'VARIANT_SKU_DUPLICATE')
  unique(signatures, 'variants', 'VARIANT_SIGNATURE_DUPLICATE')
  return variants
}

export function parseAdminAccessoryWriteRequest(
  value: unknown,
  options: { requireExpectedUpdatedAt?: boolean } = {},
): AdminAccessoryWriteRequest {
  const input = record(value, 'body')
  exactKeys(input, [
    'expectedUpdatedAt', 'categoryId', 'primaryCollectionId', 'modelCollectionIds',
    'name', 'slug', 'description', 'isActive', 'serviceLabelIds', 'content',
    'optionGroups', 'variants', 'productImageUrls',
  ], 'body')
  const expectedUpdatedAt = optionalString(input.expectedUpdatedAt, 'expectedUpdatedAt', { max: 50 })
  if (options.requireExpectedUpdatedAt && !expectedUpdatedAt) {
    fail('expectedUpdatedAt', 'EXPECTED_UPDATED_AT_REQUIRED', 'Thiếu phiên bản cập nhật của sản phẩm.')
  }
  if (expectedUpdatedAt && !Number.isFinite(Date.parse(expectedUpdatedAt))) {
    fail('expectedUpdatedAt', 'EXPECTED_UPDATED_AT_INVALID', 'Phiên bản cập nhật không hợp lệ.')
  }
  const modelCollectionIds = uuidArray(input.modelCollectionIds, 'modelCollectionIds', 100)
  const primaryCollectionId = uuid(input.primaryCollectionId, 'primaryCollectionId')
  if (modelCollectionIds.includes(primaryCollectionId)) {
    fail('modelCollectionIds', 'COLLECTION_DUPLICATE', 'Danh mục chính không được lặp trong dòng xe liên quan.')
  }
  const optionGroups = parseOptionGroups(input.optionGroups)
  const variants = parseVariants(input.variants, optionGroups)
  const isActive = boolean(input.isActive, 'isActive')
  const productImageUrls = urlArray(input.productImageUrls, 'productImageUrls')
  const totalMedia = productImageUrls.length
    + optionGroups.reduce((total, group) => total + group.values.reduce((sum, option) => sum + option.imageUrls.length, 0), 0)
    + variants.reduce((total, variant) => total + variant.imageUrls.length, 0)
  if (totalMedia > 1_000) fail('body', 'MEDIA_LIMIT_EXCEEDED', 'Sản phẩm không được vượt quá 1.000 media.')
  if (isActive && !variants.some((variant) => variant.isActive)) {
    fail('variants', 'ACTIVE_VARIANT_REQUIRED', 'Sản phẩm hoạt động cần ít nhất một SKU hoạt động.')
  }
  if (isActive && totalMedia === 0) {
    fail('productImageUrls', 'ACTIVE_PRODUCT_MEDIA_REQUIRED', 'Sản phẩm hoạt động cần ít nhất một hình ảnh.')
  }

  return {
    ...(expectedUpdatedAt ? { expectedUpdatedAt } : {}),
    categoryId: uuid(input.categoryId, 'categoryId'),
    primaryCollectionId,
    modelCollectionIds,
    name: requiredString(input.name, 'name', { max: 200 }),
    slug: requiredString(input.slug, 'slug', { max: 220, pattern: SLUG_PATTERN }),
    description: requiredString(input.description, 'description', { max: 10_000 }),
    isActive,
    serviceLabelIds: uuidArray(input.serviceLabelIds, 'serviceLabelIds', 100),
    content: parseContent(input.content),
    optionGroups,
    variants,
    productImageUrls,
  }
}

function persistedId(value: string) {
  return UUID_PATTERN.test(value) ? value.toLowerCase() : undefined
}

function contentFromDraft(draft: AdminAccessoryDraft): CatalogProductContent {
  const usedKeys = new Set<string>()
  return {
    schema: 'accessory_content_v1',
    sections: draft.sections.filter(isSectionComplete).map((section, index) => {
      const existingKey = CONTENT_KEY_PATTERN.test(section.id) ? section.id : ''
      const baseKey = existingKey || section.type.toLowerCase()
      let key = baseKey
      let suffix = 2
      while (usedKeys.has(key)) key = `${baseKey}_${suffix++}`
      usedKeys.add(key)
      return {
        key,
        type: section.type,
        title: section.type === 'OTHER'
          ? section.title.trim()
          : ACCESSORY_SECTION_TYPES.find((item) => item.value === section.type)?.defaultTitle || section.title.trim(),
        displayOrder: (index + 1) * 10,
        body: section.body.trim() || null,
        items: section.itemsText.split('\n').map((item) => item.trim()).filter(Boolean),
        attributes: section.attributes.flatMap((attribute) => (
          attribute.label.trim() && attribute.value.trim()
            ? [{ label: attribute.label.trim(), value: attribute.value.trim() }]
            : []
        )),
      }
    }),
  }
}

export function adminAccessoryDraftToWriteRequest(
  draft: AdminAccessoryDraft,
  collections: DraftCollection[],
  expectedUpdatedAt?: string,
): AdminAccessoryWriteRequest {
  const primaryCollection = collections.find((collection) => (
    collection.kind === 'CATEGORY' && collection.slug === draft.primaryCollectionSlug
  ))
  if (!primaryCollection) {
    fail('primaryCollectionId', 'PRIMARY_COLLECTION_REQUIRED', 'Danh mục phụ kiện chính không tồn tại.')
  }
  const modelCollections = draft.modelCollectionSlugs.map((slug) => collections.find((collection) => (
    collection.kind === 'MODEL' && collection.slug === slug && collection.parentId === primaryCollection.id
  )))
  if (modelCollections.some((collection) => !collection)) {
    fail('modelCollectionIds', 'MODEL_COLLECTION_INVALID', 'Có dòng xe không thuộc danh mục phụ kiện đã chọn.')
  }
  const mediaGroupId = resolvedDraftMediaOptionGroupId(draft)
  const groupById = new Map(draft.optionGroups.map((group) => [group.id, group]))
  const optionGroups: AdminAccessoryOptionGroupInput[] = draft.optionGroups.map((group, groupIndex) => ({
    ...(persistedId(group.id) ? { existingId: persistedId(group.id) } : {}),
    code: group.code.trim(),
    name: group.name.trim(),
    displayType: group.displayType,
    minimumSelections: draftOptionGroupIsRequired(group) ? 1 : 0,
    maximumSelections: 1,
    displayOrder: (groupIndex + 1) * 10,
    drivesMedia: group.id === mediaGroupId,
    values: group.values.map((option, valueIndex) => ({
      ...(persistedId(option.id) ? { existingId: persistedId(option.id) } : {}),
      code: option.code.trim(),
      name: option.name.trim(),
      colorHex: option.colorHex.trim() || null,
      swatchUrl: option.swatchUrl.trim() || null,
      displayOrder: (valueIndex + 1) * 10,
      imageUrls: group.id === mediaGroupId ? nonEmptyUrls(option.imageUrls) : [],
    })),
  }))
  const variants: AdminAccessoryVariantInput[] = draft.variants
    .filter((variant) => variant.isIncluded !== false)
    .map((variant) => {
      const optionValues = Object.entries(variant.selections).reduce<Record<string, string>>((result, [groupId, valueId]) => {
        if (!valueId) return result
        const group = groupById.get(groupId)
        const option = group?.values.find((item) => item.id === valueId)
        if (group && option) result[group.code.trim()] = option.code.trim()
        return result
      }, {})
      return {
        ...(persistedId(variant.id) ? { existingId: persistedId(variant.id) } : {}),
        name: variant.name.trim(),
        sku: variant.sku.trim(),
        originalPrice: Number(variant.originalPrice),
        salePrice: variant.salePrice.trim() ? Number(variant.salePrice) : null,
        isActive: variant.isActive,
        optionValues,
        imageUrls: nonEmptyUrls(variant.imageUrls),
      }
    })

  return parseAdminAccessoryWriteRequest({
    ...(expectedUpdatedAt ? { expectedUpdatedAt } : {}),
    categoryId: draft.rootCategoryId,
    primaryCollectionId: primaryCollection.id,
    modelCollectionIds: modelCollections.map((collection) => collection!.id),
    name: draft.name,
    slug: draft.slug,
    description: draft.description,
    isActive: draft.isActive,
    serviceLabelIds: draft.serviceLabelIds,
    content: contentFromDraft(draft),
    optionGroups,
    variants,
    productImageUrls: nonEmptyUrls(draft.productImageUrls),
  }, { requireExpectedUpdatedAt: Boolean(expectedUpdatedAt) })
}

export function adminAccessoryRpcPayload(request: AdminAccessoryWriteRequest) {
  const { expectedUpdatedAt: _expectedUpdatedAt, ...payload } = request
  return payload
}
