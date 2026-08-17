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
  const normalizedSlug = slug.trim()
  if (!normalizedSlug) return PRODUCT_PREFIXES[productType]
  return `${PRODUCT_PREFIXES[productType]}/${encodeURIComponent(normalizedSlug)}`
}

export function isSalesAgentInternalUrl(value: string) {
  return /^\/(?:cars|bikes|accessories)(?:\/[A-Za-z0-9._~%-]+)?$/.test(value)
    || value === '/compare'
}
