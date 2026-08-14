import 'server-only'

import { normalizeProductSearchText } from '@/lib/catalog/search'
import { resolveSalesAgentVehicleReferences } from '../catalog/context'
import { classifySalesAgentProductType } from '../catalog/product-type'
import type { SalesAgentMessage } from '../contracts/message'
import type { SalesAgentToolCall } from '../contracts/tool'
import {
  inferSalesAgentIntent,
  isSalesAgentStaticKnowledgeIntent,
  resolveSalesAgentConversationState,
  salesAgentRequestsNavigation,
} from '../conversation/state'
import type { SalesAgentNavigationIntent } from '../navigation/resolver'

export type SalesAgentToolPlan = {
  calls: SalesAgentToolCall[]
  navigationIntent?: SalesAgentNavigationIntent
}

function requestedCatalogEntityType(message: string): 'CAR' | 'BIKE' | 'ACCESSORY' {
  const normalized = normalizeProductSearchText(message)
  const classified = classifySalesAgentProductType(message).type
  if (classified) return classified
  if (['xe may', 'evo', 'feliz', 'klara', 'vento', 'theon'].some((term) => normalized.includes(term))) return 'BIKE'
  return 'CAR'
}

function hasExplicitCatalogEntityType(message: string) {
  return classifySalesAgentProductType(message).type !== null
}

export async function planSalesAgentTools(message: string, history: SalesAgentMessage[] = []): Promise<SalesAgentToolPlan> {
  // Procedures, policies and guides require citation-backed knowledge. Until
  // the RAG tool is available, do not route keyword overlaps such as “pin” or
  // “phụ kiện” into catalog tools and accidentally present them as evidence.
  if (isSalesAgentStaticKnowledgeIntent(message) && inferSalesAgentIntent(message) !== 'PROMOTIONS') return { calls: [] }

  const explicitIntent = inferSalesAgentIntent(message)
  const conversationState = resolveSalesAgentConversationState(message, history)
  const wantsCompare = conversationState.activeIntent === 'COMPARE_VEHICLES'
  const wantsAccessory = conversationState.activeIntent === 'ACCESSORIES'
  const wantsPromotion = conversationState.activeIntent === 'PROMOTIONS'
  const wantsDetails = conversationState.activeIntent === 'VEHICLE_DETAILS'
  const wantsCatalog = conversationState.activeIntent === 'CATALOG_RECOMMENDATION'
  const wantsNavigation = salesAgentRequestsNavigation(message) || conversationState.activeIntent === 'NAVIGATION'
  const userHistory = history.filter((item) => item.role === 'user')
  const historyVehicleContext = userHistory.slice(-6).map((item) => item.content).join('\n')
  const effectiveWantsCompare = wantsCompare
  if (!effectiveWantsCompare && !wantsAccessory && !wantsPromotion && !wantsDetails && !wantsCatalog && !wantsNavigation) return { calls: [] }

  const directVehicles = await resolveSalesAgentVehicleReferences(message, 3)
  // A typed/current compare request may complete its second slot from history.
  // An entity-only message after compare must not silently resurrect old models;
  // that case is waiting for the structured choice flow from the next task.
  const shouldResolveHistory = (effectiveWantsCompare && explicitIntent === 'COMPARE_VEHICLES' && directVehicles.length < 2)
    || ((wantsAccessory || wantsDetails || wantsNavigation) && directVehicles.length === 0)
  const resolvedVehicles = shouldResolveHistory
    ? await resolveSalesAgentVehicleReferences(`${historyVehicleContext}\n${message}`, 3)
    : directVehicles
  const references = resolvedVehicles.map((vehicle) => vehicle.id)
  let calls: SalesAgentToolCall[] = []

  if (wantsPromotion) {
    calls = [{ name: 'get_current_promotions', arguments: { productType: resolvedVehicles.length === 1 ? resolvedVehicles[0].productType : undefined } }]
  } else if (wantsAccessory) {
    calls = [{ name: 'discover_accessories', arguments: { vehicleProductId: resolvedVehicles.length === 1 ? resolvedVehicles[0].id : undefined, limit: 6 } }]
  } else if (effectiveWantsCompare) {
    const criteria = conversationState.slots.criteria ?? []
    calls = references.length >= 2
      ? [{ name: 'compare_vehicles', arguments: { productIds: references, ...(criteria.length ? { criteria } : {}) } }]
      : []
  } else if (wantsDetails && references.length === 1) {
    calls = [{ name: 'get_vehicle_details', arguments: { productId: references[0] } }]
  } else if (wantsCatalog || wantsDetails || effectiveWantsCompare) {
    const classifiedType = classifySalesAgentProductType(message).type ?? conversationState.slots.productType
    const productNameQuery = resolvedVehicles.length === 1 ? resolvedVehicles[0].name : undefined
    calls = [{
      name: 'search_catalog',
      arguments: {
        ...(productNameQuery ? { query: productNameQuery } : {}),
        ...(classifiedType ? { productTypes: [classifiedType] } : wantsCatalog && !hasExplicitCatalogEntityType(message) ? { productTypes: ['CAR', 'BIKE'] } : {}),
        ...(conversationState.slots.minPrice !== undefined ? { minPrice: conversationState.slots.minPrice } : {}),
        ...(conversationState.slots.maxPrice !== undefined ? { maxPrice: conversationState.slots.maxPrice } : {}),
        limit: 8,
      },
    }]
  }

  if (!wantsNavigation) return { calls }
  const entity = resolvedVehicles[0]
  if (entity) {
    return { calls, navigationIntent: { actionKey: 'VIEW_PRODUCT', entityId: entity.id, entityType: entity.productType } }
  }
  if (effectiveWantsCompare) return { calls, navigationIntent: { actionKey: 'OPEN_COMPARE' } }
  return { calls, navigationIntent: { actionKey: 'BROWSE_CATALOG', entityType: requestedCatalogEntityType(message) } }
}
