export type SalesAgentNavigableProductType = 'CAR' | 'BIKE' | 'ACCESSORY'

const PRODUCT_PREFIXES: Record<SalesAgentNavigableProductType, string> = {
  CAR: '/cars',
  BIKE: '/bikes',
  ACCESSORY: '/accessories',
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

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

export function isKnowledgeSourceChunkId(value: string) {
  return UUID_PATTERN.test(value.trim())
}

export function salesAgentKnowledgeSourceUrl(chunkId: string) {
  const normalizedChunkId = chunkId.trim()
  return isKnowledgeSourceChunkId(normalizedChunkId)
    ? `/knowledge/source/${normalizedChunkId}`
    : null
}

export function isSalesAgentInternalUrl(value: string) {
  return /^\/(?:cars|bikes|accessories)(?:\/[A-Za-z0-9._~%-]+)?$/.test(value)
    || /^\/user-manual(?:\/[A-Za-z0-9._~%-]+(?:\/[A-Za-z0-9._~%-]+)?)?$/i.test(value)
    || /^\/knowledge\/source\/[0-9a-f-]{36}$/i.test(value)
    || value === '/compare'
    || value === '/after-sales'
    || value === '/deposit'
    || value === '/cost-estimator'
    || value === '/rescue'
    || value === '/promotions'
    || value === '/test-drive'
    || value === '/showrooms'
    || value === '/support'
}
