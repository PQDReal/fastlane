import {
  draftOptionGroupIsRequired,
  projectedVariantCount,
  nonEmptyUrls,
  variantGroups,
  variantSignature,
  type AdminAccessoryDraft,
  type DraftOptionGroup,
  type DraftVariant,
} from '@/lib/catalog/admin-accessory-draft'

export type DraftValidationIssue = {
  path: string
  section: 'options' | 'variants' | 'review'
  severity: 'error' | 'warning'
  code: string
  message: string
}

const GROUP_CODE_PATTERN = /^[a-z][a-z0-9_]*$/
const VALUE_CODE_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const COLOR_PATTERN = /^#[0-9a-f]{6}$/i

function isHttpUrl(value: string) {
  if (!value.trim()) return true
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function normalized(value: string) {
  return value.trim().toLocaleLowerCase('vi-VN')
}

function duplicateIndexes(values: string[]) {
  const counts = new Map<string, number>()
  values.filter(Boolean).forEach((value) => counts.set(value, (counts.get(value) ?? 0) + 1))
  return new Set([...counts].filter(([, count]) => count > 1).map(([value]) => value))
}

function validateGroup(group: DraftOptionGroup, groupIndex: number): DraftValidationIssue[] {
  const issues: DraftValidationIssue[] = []
  const path = `optionGroups.${groupIndex}`
  const minimum = group.minimumSelections ?? (group.required === false ? 0 : 1)
  const maximum = group.maximumSelections ?? 1

  if (!group.name.trim() || group.name.trim().length > 160) {
    issues.push({ path: `${path}.name`, section: 'options', severity: 'error', code: 'OPTION_GROUP_NAME_INVALID', message: 'Tên nhóm phải có từ 1 đến 160 ký tự.' })
  }
  if (!GROUP_CODE_PATTERN.test(group.code.trim()) || group.code.trim().length > 80) {
    issues.push({ path: `${path}.code`, section: 'options', severity: 'error', code: 'OPTION_GROUP_CODE_INVALID', message: 'Mã nhóm phải bắt đầu bằng chữ thường và chỉ gồm chữ, số hoặc dấu gạch dưới.' })
  }
  if (!Number.isInteger(minimum) || !Number.isInteger(maximum) || minimum < 0 || maximum < 1 || maximum > 20 || minimum > maximum) {
    issues.push({ path: `${path}.selectionLimits`, section: 'options', severity: 'error', code: 'OPTION_SELECTION_LIMIT_INVALID', message: 'Giới hạn lựa chọn không hợp lệ.' })
  }
  if (maximum !== 1) {
    issues.push({ path: `${path}.maximumSelections`, section: 'options', severity: 'error', code: 'VARIANT_GROUP_MAXIMUM_INVALID', message: 'Thuộc tính tạo biến thể chỉ cho phép chọn một giá trị.' })
  }
  if (group.values.length === 0 || group.values.length > 100 || maximum > group.values.length) {
    issues.push({ path: `${path}.values`, section: 'options', severity: 'error', code: 'OPTION_VALUES_COUNT_INVALID', message: 'Nhóm cần 1–100 giá trị và số chọn tối đa không được vượt số giá trị.' })
  }

  const duplicateCodes = duplicateIndexes(group.values.map((value) => normalized(value.code)))
  group.values.forEach((value, valueIndex) => {
    const valuePath = `${path}.values.${valueIndex}`
    if (!value.name.trim() || value.name.trim().length > 160) {
      issues.push({ path: `${valuePath}.name`, section: 'options', severity: 'error', code: 'OPTION_VALUE_NAME_INVALID', message: 'Tên giá trị phải có từ 1 đến 160 ký tự.' })
    }
    if (!VALUE_CODE_PATTERN.test(value.code.trim()) || value.code.trim().length > 80) {
      issues.push({ path: `${valuePath}.code`, section: 'options', severity: 'error', code: 'OPTION_VALUE_CODE_INVALID', message: 'Mã giá trị chỉ gồm chữ thường, số và dấu gạch ngang.' })
    } else if (duplicateCodes.has(normalized(value.code))) {
      issues.push({ path: `${valuePath}.code`, section: 'options', severity: 'error', code: 'OPTION_VALUE_CODE_DUPLICATE', message: 'Mã giá trị bị trùng trong nhóm.' })
    }
    if (value.colorHex.trim() && !COLOR_PATTERN.test(value.colorHex.trim())) {
      issues.push({ path: `${valuePath}.colorHex`, section: 'options', severity: 'error', code: 'OPTION_COLOR_INVALID', message: 'Mã màu phải có dạng #RRGGBB.' })
    }
    if (!isHttpUrl(value.swatchUrl)) {
      issues.push({ path: `${valuePath}.swatchUrl`, section: 'options', severity: 'error', code: 'OPTION_SWATCH_URL_INVALID', message: 'URL swatch phải dùng HTTP hoặc HTTPS.' })
    }
  })

  return issues
}

function validateVariants(draft: AdminAccessoryDraft): DraftValidationIssue[] {
  const issues: DraftValidationIssue[] = []
  const included = draft.variants.filter((variant) => variant.isIncluded !== false)
  const duplicateSignatures = duplicateIndexes(included.map((variant) => variantSignature(variant, draft.optionGroups)))

  if (included.length === 0 || !included.some((variant) => variant.isActive)) {
    issues.push({ path: 'variants', section: 'variants', severity: 'error', code: 'ACTIVE_VARIANT_REQUIRED', message: 'Cần ít nhất một biến thể được bán và đang hoạt động.' })
  }

  draft.variants.forEach((variant, index) => {
    if (variant.isIncluded === false) return
    const path = `variants.${index}`
    const originalPrice = Number(variant.originalPrice)
    const salePrice = variant.salePrice.trim() ? Number(variant.salePrice) : null
    const stockQuantity = Number(variant.stockQuantity ?? '0')
    if (!variant.name.trim()) issues.push({ path: `${path}.name`, section: 'variants', severity: 'error', code: 'VARIANT_NAME_REQUIRED', message: 'Tên biến thể không được để trống.' })
    if (!Number.isSafeInteger(originalPrice) || originalPrice < 0) {
      issues.push({ path: `${path}.originalPrice`, section: 'variants', severity: 'error', code: 'VARIANT_PRICE_INVALID', message: 'Giá niêm yết phải là số nguyên VND không âm.' })
    }
    if (salePrice !== null && (!Number.isSafeInteger(salePrice) || salePrice < 0 || salePrice >= originalPrice)) {
      issues.push({ path: `${path}.salePrice`, section: 'variants', severity: 'error', code: 'VARIANT_SALE_PRICE_INVALID', message: 'Giá khuyến mại phải là số nguyên không âm và thấp hơn giá niêm yết.' })
    }
    if (!Number.isSafeInteger(stockQuantity) || stockQuantity < 0) {
      issues.push({ path: `${path}.stockQuantity`, section: 'variants', severity: 'error', code: 'VARIANT_STOCK_INVALID', message: 'Tồn kho ban đầu phải là số nguyên không âm.' })
    }
    if (duplicateSignatures.has(variantSignature(variant, draft.optionGroups))) {
      issues.push({ path: `${path}.selections`, section: 'variants', severity: 'error', code: 'VARIANT_SIGNATURE_DUPLICATE', message: 'Tổ hợp tùy chọn của biến thể bị trùng.' })
    }
    for (const group of variantGroups(draft.optionGroups)) {
      if (draftOptionGroupIsRequired(group) && !variant.selections[group.id]) {
        issues.push({ path: `${path}.selections.${group.id}`, section: 'variants', severity: 'error', code: 'VARIANT_SELECTION_REQUIRED', message: `Cần chọn ${group.name || 'thuộc tính bắt buộc'}.` })
      }
    }
    const imageUrls = nonEmptyUrls(variant.imageUrls)
    if (imageUrls.length > 20) {
      issues.push({ path: `${path}.imageUrls`, section: 'variants', severity: 'error', code: 'VARIANT_MEDIA_LIMIT_INVALID', message: 'Mỗi SKU chỉ được có tối đa 20 ảnh.' })
    }
    if (variant.imageUrls.some((url) => !isHttpUrl(url))) {
      issues.push({ path: `${path}.imageUrls`, section: 'variants', severity: 'error', code: 'VARIANT_MEDIA_URL_INVALID', message: 'URL hình ảnh SKU phải dùng HTTP hoặc HTTPS.' })
    }
    const duplicateImageUrls = duplicateIndexes(imageUrls.map((url) => normalized(url)))
    if (duplicateImageUrls.size > 0) {
      issues.push({ path: `${path}.imageUrls`, section: 'variants', severity: 'error', code: 'VARIANT_MEDIA_DUPLICATE', message: 'URL hình ảnh SKU không được trùng.' })
    }
    if (imageUrls.length === 0) {
      issues.push({ path: `${path}.imageUrls`, section: 'variants', severity: 'error', code: 'VARIANT_MEDIA_REQUIRED', message: `${variant.name || `Biến thể ${index + 1}`} cần ít nhất một ảnh trực tiếp.` })
    }
  })

  return issues
}

export function validateAdminAccessoryDraft(draft: AdminAccessoryDraft): DraftValidationIssue[] {
  const issues: DraftValidationIssue[] = []
  const duplicateGroupCodes = duplicateIndexes(draft.optionGroups.map((group) => normalized(group.code)))
  draft.optionGroups.forEach((group, index) => {
    issues.push(...validateGroup(group, index))
    if (duplicateGroupCodes.has(normalized(group.code))) {
      issues.push({ path: `optionGroups.${index}.code`, section: 'options', severity: 'error', code: 'OPTION_GROUP_CODE_DUPLICATE', message: 'Mã nhóm tùy chọn bị trùng trong sản phẩm.' })
    }
  })

  const matrixSize = projectedVariantCount(draft.optionGroups)
  if (matrixSize > 500) issues.push({ path: 'optionGroups', section: 'options', severity: 'error', code: 'VARIANT_MATRIX_TOO_LARGE', message: `Ma trận ${matrixSize} tổ hợp vượt giới hạn prototype là 500.` })
  else if (matrixSize >= 100) issues.push({ path: 'optionGroups', section: 'options', severity: 'warning', code: 'VARIANT_MATRIX_LARGE', message: `Ma trận sẽ tạo ${matrixSize} tổ hợp; hãy kiểm tra trước khi tiếp tục.` })

  issues.push(...validateVariants(draft))
  return issues
}

export function firstDraftError(
  issues: DraftValidationIssue[],
  section: DraftValidationIssue['section'],
) {
  return issues.find((issue) => issue.section === section && issue.severity === 'error')
}

export function variantValidationIssues(
  draft: AdminAccessoryDraft,
  variant: DraftVariant,
) {
  const index = draft.variants.findIndex((item) => item.id === variant.id)
  return validateAdminAccessoryDraft(draft).filter((issue) => issue.path.startsWith(`variants.${index}.`))
}
