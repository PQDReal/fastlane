import {
  CATALOG_PLACEHOLDER_IMAGE,
  type CatalogMedia,
  type CatalogOptionAvailability,
  type CatalogOptionGroup,
  type CatalogProduct,
  type CatalogResolvedMedia,
  type CatalogResolvedMediaSource,
  type CatalogSelection,
  type CatalogVariant,
} from '@/lib/catalog/types'

function matchesSelection(variant: CatalogVariant, selection: CatalogSelection): boolean {
  return Object.entries(selection).every(
    ([groupCode, valueCode]) => variant.selectedOptions[groupCode] === valueCode,
  )
}

/** Returns active catalog variants whose normalized mappings contain a partial selection. */
export function filterCompatibleVariants(
  variants: CatalogVariant[],
  selection: CatalogSelection,
): CatalogVariant[] {
  return variants.filter((variant) => matchesSelection(variant, selection))
}

/**
 * Computes availability by trying each value while retaining selections in all
 * other groups. Stock does not affect combination availability.
 */
export function getOptionAvailability(
  product: CatalogProduct,
  selection: CatalogSelection,
): CatalogOptionAvailability {
  return Object.fromEntries(product.optionGroups.map((group) => [
    group.code,
    Object.fromEntries(group.values.map((value) => [
      value.code,
      filterCompatibleVariants(product.variants, {
        ...selection,
        [group.code]: value.code,
      }).length > 0,
    ])),
  ]))
}

function validSelection(
  group: CatalogOptionGroup,
  valueCode: string | undefined,
): valueCode is string {
  return typeof valueCode === 'string'
    && group.values.some((value) => value.code === valueCode)
}

/**
 * Drops stale/dependent values after a selection changes. The changed group is
 * considered first so a newly chosen value is never discarded in favour of an
 * older dependent selection.
 */
export function reconcileSelection(
  product: CatalogProduct,
  selection: CatalogSelection,
  changedGroupCode?: string,
): CatalogSelection {
  const changedGroup = changedGroupCode
    ? product.optionGroups.find((group) => group.code === changedGroupCode)
    : undefined
  const orderedGroups = changedGroup
    ? [changedGroup, ...product.optionGroups.filter((group) => group !== changedGroup)]
    : product.optionGroups
  const reconciled: CatalogSelection = {}

  for (const group of orderedGroups) {
    const valueCode = selection[group.code]
    if (!validSelection(group, valueCode)) continue
    const candidate = { ...reconciled, [group.code]: valueCode }
    if (filterCompatibleVariants(product.variants, candidate).length > 0) {
      reconciled[group.code] = valueCode
    }
  }
  return reconciled
}

/** Applies a UI option change, including deselecting an optional value. */
export function changeOptionSelection(
  product: CatalogProduct,
  selection: CatalogSelection,
  groupCode: string,
  valueCode: string,
): CatalogSelection {
  const group = product.optionGroups.find((item) => item.code === groupCode)
  const candidate = { ...selection }
  const clearsOptionalValue = group?.minimumSelections === 0
    && (valueCode === '' || selection[groupCode] === valueCode)

  if (clearsOptionalValue) delete candidate[groupCode]
  else candidate[groupCode] = valueCode

  return reconcileSelection(product, candidate, groupCode)
}

/** Resolves only when every required group is selected and one variant matches. */
export function resolveExactVariant(
  product: CatalogProduct,
  selection: CatalogSelection,
): CatalogVariant | null {
  const hasEveryRequiredSelection = product.optionGroups
    .filter((group) => group.minimumSelections > 0)
    .every((group) => validSelection(group, selection[group.code]))
  if (!hasEveryRequiredSelection) return null

  const matches = filterCompatibleVariants(product.variants, selection).filter(
    (variant) => product.optionGroups.every((group) => (
      validSelection(group, selection[group.code])
      || (
        group.minimumSelections === 0
        && variant.selectedOptions[group.code] === undefined
      )
    )),
  )
  return matches.length === 1 ? matches[0] : null
}

function primarySelectedOptionValueId(
  product: CatalogProduct,
  selection: CatalogSelection,
): string | null {
  const selectedGroups = product.optionGroups.filter((group) => (
    validSelection(group, selection[group.code])
  ))
  const primaryGroup = selectedGroups.find((group) => (
    group.metadata.drivesMedia === true
  )) ?? selectedGroups.find((group) => (
    group.metadata.primary === true
  )) ?? selectedGroups.find((group) => (
    group.code === 'color'
    || group.code.endsWith('_color')
    || group.code.startsWith('color_')
  )) ?? selectedGroups.find((group) => group.displayType === 'SWATCH')
    ?? selectedGroups[0]
  const valueCode = primaryGroup && selection[primaryGroup.code]
  return primaryGroup?.values.find((value) => value.code === valueCode)?.id ?? null
}

function resolvedRows(
  media: CatalogMedia[],
  source: CatalogResolvedMediaSource,
): CatalogResolvedMedia[] {
  return media.map((item) => ({
    url: item.url,
    altText: item.altText,
    mediaType: item.mediaType,
    role: item.role,
    source,
  }))
}

function accessoryPlaceholder(
  product: CatalogProduct,
  variantId: string | null | undefined,
  placeholderUrl?: string,
): CatalogResolvedMedia[] {
  return [{
    url: placeholderUrl ?? CATALOG_PLACEHOLDER_IMAGE,
    altText: product.name,
    mediaType: 'IMAGE',
    role: 'THUMBNAIL',
    source: 'PLACEHOLDER',
  }]
}

function accessoryFallbackMedia(
  product: CatalogProduct,
  placeholderUrl?: string,
): CatalogResolvedMedia[] {
  if (product.media.product.length > 0) {
    return resolvedRows(product.media.product, 'PRODUCT')
  }

  if (product.legacyImageUrls.length > 0) {
    return product.legacyImageUrls.map((url) => ({
      url,
      altText: product.name,
      mediaType: 'IMAGE' as const,
      role: 'GALLERY' as const,
      source: 'LEGACY' as const,
    }))
  }

  return accessoryPlaceholder(product, null, placeholderUrl)
}

/**
 * Resolves one complete media scope in canonical fallback order: variant,
 * primary/color option value, product, legacy cache, then placeholder.
 */
export function resolveCatalogMedia(
  product: CatalogProduct,
  options: {
    variantId?: string | null
    selectedOptions?: CatalogSelection
    placeholderUrl?: string
  } = {},
): CatalogResolvedMedia[] {
  const variantMedia = options.variantId
    ? product.media.byVariant[options.variantId] ?? []
    : []
  if (variantMedia.length > 0) return resolvedRows(variantMedia, 'VARIANT')

  // Accessories use a strict SKU-only invariant. Product, option-value and
  // legacy image scopes are transitional fallbacks for old accessory rows that
  // have not yet been backfilled into product_media.
  if (product.productType === 'ACCESSORY') {
    return accessoryFallbackMedia(product, options.placeholderUrl)
  }

  const variantSelection = options.variantId
    ? product.variants.find((variant) => variant.id === options.variantId)?.selectedOptions
    : undefined
  const optionValueId = primarySelectedOptionValueId(
    product,
    options.selectedOptions ?? variantSelection ?? {},
  )
  const optionMedia = optionValueId
    ? product.media.byOptionValue[optionValueId] ?? []
    : []
  if (optionMedia.length > 0) return resolvedRows(optionMedia, 'OPTION_VALUE')

  if (product.media.product.length > 0) {
    return resolvedRows(product.media.product, 'PRODUCT')
  }

  if (product.legacyImageUrls.length > 0) {
    return product.legacyImageUrls.map((url) => ({
      url,
      altText: product.name,
      mediaType: 'IMAGE',
      role: 'GALLERY',
      source: 'LEGACY',
    }))
  }

  return [{
    url: options.placeholderUrl ?? CATALOG_PLACEHOLDER_IMAGE,
    altText: product.name,
    mediaType: 'IMAGE',
    role: 'THUMBNAIL',
    source: 'PLACEHOLDER',
  }]
}

export function resolveCatalogImageUrl(
  product: CatalogProduct,
  options: Parameters<typeof resolveCatalogMedia>[1] = {},
): string {
  const variantMedia = options.variantId
    ? product.media.byVariant[options.variantId] ?? []
    : []
  if (product.productType === 'ACCESSORY') {
    const directImage = variantMedia.find((item) => item.mediaType === 'IMAGE')?.url
    if (directImage) return directImage
    const fallback = accessoryFallbackMedia(product, options.placeholderUrl)
    return fallback[0].url
  }
  const variantSelection = options.variantId
    ? product.variants.find((variant) => variant.id === options.variantId)?.selectedOptions
    : undefined
  const selection = options.selectedOptions ?? variantSelection ?? {}
  const optionValueId = primarySelectedOptionValueId(product, selection)
  const optionMedia = optionValueId
    ? product.media.byOptionValue[optionValueId] ?? []
    : []

  for (const scope of [variantMedia, optionMedia, product.media.product]) {
    const image = scope.find((item) => item.mediaType === 'IMAGE')
    if (image) return image.url
  }

  return product.legacyImageUrls[0]
    ?? options.placeholderUrl
    ?? CATALOG_PLACEHOLDER_IMAGE
}
