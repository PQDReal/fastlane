import {
  ACCESSORY_TEMPLATE_SCHEMA,
  type AccessoryTemplateDefinition,
  type AdminAccessoryTemplateMetadataPatch,
  type AccessoryTemplateOptionGroupDefinition,
  type AccessoryTemplateSectionDefinition,
  type AdminAccessoryTemplateWriteInput,
} from '@/lib/catalog/admin-accessory-template-types'
import type { CatalogAccessoryContentSectionType } from '@/lib/catalog/types'

const CODE_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const SECTION_KEY_PATTERN = /^[a-z0-9]+(?:_[a-z0-9]+)*$/
const CONTENT_TYPES = new Set<string>([
  'TECHNICAL_SPECS', 'FEATURES', 'USAGE_GUIDE', 'CARE_GUIDE', 'INSTALLATION_GUIDE',
  'PACKAGE_CONTENTS', 'WARRANTY', 'SHIPPING_NOTE', 'PURCHASE_NOTE', 'SAFETY_NOTE',
  'CAR_GALLERY', 'OTHER',
])
const DISPLAY_TYPES = new Set(['BUTTON', 'SWATCH', 'SELECT'])

export function accessoryTemplateCodeFromName(name: string) {
  const code = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/, '')
  return code || 'mau-phu-kien'
}

export class AdminAccessoryTemplateValidationError extends Error {
  constructor(
    readonly path: string,
    readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'AdminAccessoryTemplateValidationError'
  }
}

function fail(path: string, code: string, message: string): never {
  throw new AdminAccessoryTemplateValidationError(path, code, message)
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(path, 'OBJECT_REQUIRED', 'Dữ liệu mẫu phải là một object.')
  }
  return value as Record<string, unknown>
}

function stringValue(value: unknown, path: string, maxLength: number, required = false) {
  if (typeof value !== 'string') fail(path, 'STRING_REQUIRED', 'Giá trị phải là chuỗi.')
  const normalized = value.trim()
  if (required && !normalized) fail(path, 'REQUIRED', 'Trường này không được để trống.')
  if (normalized.length > maxLength) fail(path, 'TOO_LONG', `Không được vượt quá ${maxLength} ký tự.`)
  return normalized
}

function stringArray(value: unknown, path: string, maxItems: number) {
  if (value === undefined) return []
  if (!Array.isArray(value) || value.length > maxItems) fail(path, 'ARRAY_INVALID', 'Danh sách không hợp lệ.')
  return value.map((item, index) => stringValue(item, `${path}.${index}`, 200, true))
}

function integer(value: unknown, path: string, min: number, max: number) {
  if (!Number.isInteger(value) || Number(value) < min || Number(value) > max) {
    fail(path, 'INTEGER_INVALID', `Giá trị phải là số nguyên từ ${min} đến ${max}.`)
  }
  return Number(value)
}

function parseAttribute(value: unknown, path: string, index: number) {
  if (typeof value === 'string') {
    const label = stringValue(value, path, 200, true)
    return { key: `attribute_${index + 1}`, label, defaultValue: '' }
  }
  const item = record(value, path)
  const key = stringValue(item.key, `${path}.key`, 80, true)
  if (!SECTION_KEY_PATTERN.test(key)) fail(`${path}.key`, 'KEY_INVALID', 'Mã thuộc tính không hợp lệ.')
  return {
    key,
    label: stringValue(item.label, `${path}.label`, 200, true),
    defaultValue: item.defaultValue === undefined ? '' : stringValue(item.defaultValue, `${path}.defaultValue`, 1000),
  }
}

function parseSection(value: unknown, path: string): AccessoryTemplateSectionDefinition {
  const item = record(value, path)
  const key = stringValue(item.key, `${path}.key`, 80, true)
  if (!SECTION_KEY_PATTERN.test(key)) fail(`${path}.key`, 'KEY_INVALID', 'Mã mục nội dung không hợp lệ.')
  const type = stringValue(item.type, `${path}.type`, 40, true)
  if (!CONTENT_TYPES.has(type)) fail(`${path}.type`, 'TYPE_UNSUPPORTED', 'Loại mục nội dung không được hỗ trợ.')
  const attributesValue = item.attributes
  const attributes = attributesValue === undefined
    ? []
    : !Array.isArray(attributesValue)
      ? fail(`${path}.attributes`, 'ARRAY_INVALID', 'Danh sách thuộc tính không hợp lệ.')
      : attributesValue.map((attribute, index) => parseAttribute(attribute, `${path}.attributes.${index}`, index))
  const attributeKeys = new Set<string>()
  for (const [index, attribute] of attributes.entries()) {
    if (attributeKeys.has(attribute.key)) fail(`${path}.attributes.${index}.key`, 'DUPLICATE', 'Mã thuộc tính bị lặp.')
    attributeKeys.add(attribute.key)
  }
  return {
    key,
    type: type as CatalogAccessoryContentSectionType,
    title: stringValue(item.title, `${path}.title`, 200, true),
    ...(attributes.length > 0 ? { attributes } : {}),
    ...(item.items === undefined ? {} : { items: stringArray(item.items, `${path}.items`, 100) }),
    ...(item.bodyPlaceholder === undefined ? {} : { bodyPlaceholder: stringValue(item.bodyPlaceholder, `${path}.bodyPlaceholder`, 1000) }),
  }
}

function parseOptionGroup(value: unknown, path: string): AccessoryTemplateOptionGroupDefinition {
  const item = record(value, path)
  const displayType = stringValue(item.displayType, `${path}.displayType`, 20, true)
  if (!DISPLAY_TYPES.has(displayType)) fail(`${path}.displayType`, 'DISPLAY_TYPE_UNSUPPORTED', 'Kiểu hiển thị không được hỗ trợ.')
  const rawValues = item.values === undefined ? [] : item.values
  if (!Array.isArray(rawValues) || rawValues.length > 100) fail(`${path}.values`, 'ARRAY_INVALID', 'Danh sách giá trị không hợp lệ.')
  const values = rawValues.map((raw, index) => {
    const valueRecord = record(raw, `${path}.values.${index}`)
    return {
      code: stringValue(valueRecord.code, `${path}.values.${index}.code`, 80, true),
      name: stringValue(valueRecord.name, `${path}.values.${index}.name`, 200, true),
      colorHex: valueRecord.colorHex === undefined || valueRecord.colorHex === null
        ? null
        : stringValue(valueRecord.colorHex, `${path}.values.${index}.colorHex`, 20),
    }
  })
  const codes = new Set<string>()
  values.forEach((value, index) => {
    if (codes.has(value.code)) fail(`${path}.values.${index}.code`, 'DUPLICATE', 'Mã giá trị bị lặp.')
    codes.add(value.code)
  })
  const minimumSelections = item.minimumSelections === undefined ? 0 : integer(item.minimumSelections, `${path}.minimumSelections`, 0, 20)
  const maximumSelections = item.maximumSelections === undefined ? Math.max(1, values.length) : integer(item.maximumSelections, `${path}.maximumSelections`, 1, 20)
  if (maximumSelections < minimumSelections) fail(`${path}.maximumSelections`, 'RANGE_INVALID', 'Số lựa chọn tối đa phải lớn hơn hoặc bằng tối thiểu.')
  return {
    key: stringValue(item.key, `${path}.key`, 80, true),
    code: stringValue(item.code, `${path}.code`, 80, true),
    name: stringValue(item.name, `${path}.name`, 200, true),
    displayType: displayType as AccessoryTemplateOptionGroupDefinition['displayType'],
    minimumSelections,
    maximumSelections,
    values,
  }
}

export function parseAccessoryTemplateDefinition(value: unknown, path = 'definition'): AccessoryTemplateDefinition {
  const input = record(value, path)
  if (input.schema !== ACCESSORY_TEMPLATE_SCHEMA) fail(`${path}.schema`, 'SCHEMA_INVALID', 'Mẫu phải dùng accessory_template_v1.')
  const sectionsValue = input.sections
  if (!Array.isArray(sectionsValue) || sectionsValue.length > 30) fail(`${path}.sections`, 'ARRAY_INVALID', 'Mẫu không được vượt quá 30 mục nội dung.')
  const sections = sectionsValue.map((section, index) => parseSection(section, `${path}.sections.${index}`))
  const sectionKeys = new Set<string>()
  sections.forEach((section, index) => {
    if (sectionKeys.has(section.key)) fail(`${path}.sections.${index}.key`, 'DUPLICATE', 'Mã mục nội dung bị lặp.')
    sectionKeys.add(section.key)
  })
  const optionGroupsValue = input.optionGroups === undefined ? [] : input.optionGroups
  if (!Array.isArray(optionGroupsValue) || optionGroupsValue.length > 20) fail(`${path}.optionGroups`, 'ARRAY_INVALID', 'Mẫu không được vượt quá 20 nhóm thuộc tính.')
  const optionGroups = optionGroupsValue.map((group, index) => parseOptionGroup(group, `${path}.optionGroups.${index}`))
  const optionKeys = new Set<string>()
  optionGroups.forEach((group, index) => {
    if (optionKeys.has(group.key)) fail(`${path}.optionGroups.${index}.key`, 'DUPLICATE', 'Mã nhóm thuộc tính bị lặp.')
    optionKeys.add(group.key)
  })
  return {
    schema: ACCESSORY_TEMPLATE_SCHEMA,
    suggestedCategorySlugs: stringArray(input.suggestedCategorySlugs, `${path}.suggestedCategorySlugs`, 20),
    suggestedOptionCodes: stringArray(input.suggestedOptionCodes, `${path}.suggestedOptionCodes`, 20),
    sections,
    optionGroups,
  }
}

export function parseAccessoryTemplateWriteInput(value: unknown): AdminAccessoryTemplateWriteInput {
  const input = record(value, 'body')
  const name = stringValue(input.name, 'name', 200, true)
  const suppliedCode = input.code === undefined || input.code === null ? '' : stringValue(input.code, 'code', 80)
  const codeGenerated = suppliedCode.length === 0
  const code = codeGenerated ? accessoryTemplateCodeFromName(name) : suppliedCode
  if (!CODE_PATTERN.test(code)) fail('code', 'CODE_INVALID', 'Mã mẫu chỉ gồm chữ thường, số và dấu gạch ngang.')
  const groupName = input.groupName === undefined || input.groupName === null ? null : stringValue(input.groupName, 'groupName', 100)
  const description = input.description === undefined || input.description === null ? null : stringValue(input.description, 'description', 1000)
  const displayOrder = input.displayOrder === undefined ? undefined : integer(input.displayOrder, 'displayOrder', 0, 100_000)
  const isActive = input.isActive === undefined ? true : input.isActive
  if (typeof isActive !== 'boolean') fail('isActive', 'BOOLEAN_REQUIRED', 'Trạng thái mẫu không hợp lệ.')
  return {
    code,
    codeGenerated,
    name,
    groupName,
    description,
    displayOrder,
    isActive,
    definition: parseAccessoryTemplateDefinition(input.definition),
    changeNote: input.changeNote === undefined || input.changeNote === null ? null : stringValue(input.changeNote, 'changeNote', 500),
  }
}

export function parseAccessoryTemplateMetadataPatch(value: unknown): AdminAccessoryTemplateMetadataPatch {
  const input = record(value, 'body')
  const allowed = new Set(['code', 'name', 'groupName', 'description', 'displayOrder', 'isActive', 'expectedUpdatedAt'])
  const keys = Object.keys(input)
  if (keys.length === 0 || keys.some((key) => !allowed.has(key))) fail('body', 'FIELDS_UNSUPPORTED', 'Dữ liệu cập nhật chứa trường không được hỗ trợ.')
  const patch: AdminAccessoryTemplateMetadataPatch = {}
  if ('code' in input) {
    const code = stringValue(input.code, 'code', 80, true)
    if (!CODE_PATTERN.test(code)) fail('code', 'CODE_INVALID', 'Mã mẫu chỉ gồm chữ thường, số và dấu gạch ngang.')
    patch.code = code
  }
  if ('name' in input) patch.name = stringValue(input.name, 'name', 200, true)
  if ('groupName' in input) patch.groupName = input.groupName === null ? null : stringValue(input.groupName, 'groupName', 100)
  if ('description' in input) patch.description = input.description === null ? null : stringValue(input.description, 'description', 1000)
  if ('displayOrder' in input) patch.displayOrder = integer(input.displayOrder, 'displayOrder', 0, 100_000)
  if ('isActive' in input) {
    if (typeof input.isActive !== 'boolean') fail('isActive', 'BOOLEAN_REQUIRED', 'Trạng thái mẫu không hợp lệ.')
    patch.isActive = input.isActive
  }
  if ('expectedUpdatedAt' in input) {
    patch.expectedUpdatedAt = stringValue(input.expectedUpdatedAt, 'expectedUpdatedAt', 50, true)
    if (!Number.isFinite(Date.parse(patch.expectedUpdatedAt))) fail('expectedUpdatedAt', 'DATE_INVALID', 'Phiên bản cập nhật không hợp lệ.')
  }
  return patch
}
