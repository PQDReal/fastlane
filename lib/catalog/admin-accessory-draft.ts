import type { CatalogServiceLabel } from '@/lib/catalog/service-labels'
import type {
  CatalogAccessoryContentSectionType,
  CatalogMedia,
  CatalogOptionGroup,
  CatalogProduct,
  CatalogVariant,
} from '@/lib/catalog/types'

export type AdminRootCategory = {
  id: string
  name: string
  slug: string
  is_active?: boolean
  isActive?: boolean
}

export type DraftCollection = {
  id: string
  parentId: string | null
  kind: 'CATEGORY' | 'MODEL' | 'CAMPAIGN'
  slug: string
  name: string
  displayOrder: number
}

export type DraftContentAttribute = {
  id: string
  label: string
  value: string
}

export type DraftContentSection = {
  id: string
  type: CatalogAccessoryContentSectionType
  title: string
  body: string
  itemsText: string
  attributes: DraftContentAttribute[]
}

export type DraftOptionValue = {
  id: string
  code: string
  name: string
  colorHex: string
  swatchUrl: string
  imageUrls: string[]
}

export type DraftOptionGroup = {
  id: string
  presetCode: string
  code: string
  name: string
  displayType: 'BUTTON' | 'SWATCH' | 'SELECT'
  minimumSelections?: number
  maximumSelections?: number
  /** undefined = tự suy luận từ color/swatch hoặc dữ liệu ảnh hiện có. */
  mediaEnabled?: boolean
  /** Legacy prototype field; normalized to minimumSelections when restoring drafts. */
  required?: boolean
  values: DraftOptionValue[]
}

export type DraftOptionPreset = {
  code: string
  name: string
  displayType: DraftOptionGroup['displayType']
  usageCount: number
  suggestedValues: string[]
}

export type DraftVariant = {
  id: string
  name: string
  sku: string
  originalPrice: string
  salePrice: string
  isActive: boolean
  isIncluded?: boolean
  selections: Record<string, string | null>
  imageUrls: string[]
}

export type AdminAccessoryDraft = {
  rootCategoryId: string
  primaryCollectionSlug: string
  modelCollectionSlugs: string[]
  name: string
  slug: string
  description: string
  isActive: boolean
  serviceLabelIds: string[]
  sections: DraftContentSection[]
  optionGroups: DraftOptionGroup[]
  /** undefined = tự chọn nhóm hình ảnh phù hợp; null = chỉ dùng gallery chung. */
  mediaOptionGroupId?: string | null
  variants: DraftVariant[]
  productImageUrls: string[]
}

export const ACCESSORY_ROOT_SLUG = 'phu-kien'

const ACCESSORY_ELECTRIC_CAR_COLLECTION_ID = 'preview-collection-phu-kien-o-to-dien'

export const ACCESSORY_CATEGORY_COLLECTIONS: DraftCollection[] = [
  { id: 'preview-collection-phong-cach-song', parentId: null, kind: 'CATEGORY', slug: 'phong-cach-song', name: 'Phong cách sống', displayOrder: 10 },
  { id: ACCESSORY_ELECTRIC_CAR_COLLECTION_ID, parentId: null, kind: 'CATEGORY', slug: 'phu-kien-o-to-dien', name: 'Phụ kiện ô tô điện', displayOrder: 20 },
  { id: 'preview-collection-sac-o-to-dien', parentId: null, kind: 'CATEGORY', slug: 'sac-o-to-dien', name: 'Sạc ô tô điện', displayOrder: 30 },
  { id: 'preview-collection-phu-kien-xe-may-dien', parentId: null, kind: 'CATEGORY', slug: 'phu-kien-xe-may-dien', name: 'Phụ kiện xe máy điện', displayOrder: 40 },
  { id: 'preview-collection-phu-kien-o-to-xang', parentId: null, kind: 'CATEGORY', slug: 'phu-kien-o-to-xang', name: 'Phụ kiện ô tô xăng', displayOrder: 50 },
]

export const ACCESSORY_MODEL_COLLECTIONS: DraftCollection[] = [
  { id: 'preview-collection-vf-9', parentId: ACCESSORY_ELECTRIC_CAR_COLLECTION_ID, kind: 'MODEL', slug: 'vf-9', name: 'VF 9', displayOrder: 10 },
  { id: 'preview-collection-vf-8', parentId: ACCESSORY_ELECTRIC_CAR_COLLECTION_ID, kind: 'MODEL', slug: 'vf-8', name: 'VF 8', displayOrder: 20 },
  { id: 'preview-collection-vf-7', parentId: ACCESSORY_ELECTRIC_CAR_COLLECTION_ID, kind: 'MODEL', slug: 'vf-7', name: 'VF 7', displayOrder: 30 },
  { id: 'preview-collection-vf-6', parentId: ACCESSORY_ELECTRIC_CAR_COLLECTION_ID, kind: 'MODEL', slug: 'vf-6', name: 'VF 6', displayOrder: 40 },
  { id: 'preview-collection-nerio-green', parentId: ACCESSORY_ELECTRIC_CAR_COLLECTION_ID, kind: 'MODEL', slug: 'nerio-green', name: 'Nerio Green', displayOrder: 50 },
  { id: 'preview-collection-limo-green', parentId: ACCESSORY_ELECTRIC_CAR_COLLECTION_ID, kind: 'MODEL', slug: 'limo-green', name: 'Limo Green', displayOrder: 60 },
  { id: 'preview-collection-vf-5', parentId: ACCESSORY_ELECTRIC_CAR_COLLECTION_ID, kind: 'MODEL', slug: 'vf-5', name: 'VF 5', displayOrder: 70 },
  { id: 'preview-collection-vf-3', parentId: ACCESSORY_ELECTRIC_CAR_COLLECTION_ID, kind: 'MODEL', slug: 'vf-3', name: 'VF 3', displayOrder: 80 },
]

export const ACCESSORY_CATALOG_COLLECTIONS = [
  ...ACCESSORY_CATEGORY_COLLECTIONS,
  ...ACCESSORY_MODEL_COLLECTIONS,
]

export function accessoryCategoryCollections(collections: DraftCollection[]) {
  return collections
    .filter((collection) => collection.kind === 'CATEGORY' && collection.parentId === null)
    .sort((left, right) => left.displayOrder - right.displayOrder || left.name.localeCompare(right.name, 'vi'))
}

export function accessoryModelCollectionsForCategory(
  collections: DraftCollection[],
  categorySlug: string,
) {
  const category = collections.find((collection) => (
    collection.kind === 'CATEGORY' && collection.slug === categorySlug
  ))
  if (!category) return []

  return collections
    .filter((collection) => collection.kind === 'MODEL' && collection.parentId === category.id)
    .sort((left, right) => left.displayOrder - right.displayOrder || left.name.localeCompare(right.name, 'vi'))
}

export const ACCESSORY_OPTION_PRESETS: DraftOptionPreset[] = [
  {
    code: 'color',
    name: 'Màu sắc',
    displayType: 'SWATCH',
    usageCount: 133,
    suggestedValues: [
      'Summer Yellow', 'Rose Pink', 'Urban Mint', 'đen', 'xanh', 'Trắng', 'Đen',
      'Xanh', 'Cam', 'trắng', 'VinFast Blue', 'Crimson Red', 'Neptune Grey',
      'Deep Ocean', 'Ghi', 'Xanh Azure', 'xanh navy', 'nâu', 'be', 'xám',
      'Màu trắng', 'Màu đen', 'Màu vàng', 'Đỏ tươi', 'Màu tím', 'Màu hồng',
      'Xanh biển', 'Xanh rêu', 'Xanh ngọc', 'Xanh Olive', 'Vàng cát', 'Màu Cam',
      'Màu Đỏ', 'Màu Hồng nhạt', 'Màu Tím nhạt', 'Màu Tím đậm', 'Màu Vàng cam',
      'Màu Xanh Cổ vịt', 'Màu Xanh lá', 'Màu Xanh lam', 'Màu Xám',
    ],
  },
  {
    code: 'size',
    name: 'Kích thước',
    displayType: 'BUTTON',
    usageCount: 80,
    suggestedValues: ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '90', '95', '100', '105', '110'],
  },
  {
    code: 'package',
    name: 'Phiên bản / Bộ sản phẩm',
    displayType: 'BUTTON',
    usageCount: 54,
    suggestedValues: [
      'Không có tấm che', 'Có tấm che', 'Bên Trái', 'Bên Phải', 'Pin LFP', 'Pin SDI',
      'Signature', 'Premium', 'Luxury', 'First Royal', '6 Chỗ', '7 Chỗ',
    ],
  },
]

export const ACCESSORY_SECTION_TYPES: Array<{
  value: CatalogAccessoryContentSectionType
  label: string
  defaultTitle: string
}> = [
  { value: 'TECHNICAL_SPECS', label: 'Thông tin kỹ thuật', defaultTitle: 'Thông tin kỹ thuật' },
  { value: 'FEATURES', label: 'Tính năng', defaultTitle: 'Tính năng nổi bật' },
  { value: 'USAGE_GUIDE', label: 'Hướng dẫn sử dụng', defaultTitle: 'Hướng dẫn sử dụng' },
  { value: 'CARE_GUIDE', label: 'Hướng dẫn bảo quản', defaultTitle: 'Hướng dẫn bảo quản' },
  { value: 'INSTALLATION_GUIDE', label: 'Hướng dẫn lắp đặt', defaultTitle: 'Hướng dẫn lắp đặt' },
  { value: 'PACKAGE_CONTENTS', label: 'Bộ sản phẩm', defaultTitle: 'Bộ sản phẩm' },
  { value: 'WARRANTY', label: 'Bảo hành', defaultTitle: 'Chính sách bảo hành' },
  { value: 'SHIPPING_NOTE', label: 'Lưu ý giao hàng', defaultTitle: 'Lưu ý giao hàng' },
  { value: 'SAFETY_NOTE', label: 'Lưu ý an toàn', defaultTitle: 'Lưu ý an toàn' },
  { value: 'PURCHASE_NOTE', label: 'Lưu ý mua hàng', defaultTitle: 'Lưu ý khi mua hàng' },
  { value: 'OTHER', label: 'Thông tin khác', defaultTitle: 'Thông tin khác' },
]

export function accessoryAdminSlug(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function createAdminAccessoryDraft(): AdminAccessoryDraft {
  return {
    rootCategoryId: '',
    primaryCollectionSlug: '',
    modelCollectionSlugs: [],
    name: '',
    slug: '',
    description: '',
    isActive: false,
    serviceLabelIds: [],
    sections: [],
    optionGroups: [],
    variants: [{
      id: 'variant-1',
      name: 'Mặc định',
      sku: '',
      originalPrice: '',
      salePrice: '',
      isActive: true,
      isIncluded: true,
      selections: {},
      imageUrls: [''],
    }],
    productImageUrls: [''],
  }
}

export function nonEmptyUrls(urls: string[]) {
  return urls.map((url) => url.trim()).filter(Boolean)
}

export function formatDraftPrice(value: string) {
  const amount = Number(value)
  if (!Number.isFinite(amount)) return 'Liên hệ'
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(amount)
}

export function isSectionComplete(section: DraftContentSection) {
  return Boolean(
    section.title.trim()
    && (
      section.body.trim()
      || section.itemsText.split('\n').some((item) => item.trim())
      || section.attributes.some((attribute) => attribute.label.trim() && attribute.value.trim())
    ),
  )
}

export function draftOptionGroupIsRequired(group: DraftOptionGroup) {
  return group.minimumSelections !== undefined
    ? group.minimumSelections > 0
    : group.required !== false
}

export function createDraftOptionValue(id: string): DraftOptionValue {
  return {
    id,
    code: '',
    name: '',
    colorHex: '',
    swatchUrl: '',
    imageUrls: [''],
  }
}

export function variantGroups(groups: DraftOptionGroup[]) {
  return groups
}

export function draftOptionGroupSupportsMedia(group: DraftOptionGroup) {
  if (group.mediaEnabled !== undefined) return group.mediaEnabled
  return group.presetCode === 'color'
    || group.code === 'color'
    || group.displayType === 'SWATCH'
    || group.values.some((value) => nonEmptyUrls(value.imageUrls).length > 0)
}

export function resolvedDraftMediaOptionGroupId(draft: AdminAccessoryDraft) {
  if (draft.mediaOptionGroupId === null) return null
  const usableGroups = draft.optionGroups.filter((group) => (
    draftOptionGroupSupportsMedia(group)
    && group.values.some((value) => value.name.trim())
  ))
  if (draft.mediaOptionGroupId && usableGroups.some((group) => group.id === draft.mediaOptionGroupId)) {
    return draft.mediaOptionGroupId
  }

  return usableGroups.find((group) => (
    group.presetCode === 'color'
    || group.code === 'color'
    || group.displayType === 'SWATCH'
  ))?.id ?? usableGroups[0]?.id ?? null
}

export function variantSignature(variant: DraftVariant, groups: DraftOptionGroup[]) {
  return variantGroups(groups)
    .map((group) => `${group.id}=${variant.selections[group.id] ?? '<none>'}`)
    .sort()
    .join('|')
}

export function projectedVariantCount(groups: DraftOptionGroup[]) {
  const usableGroups = variantGroups(groups).filter((group) => (
    group.values.some((value) => value.name.trim() && value.code.trim())
  ))
  if (usableGroups.length === 0) return 1
  return usableGroups.reduce((total, group) => {
    const valueCount = group.values.filter((value) => value.name.trim() && value.code.trim()).length
    return total * (valueCount + (draftOptionGroupIsRequired(group) ? 0 : 1))
  }, 1)
}

export function generateVariantSku(
  prefix: string,
  variant: DraftVariant,
  groups: DraftOptionGroup[],
  index: number,
) {
  const normalizedPrefix = prefix
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  if (!normalizedPrefix) return variant.sku

  const optionCodes = variantGroups(groups).flatMap((group) => {
    const selectedValue = group.values.find((value) => value.id === variant.selections[group.id])
    return selectedValue?.code ? [selectedValue.code.toUpperCase()] : []
  })
  return [normalizedPrefix, ...(optionCodes.length > 0 ? optionCodes : [String(index + 1).padStart(2, '0')])]
    .join('-')
    .replace(/[^A-Z0-9-]+/g, '-')
}

export function buildVariantMatrix(groups: DraftOptionGroup[], currentVariants: DraftVariant[]) {
  const usableGroups = variantGroups(groups)
    .map((group) => ({
      ...group,
      values: group.values.filter((value) => value.name.trim() && value.code.trim()),
    }))
    .filter((group) => group.values.length > 0)
  if (usableGroups.length === 0) {
    const currentDefault = currentVariants.find((variant) => Object.keys(variant.selections).length === 0) ?? currentVariants[0]
    return currentDefault
      ? [{ ...currentDefault, name: 'Mặc định', selections: {} }]
      : createAdminAccessoryDraft().variants
  }

  const selections = usableGroups.reduce<Array<Record<string, string | null>>>(
    (rows, group) => {
      const choices: Array<string | null> = [
        ...(draftOptionGroupIsRequired(group) ? [] : [null]),
        ...group.values.map((value) => value.id),
      ]
      return rows.flatMap((row) => choices.map((valueId) => ({ ...row, [group.id]: valueId })))
    },
    [{}],
  )
  const currentBySignature = new Map<string, DraftVariant>()
  currentVariants.forEach((variant) => {
    const signature = variantSignature(variant, usableGroups)
    if (!currentBySignature.has(signature)) currentBySignature.set(signature, variant)
  })

  return selections.map((selection, index) => {
    const signature = usableGroups
      .map((group) => `${group.id}=${selection[group.id] ?? '<none>'}`)
      .sort()
      .join('|')
    const name = usableGroups.map((group) => (
      selection[group.id] === null
        ? `Không chọn ${group.name.toLocaleLowerCase('vi-VN')}`
        : group.values.find((value) => value.id === selection[group.id])?.name || group.name
    )).join(' / ')
    const existing = currentBySignature.get(signature)
    if (existing) return { ...existing, name, selections: selection }

    return {
      id: `matrix-${index + 1}-${signature.replace(/[^a-zA-Z0-9]+/g, '-').slice(0, 80)}`,
      name,
      sku: '',
      originalPrice: '',
      salePrice: '',
      isActive: true,
      isIncluded: true,
      selections: selection,
      imageUrls: [''],
    }
  })
}

function previewMediaType(url: string): CatalogMedia['mediaType'] {
  return /\.(?:mp4|webm|mov)(?:\?|$)/i.test(url) ? 'VIDEO' : 'IMAGE'
}

function previewMediaRows({
  urls,
  productId,
  scope,
  scopeId,
  productName,
}: {
  urls: string[]
  productId: string
  scope: 'product' | 'variant' | 'option'
  scopeId?: string
  productName: string
}): CatalogMedia[] {
  return nonEmptyUrls(urls).map((url, index) => ({
    id: `preview-media-${scope}-${scopeId ?? 'product'}-${index + 1}`,
    productId,
    variantId: scope === 'variant' ? scopeId ?? null : null,
    optionValueId: scope === 'option' ? scopeId ?? null : null,
    role: index === 0 ? 'HERO' : 'GALLERY',
    mediaType: previewMediaType(url),
    url,
    altText: productName,
    displayOrder: (index + 1) * 10,
    metadata: { preview: true },
  }))
}

/** Adapts the unsaved admin draft to the same catalog contract used by customer pages. */
export function adminAccessoryDraftToCatalogProduct(
  draft: AdminAccessoryDraft,
  serviceLabels: CatalogServiceLabel[],
  collections: DraftCollection[] = ACCESSORY_CATALOG_COLLECTIONS,
): CatalogProduct {
  const productId = 'preview-product'
  const productName = draft.name.trim() || 'Tên phụ kiện mới'
  const mediaOptionGroupId = resolvedDraftMediaOptionGroupId(draft)
  const transformedGroups = variantGroups(draft.optionGroups).map((group, groupIndex) => {
    const groupCode = group.code.trim() || `option_${groupIndex + 1}`
    const values = group.values.map((value, valueIndex) => ({
      source: value,
      catalog: {
        id: value.id,
        code: value.code.trim() || accessoryAdminSlug(value.name) || `value-${valueIndex + 1}`,
        name: value.name.trim() || `Giá trị ${valueIndex + 1}`,
        swatchUrl: value.swatchUrl.trim() || null,
        colorHex: value.colorHex.trim() || null,
        priceAdjustment: 0,
        displayOrder: (valueIndex + 1) * 10,
        metadata: { preview: true },
      },
    }))
    const catalog: CatalogOptionGroup = {
      id: group.id,
      code: groupCode,
      name: group.name.trim() || `Tùy chọn ${groupIndex + 1}`,
      displayType: group.displayType,
      minimumSelections: draftOptionGroupIsRequired(group) ? 1 : 0,
      maximumSelections: 1,
      displayOrder: (groupIndex + 1) * 10,
      metadata: {
        preview: true,
        primary: groupIndex === 0,
        drivesMedia: group.id === mediaOptionGroupId,
      },
      values: values.map(({ catalog: value }) => value),
    }
    return { source: group, catalog, values }
  })

  const includedVariants = draft.variants.filter((variant) => variant.isIncluded !== false)
  const sourceVariants = includedVariants.some((variant) => variant.isActive)
    ? includedVariants.filter((variant) => variant.isActive)
    : includedVariants.slice(0, 1)
  const variants: CatalogVariant[] = sourceVariants.map((variant) => {
    const selectedOptionDetails = transformedGroups.flatMap(({ source: group, catalog, values }) => {
      const selected = values.find(({ source: value }) => value.id === variant.selections[group.id])
      return selected ? [{
        groupId: group.id,
        groupCode: catalog.code,
        groupName: catalog.name,
        valueId: selected.catalog.id,
        valueCode: selected.catalog.code,
        valueName: selected.catalog.name,
        priceAdjustment: 0,
      }] : []
    })
    const selectedOptions = Object.fromEntries(selectedOptionDetails.map((option) => [option.groupCode, option.valueCode]))
    const originalPrice = Number(variant.originalPrice)
    const normalizedOriginalPrice = Number.isFinite(originalPrice) && originalPrice >= 0 ? originalPrice : 0
    const salePrice = variant.salePrice.trim() ? Number(variant.salePrice) : null
    const normalizedSalePrice = salePrice !== null && Number.isFinite(salePrice) && salePrice >= 0 && salePrice < normalizedOriginalPrice
      ? salePrice
      : null
    return {
      id: variant.id,
      productId,
      sku: variant.sku.trim() || 'CHƯA-CÓ-SKU',
      name: variant.name.trim() || 'Mặc định',
      originalPrice: normalizedOriginalPrice,
      salePrice: normalizedSalePrice,
      effectivePrice: normalizedSalePrice ?? normalizedOriginalPrice,
      depositAmount: null,
      availableQuantity: 25,
      optionSignature: selectedOptionDetails.map((option) => `${option.groupCode}=${option.valueCode}`).sort().join('|') || null,
      metadata: { preview: true },
      selectedOptions,
      selectedOptionDetails,
    }
  })

  const productMedia = previewMediaRows({
    urls: draft.productImageUrls,
    productId,
    scope: 'product',
    productName,
  })
  const byVariant = Object.fromEntries(sourceVariants.map((variant) => [
    variant.id,
    previewMediaRows({ urls: variant.imageUrls, productId, scope: 'variant', scopeId: variant.id, productName }),
  ]))
  const byOptionValue = Object.fromEntries(transformedGroups.flatMap(({ values }) => values.map(({ source: value }) => [
    value.id,
    previewMediaRows({ urls: value.imageUrls, productId, scope: 'option', scopeId: value.id, productName }),
  ])))
  const pricedVariants = variants.filter((_, index) => Boolean(sourceVariants[index]?.originalPrice.trim()))
  const effectivePrices = pricedVariants.map((variant) => variant.effectivePrice)
  const primaryCategory = accessoryCategoryCollections(collections)
    .find((collection) => collection.slug === draft.primaryCollectionSlug)
  const categoryMemberships = primaryCategory ? [{
    id: `preview-membership-${primaryCategory.slug}`,
    sourceSystem: 'preview',
    isPrimary: true,
    firstSeenAt: '',
    lastSeenAt: '',
    metadata: { preview: true },
    collection: {
      id: `preview-collection-${primaryCategory.slug}`,
      parentId: null,
      kind: 'CATEGORY' as const,
      sourceSystem: 'preview',
      sourceKey: primaryCategory.slug,
      slug: primaryCategory.slug,
      name: primaryCategory.name,
      vehicleFilterMode: 'NONE' as const,
      displayOrder: 10,
      metadata: { preview: true },
      vehicleModel: null,
    },
  }] : []
  const allowedModels = accessoryModelCollectionsForCategory(collections, draft.primaryCollectionSlug)
  const modelMemberships = draft.modelCollectionSlugs.flatMap((slug, index) => {
    const model = allowedModels.find((collection) => collection.slug === slug)
    return model ? [{
      id: `preview-membership-${model.slug}`,
      sourceSystem: 'preview',
      isPrimary: false,
      firstSeenAt: '',
      lastSeenAt: '',
      metadata: { preview: true },
      collection: {
        id: `preview-collection-${model.slug}`,
        parentId: primaryCategory ? `preview-collection-${primaryCategory.slug}` : null,
        kind: 'MODEL' as const,
        sourceSystem: 'preview',
        sourceKey: model.slug,
        slug: model.slug,
        name: model.name,
        vehicleFilterMode: 'COLLECTION_MEMBERSHIP' as const,
        displayOrder: (index + 1) * 10,
        metadata: { preview: true },
        vehicleModel: {
          id: `preview-model-${model.slug}`,
          code: model.slug.toUpperCase(),
          slug: model.slug,
          name: model.name,
          vehicleKind: 'CAR' as const,
          metadata: { preview: true },
        },
      },
    }] : []
  })

  return {
    id: productId,
    categoryId: draft.rootCategoryId || null,
    category: draft.rootCategoryId ? { id: draft.rootCategoryId, name: 'Phụ kiện', slug: ACCESSORY_ROOT_SLUG } : null,
    name: productName,
    slug: draft.slug.trim() || 'phu-kien-xem-truoc',
    description: draft.description.trim() || null,
    productType: 'ACCESSORY',
    displayedPrice: effectivePrices[0] ?? null,
    createdAt: null,
    content: {
      schema: 'accessory_content_v1',
      sections: draft.sections.map((section, index) => ({
        key: section.id,
        type: section.type,
        title: section.type === 'OTHER'
          ? section.title.trim() || 'Thông tin khác'
          : ACCESSORY_SECTION_TYPES.find((definition) => definition.value === section.type)?.defaultTitle || `Nội dung ${index + 1}`,
        displayOrder: (index + 1) * 10,
        body: section.body.trim() || null,
        items: section.itemsText.split('\n').map((item) => item.trim()).filter(Boolean),
        attributes: section.attributes.filter((attribute) => attribute.label.trim() && attribute.value.trim()).map((attribute) => ({ label: attribute.label.trim(), value: attribute.value.trim() })),
      })),
    },
    serviceLabels: serviceLabels.filter((label) => draft.serviceLabelIds.includes(label.id)),
    collectionMemberships: [...categoryMemberships, ...modelMemberships],
    legacyImageUrls: nonEmptyUrls(draft.productImageUrls),
    optionGroups: transformedGroups.map(({ catalog }) => catalog),
    variants,
    media: { product: productMedia, byVariant, byOptionValue },
    priceRange: effectivePrices.length > 0 ? { minimum: Math.min(...effectivePrices), maximum: Math.max(...effectivePrices) } : null,
    availableQuantity: variants.reduce((total, variant) => total + variant.availableQuantity, 0),
  }
}

export function variantIsComplete(variant: DraftVariant, groups: DraftOptionGroup[]) {
  if (variant.isIncluded === false) return true
  const originalPrice = Number(variant.originalPrice)
  const salePrice = variant.salePrice.trim() ? Number(variant.salePrice) : null
  return Boolean(
    variant.name.trim()
    && variant.sku.trim()
    && Number.isFinite(originalPrice)
    && originalPrice >= 0
    && (salePrice === null || (Number.isFinite(salePrice) && salePrice >= 0 && salePrice < originalPrice))
    && variantGroups(groups).every((group) => (
      !draftOptionGroupIsRequired(group)
      || Boolean(variant.selections[group.id])
    )),
  )
}
