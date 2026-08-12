import {
  ACCESSORY_SECTION_TYPES,
  draftOptionGroupIsRequired,
  isSectionComplete,
  nonEmptyUrls,
  type AdminAccessoryDraft,
  type CompatibilityMode,
  type DraftCollection,
} from '@/lib/catalog/admin-accessory-draft'
import {
  accessoryTemplate,
  isTemplateSectionKey,
  type AccessoryTemplateCode,
} from '@/lib/catalog/admin-accessory-templates'
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
}

export type AdminAccessoryOptionGroupInput = {
  existingId?: string
  code: string
  name: string
  displayType: 'BUTTON' | 'SWATCH' | 'SELECT'
  minimumSelections: 0 | 1
  maximumSelections: 1
  displayOrder: number
  values: AdminAccessoryOptionValueInput[]
}

export type AdminAccessoryVariantInput = {
  existingId?: string
  name: string
  originalPrice: number
  salePrice: number | null
  stockQuantity: number
  isActive: boolean
  optionValues: Record<string, string>
  imageUrls: string[]
}

export type AdminAccessoryCategoryAssignmentInput = {
  categoryId: string
  compatibilityMode: CompatibilityMode
  modelIds: string[]
}

export type AdminAccessoryWriteRequest = {
  expectedUpdatedAt?: string
  /** Internal rollout marker; never emitted by the new admin client. */
  legacyTaxonomy?: true
  categoryId: string
  templateCode: AccessoryTemplateCode
  templateVersion: number
  categoryAssignments: AdminAccessoryCategoryAssignmentInput[]
  name: string
  slug: string
  description: string
  isActive: boolean
  serviceLabelIds: string[]
  content: CatalogProductContent
  optionGroups: AdminAccessoryOptionGroupInput[]
  variants: AdminAccessoryVariantInput[]
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
    exactKeys(group, ['existingId', 'code', 'name', 'displayType', 'minimumSelections', 'maximumSelections', 'displayOrder', 'values'], path)
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
      exactKeys(option, ['existingId', 'code', 'name', 'colorHex', 'swatchUrl', 'displayOrder'], valuePath)
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
      values,
    }
  })
  unique(groupCodes, 'optionGroups', 'OPTION_GROUP_CODE_DUPLICATE')
  return groups
}

function parseVariants(value: unknown, groups: AdminAccessoryOptionGroupInput[]): AdminAccessoryVariantInput[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 500) {
    fail('variants', 'VARIANTS_INVALID', 'Sản phẩm cần từ 1 đến 500 SKU.')
  }
  const groupByCode = new Map(groups.map((group) => [group.code, group]))
  const signatures: string[] = []
  const variants = value.map((item, variantIndex) => {
    const path = `variants.${variantIndex}`
    const variant = record(item, path)
    exactKeys(variant, ['existingId', 'name', 'originalPrice', 'salePrice', 'stockQuantity', 'isActive', 'optionValues', 'imageUrls'], path)
    const originalPrice = integer(variant.originalPrice, `${path}.originalPrice`, 0, MAX_MONEY)
    const salePrice = variant.salePrice === null
      ? null
      : integer(variant.salePrice, `${path}.salePrice`, 0, MAX_MONEY)
    const stockQuantity = integer(variant.stockQuantity, `${path}.stockQuantity`, 0, Number.MAX_SAFE_INTEGER)
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
    signatures.push(signature || '<default>')
    const existingId = optionalUuid(variant.existingId, `${path}.existingId`)
    return {
      ...(existingId ? { existingId } : {}),
      name: requiredString(variant.name, `${path}.name`, { max: 200 }),
      originalPrice,
      salePrice,
      stockQuantity,
      isActive: boolean(variant.isActive, `${path}.isActive`),
      optionValues,
      imageUrls: urlArray(variant.imageUrls, `${path}.imageUrls`),
    }
  })
  unique(signatures, 'variants', 'VARIANT_SIGNATURE_DUPLICATE')
  return variants
}

function validateVariantMediaCoverage(variants: AdminAccessoryVariantInput[]) {
  variants.forEach((variant, index) => {
    if (variant.imageUrls.length === 0) fail(`variants.${index}.imageUrls`, 'VARIANT_MEDIA_REQUIRED', `Biến thể ${index + 1} cần ít nhất một ảnh trực tiếp.`)
    if (variant.imageUrls.length > 20) fail(`variants.${index}.imageUrls`, 'VARIANT_MEDIA_LIMIT_INVALID', 'Mỗi SKU chỉ được có tối đa 20 ảnh.')
  })
}

function parseCompatibilityMode(value: unknown, path: string): CompatibilityMode {
  if (value === 'ALL_MODELS' || value === 'SELECTED_MODELS' || value === 'NOT_APPLICABLE') return value
  return fail(path, 'COMPATIBILITY_MODE_INVALID', 'Chế độ tương thích dòng xe không hợp lệ.')
}

function parseCategoryAssignments(value: unknown): AdminAccessoryCategoryAssignmentInput[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 20) {
    fail('categoryAssignments', 'CATEGORY_ASSIGNMENTS_INVALID', 'Cần chọn từ 1 đến 20 danh mục phụ kiện.')
  }
  const categoryIds: string[] = []
  const assignments = value.map((entry, index) => {
    const path = `categoryAssignments.${index}`
    const assignment = record(entry, path)
    exactKeys(assignment, ['categoryId', 'compatibilityMode', 'modelIds'], path)
    const categoryId = uuid(assignment.categoryId, `${path}.categoryId`)
    const compatibilityMode = parseCompatibilityMode(assignment.compatibilityMode, `${path}.compatibilityMode`)
    const modelIds = uuidArray(assignment.modelIds, `${path}.modelIds`, 100)
    if ((compatibilityMode === 'ALL_MODELS' || compatibilityMode === 'NOT_APPLICABLE') && modelIds.length > 0) {
      fail(`${path}.modelIds`, 'COMPATIBILITY_MODE_MODEL_MISMATCH', 'Chế độ đã chọn không nhận danh sách dòng xe cụ thể.')
    }
    if (compatibilityMode === 'SELECTED_MODELS' && modelIds.length === 0) {
      fail(`${path}.modelIds`, 'COMPATIBILITY_MODE_MODEL_REQUIRED', 'Cần chọn ít nhất một dòng xe tương thích.')
    }
    categoryIds.push(categoryId)
    return { categoryId, compatibilityMode, modelIds }
  })
  unique(categoryIds, 'categoryAssignments', 'CATEGORY_ASSIGNMENT_DUPLICATE')
  return assignments
}

export function parseAdminAccessoryWriteRequest(
  value: unknown,
  options: { requireExpectedUpdatedAt?: boolean } = {},
): AdminAccessoryWriteRequest {
  const input = record(value, 'body')
  exactKeys(input, [
    'expectedUpdatedAt', 'categoryId', 'templateCode', 'templateVersion', 'categoryAssignments',
    // Legacy v1 taxonomy shape. It remains accepted only during rollout.
    'primaryCollectionId', 'modelCollectionIds',
    'name', 'slug', 'description', 'isActive', 'serviceLabelIds', 'content',
    'optionGroups', 'variants',
  ], 'body')
  const expectedUpdatedAt = optionalString(input.expectedUpdatedAt, 'expectedUpdatedAt', { max: 50 })
  if (options.requireExpectedUpdatedAt && !expectedUpdatedAt) {
    fail('expectedUpdatedAt', 'EXPECTED_UPDATED_AT_REQUIRED', 'Thiếu phiên bản cập nhật của sản phẩm.')
  }
  if (expectedUpdatedAt && !Number.isFinite(Date.parse(expectedUpdatedAt))) {
    fail('expectedUpdatedAt', 'EXPECTED_UPDATED_AT_INVALID', 'Phiên bản cập nhật không hợp lệ.')
  }
  const usesNewTaxonomy = input.categoryAssignments !== undefined
    || input.templateCode !== undefined
    || input.templateVersion !== undefined
  const usesLegacyTaxonomy = input.primaryCollectionId !== undefined || input.modelCollectionIds !== undefined
  if (usesNewTaxonomy && usesLegacyTaxonomy) {
    fail('body', 'TAXONOMY_SHAPE_CONFLICT', 'Không thể gửi đồng thời cấu trúc phân loại cũ và mới.')
  }
  let templateCode: AccessoryTemplateCode
  let templateVersion: number
  let categoryAssignments: AdminAccessoryCategoryAssignmentInput[]
  if (usesNewTaxonomy) {
    templateCode = typeof input.templateCode === 'string' ? input.templateCode as AccessoryTemplateCode : fail('templateCode', 'TEMPLATE_CODE_REQUIRED', 'Cần chọn mẫu nhập phụ kiện.')
    templateVersion = integer(input.templateVersion, 'templateVersion', 1, 100)
    if (!accessoryTemplate(templateCode, templateVersion)) {
      fail('templateCode', 'TEMPLATE_VERSION_UNSUPPORTED', 'Mẫu nhập phụ kiện hoặc phiên bản không được hỗ trợ.')
    }
    categoryAssignments = parseCategoryAssignments(input.categoryAssignments)
  } else {
    const modelCollectionIds = uuidArray(input.modelCollectionIds, 'modelCollectionIds', 100)
    const primaryCollectionId = uuid(input.primaryCollectionId, 'primaryCollectionId')
    if (modelCollectionIds.includes(primaryCollectionId)) {
      fail('modelCollectionIds', 'COLLECTION_DUPLICATE', 'Danh mục không được lặp trong dòng xe liên quan.')
    }
    templateCode = 'custom'
    templateVersion = 1
    categoryAssignments = [{
      categoryId: primaryCollectionId,
      compatibilityMode: modelCollectionIds.length > 0 ? 'SELECTED_MODELS' : 'ALL_MODELS',
      modelIds: modelCollectionIds,
    }]
  }
  const optionGroups = parseOptionGroups(input.optionGroups)
  const variants = parseVariants(input.variants, optionGroups)
  const isActive = boolean(input.isActive, 'isActive')
  const totalMedia = variants.reduce((total, variant) => total + variant.imageUrls.length, 0)
  if (totalMedia > 1_000) fail('body', 'MEDIA_LIMIT_EXCEEDED', 'Sản phẩm không được vượt quá 1.000 media.')
  validateVariantMediaCoverage(variants)
  if (isActive && !variants.some((variant) => variant.isActive)) {
    fail('variants', 'ACTIVE_VARIANT_REQUIRED', 'Sản phẩm hoạt động cần ít nhất một SKU hoạt động.')
  }

  return {
    ...(expectedUpdatedAt ? { expectedUpdatedAt } : {}),
    ...(!usesNewTaxonomy ? { legacyTaxonomy: true as const } : {}),
    categoryId: uuid(input.categoryId, 'categoryId'),
    templateCode,
    templateVersion,
    categoryAssignments,
    name: requiredString(input.name, 'name', { max: 200 }),
    slug: requiredString(input.slug, 'slug', { max: 220, pattern: SLUG_PATTERN }),
    description: requiredString(input.description, 'description', { max: 10_000 }),
    isActive,
    serviceLabelIds: uuidArray(input.serviceLabelIds, 'serviceLabelIds', 100),
    content: parseContent(input.content),
    optionGroups,
    variants,
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
        title: isTemplateSectionKey(section.id)
          ? section.title.trim()
            || ACCESSORY_SECTION_TYPES.find((item) => item.value === section.type)?.defaultTitle
            || 'Thông tin khác'
          : section.type === 'OTHER'
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
  const categoryAssignments = draft.categoryAssignments.map((assignment, assignmentIndex) => {
    const category = collections.find((collection) => (
      collection.kind === 'CATEGORY'
      && (collection.id === assignment.categoryId || collection.slug === assignment.categoryId)
    ))
    if (!category) {
      fail(`categoryAssignments.${assignmentIndex}.categoryId`, 'CATEGORY_ASSIGNMENT_INVALID', 'Danh mục phụ kiện không tồn tại.')
    }
    if (!assignment.compatibilityMode) {
      fail(`categoryAssignments.${assignmentIndex}.compatibilityMode`, 'COMPATIBILITY_MODE_REQUIRED', 'Hãy chọn phạm vi tương thích dòng xe.')
    }
    const modelCollections = assignment.modelIds.map((modelId) => collections.find((collection) => (
      collection.kind === 'MODEL'
      && (collection.id === modelId || collection.slug === modelId)
      && collection.parentId === category.id
    )))
    if (modelCollections.some((collection) => !collection)) {
      fail(`categoryAssignments.${assignmentIndex}.modelIds`, 'MODEL_COLLECTION_INVALID', 'Có dòng xe không thuộc danh mục phụ kiện đã chọn.')
    }
    return {
      categoryId: category.id,
      compatibilityMode: assignment.compatibilityMode,
      modelIds: modelCollections.map((collection) => collection!.id),
    }
  })
  const groupById = new Map(draft.optionGroups.map((group) => [group.id, group]))
  const optionGroups: AdminAccessoryOptionGroupInput[] = draft.optionGroups.map((group, groupIndex) => ({
    ...(persistedId(group.id) ? { existingId: persistedId(group.id) } : {}),
    code: group.code.trim(),
    name: group.name.trim(),
    displayType: group.displayType,
    minimumSelections: draftOptionGroupIsRequired(group) ? 1 : 0,
    maximumSelections: 1,
    displayOrder: (groupIndex + 1) * 10,
    values: group.values.map((option, valueIndex) => ({
      ...(persistedId(option.id) ? { existingId: persistedId(option.id) } : {}),
      code: option.code.trim(),
      name: option.name.trim(),
      colorHex: option.colorHex.trim() || null,
      swatchUrl: option.swatchUrl.trim() || null,
      displayOrder: (valueIndex + 1) * 10,
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
        originalPrice: Number(variant.originalPrice),
        salePrice: variant.salePrice.trim() ? Number(variant.salePrice) : null,
        stockQuantity: Number(variant.stockQuantity ?? '0'),
        isActive: variant.isActive,
        optionValues,
        imageUrls: nonEmptyUrls(variant.imageUrls),
      }
    })

  return parseAdminAccessoryWriteRequest({
    ...(expectedUpdatedAt ? { expectedUpdatedAt } : {}),
    categoryId: draft.rootCategoryId,
    templateCode: draft.templateCode,
    templateVersion: draft.templateVersion,
    categoryAssignments,
    name: draft.name,
    slug: draft.slug,
    description: draft.description,
    isActive: draft.isActive,
    serviceLabelIds: draft.serviceLabelIds,
    content: contentFromDraft(draft),
    optionGroups,
    variants,
  }, { requireExpectedUpdatedAt: Boolean(expectedUpdatedAt) })
}

export function adminAccessoryRpcPayload(request: AdminAccessoryWriteRequest) {
  const { expectedUpdatedAt: _expectedUpdatedAt, ...payload } = request
  const sourceVariants = payload.variants.filter((variant) => variant.isActive)
  const representative = sourceVariants[0] ?? payload.variants[0]
  return {
    ...payload,
    variants: payload.variants.map(({ stockQuantity: _stockQuantity, ...variant }) => variant),
    productImageUrls: representative?.imageUrls ?? [],
    optionGroups: payload.optionGroups.map((group) => ({
      ...group,
      drivesMedia: false,
      values: group.values.map((value) => ({ ...value, imageUrls: [] })),
    })),
  }
}
