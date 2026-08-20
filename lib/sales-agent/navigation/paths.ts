export type SalesAgentNavigableProductType = 'CAR' | 'BIKE' | 'ACCESSORY'

const PRODUCT_PREFIXES: Record<SalesAgentNavigableProductType, string> = {
  CAR: '/cars',
  BIKE: '/bikes',
  ACCESSORY: '/accessories',
}

export function salesAgentCatalogUrl(productType: SalesAgentNavigableProductType) {
  return PRODUCT_PREFIXES[productType]
}

export function salesAgentProductUrl(productType: SalesAgentNavigableProductType, slug: string) {
  let normalizedSlug = slug.trim()
  if (!normalizedSlug) return PRODUCT_PREFIXES[productType]
  
  // Prevent 404s by stripping vinfast- prefix if it was hallucinated or improperly passed
  // Only apply to CARs as bikes still use the vinfast- prefix
  if (productType === 'CAR') {
    normalizedSlug = normalizedSlug.replace(/^vinfast-/i, '')
  }
  
  return `${PRODUCT_PREFIXES[productType]}/${encodeURIComponent(normalizedSlug)}`
}

export function isSalesAgentInternalUrl(value: string) {
  return /^\/(?:cars|bikes|accessories)(?:\/[A-Za-z0-9._~%-]+)?$/.test(value)
    || value === '/compare'
}
