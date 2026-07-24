type ProductMedia = {
  image_urls: unknown
  specifications: unknown
}

function firstImage(value: unknown) {
  if (!Array.isArray(value)) return null
  const image = value.find(
    (entry) => typeof entry === 'string' && entry.trim().length > 0,
  )
  return typeof image === 'string' ? image : null
}

function objectRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

export function variantImageForSku(product: ProductMedia, sku: string) {
  const specifications = objectRecord(product.specifications)
  const sourceVariants = specifications && Array.isArray(specifications.variants)
    ? specifications.variants
    : []
  const normalizedSku = sku.toUpperCase()
  const sourceVariant = sourceVariants
    .map(objectRecord)
    .find((variant) => {
      if (!variant) return false
      const sourceSku = variant.sku ?? variant.variant_id
      return String(sourceSku || '').toUpperCase() === normalizedSku
    })
  const primaryImage = sourceVariant?.image

  if (typeof primaryImage === 'string' && primaryImage.trim().length > 0) {
    return primaryImage
  }

  return firstImage(sourceVariant?.images) || firstImage(product.image_urls)
}
