import type { SalesAgentSuggestionSelection } from '../contracts/turn'

export type SuggestionCatalogSnapshot = {
  products: Array<{ id: string; productType?: string | null }>
  lastRefreshedAt: number
}

export type SuggestionValidationResult =
  | { valid: true; staleCatalog: boolean }
  | { valid: false; reason: 'UNKNOWN_ENTITY' | 'TOO_MANY_ENTITIES' }

/** Revalidates entity-backed chips against the current active catalog. */
export function validateSuggestionSelection(
  selection: SalesAgentSuggestionSelection,
  snapshot: SuggestionCatalogSnapshot,
): SuggestionValidationResult {
  const entityIds = [...new Set(selection.entityIds ?? [])]
  if (entityIds.length > 4) return { valid: false, reason: 'TOO_MANY_ENTITIES' }

  const activeIds = new Set(snapshot.products.filter((product) => product.productType !== 'ACCESSORY').map((product) => product.id))
  if (entityIds.some((entityId) => !activeIds.has(entityId))) {
    return { valid: false, reason: 'UNKNOWN_ENTITY' }
  }

  return {
    valid: true,
    staleCatalog: selection.catalogVersion != null
      && snapshot.lastRefreshedAt > 0
      && selection.catalogVersion !== snapshot.lastRefreshedAt,
  }
}
