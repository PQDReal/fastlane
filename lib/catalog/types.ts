export const CATALOG_PLACEHOLDER_IMAGE = '/images/vf8.png'

export type CatalogProductType = 'ACCESSORY' | 'VEHICLE'

export type CatalogOptionDisplayType = 'BUTTON' | 'SWATCH' | 'SELECT'

export type CatalogMediaRole =
  | 'THUMBNAIL'
  | 'HERO'
  | 'GALLERY'
  | 'SWATCH'
  | 'DETAIL'
  | 'EXTERIOR'
  | 'INTERIOR'
  | 'TECH'

export type CatalogMediaType = 'IMAGE' | 'VIDEO'

export type CatalogSelection = Record<string, string>

export type CatalogCategory = {
  id: string
  name: string
  slug: string
}

export type CatalogMedia = {
  id: string
  productId: string
  variantId: string | null
  optionValueId: string | null
  role: CatalogMediaRole
  mediaType: CatalogMediaType
  url: string
  altText: string | null
  displayOrder: number
  metadata: Record<string, unknown>
}

export type CatalogMediaCollection = {
  product: CatalogMedia[]
  byVariant: Record<string, CatalogMedia[]>
  byOptionValue: Record<string, CatalogMedia[]>
}

export type CatalogOptionValue = {
  id: string
  code: string
  name: string
  swatchUrl: string | null
  colorHex: string | null
  priceAdjustment: number
  displayOrder: number
  metadata: Record<string, unknown>
}

export type CatalogOptionGroup = {
  id: string
  code: string
  name: string
  displayType: CatalogOptionDisplayType
  minimumSelections: 0 | 1
  maximumSelections: 1
  displayOrder: number
  metadata: Record<string, unknown>
  values: CatalogOptionValue[]
}

export type CatalogSelectedOption = {
  groupId: string
  groupCode: string
  groupName: string
  valueId: string
  valueCode: string
  valueName: string
  priceAdjustment: number
}

export type CatalogVariant = {
  id: string
  productId: string
  sku: string
  name: string
  originalPrice: number
  salePrice: number | null
  effectivePrice: number
  depositAmount: number | null
  availableQuantity: number
  optionSignature: string | null
  metadata: Record<string, unknown>
  selectedOptions: CatalogSelection
  selectedOptionDetails: CatalogSelectedOption[]
}

export type CatalogPriceRange = {
  minimum: number
  maximum: number
}

export type CatalogProductContent = {
  specificationText: string | null
  specifications: Record<string, unknown>
}

export type CatalogProduct = {
  id: string
  categoryId: string | null
  category: CatalogCategory | null
  name: string
  slug: string
  description: string | null
  productType: CatalogProductType
  displayedPrice: number | null
  content: CatalogProductContent
  legacyImageUrls: string[]
  optionGroups: CatalogOptionGroup[]
  variants: CatalogVariant[]
  media: CatalogMediaCollection
  priceRange: CatalogPriceRange | null
  availableQuantity: number
}

export type CatalogOptionAvailability = Record<string, Record<string, boolean>>

export type CatalogResolvedMediaSource =
  | 'VARIANT'
  | 'OPTION_VALUE'
  | 'PRODUCT'
  | 'LEGACY'
  | 'PLACEHOLDER'

export type CatalogResolvedMedia = {
  url: string
  altText: string | null
  mediaType: CatalogMediaType
  role: CatalogMediaRole
  source: CatalogResolvedMediaSource
}

export type AccessoryCatalogPage = {
  products: CatalogProduct[]
  page: number
  pageSize: number
  total: number
  totalPages: number
}

export type CatalogVariantContext = {
  product: CatalogProduct
  variant: CatalogVariant
}
