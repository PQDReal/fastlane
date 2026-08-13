import 'server-only'

import { normalizeProductSearchText } from '@/lib/catalog/search'
import { resolveSalesAgentVehicleReferences } from '../catalog/context'
import type { SalesAgentToolCall } from '../contracts/tool'
import { requestsNavigation, type SalesAgentNavigationIntent } from '../navigation/resolver'

export type SalesAgentToolPlan = {
  calls: SalesAgentToolCall[]
  navigationIntent?: SalesAgentNavigationIntent
}

function compareIntent(message: string) {
  const normalized = normalizeProductSearchText(message)
  return ['so sanh', 'khac nhau', 'doi chieu'].some((phrase) => normalized.includes(phrase))
}

function accessoryIntent(message: string) {
  return normalizeProductSearchText(message).includes('phu kien')
}

function promotionIntent(message: string) {
  const normalized = normalizeProductSearchText(message)
  return ['khuyen mai', 'uu dai', 'giam gia', 'promotion', 'ma giam'].some((phrase) => normalized.includes(phrase))
}

function staticKnowledgeIntent(message: string) {
  const normalized = normalizeProductSearchText(message)
  return ['thu tuc', 'huong dan', 'chinh sach', 'quy trinh', 'bao hanh', 'bao duong', 'giay to', 'tin tuc']
    .some((phrase) => normalized.includes(phrase))
}

function vehicleDetailsIntent(message: string) {
  const normalized = normalizeProductSearchText(message)
  return ['thong so', 'pin', 'dong co', 'toc do', 'quang duong', 'pham vi', 'cong suat', 'sac', 'gia', 'ton kho']
    .some((phrase) => normalized.includes(phrase))
}

function genericCatalogIntent(message: string) {
  const normalized = normalizeProductSearchText(message)
  return ['tu van', 'goi y', 'tim', 'mau xe', 'ngan sach'].some((phrase) => normalized.includes(phrase))
}

function requestedCatalogEntityType(message: string): 'CAR' | 'BIKE' | 'ACCESSORY' {
  const normalized = normalizeProductSearchText(message)
  if (normalized.includes('phu kien')) return 'ACCESSORY'
  if (['xe may', 'evo', 'feliz', 'klara', 'vento', 'theon'].some((term) => normalized.includes(term))) return 'BIKE'
  return 'CAR'
}

export async function planSalesAgentTools(message: string): Promise<SalesAgentToolPlan> {
  // Procedures, policies and guides require citation-backed knowledge. Until
  // the RAG tool is available, do not route keyword overlaps such as “pin” or
  // “phụ kiện” into catalog tools and accidentally present them as evidence.
  if (staticKnowledgeIntent(message) && !promotionIntent(message)) return { calls: [] }

  const wantsCompare = compareIntent(message)
  const wantsAccessory = accessoryIntent(message)
  const wantsPromotion = promotionIntent(message)
  const wantsDetails = vehicleDetailsIntent(message)
  const wantsCatalog = genericCatalogIntent(message)
  const wantsNavigation = requestsNavigation(message)
  if (!wantsCompare && !wantsAccessory && !wantsPromotion && !wantsDetails && !wantsCatalog && !wantsNavigation) return { calls: [] }

  const vehicles = await resolveSalesAgentVehicleReferences(message, 3)
  const references = vehicles.map((vehicle) => vehicle.id)
  let calls: SalesAgentToolCall[] = []

  if (wantsPromotion) {
    calls = [{ name: 'get_current_promotions', arguments: { productType: vehicles.length === 1 ? vehicles[0].productType : undefined } }]
  } else if (wantsAccessory) {
    calls = [{ name: 'discover_accessories', arguments: { query: message, vehicleProductId: vehicles.length === 1 ? vehicles[0].id : undefined, limit: 6 } }]
  } else if (wantsCompare) {
    calls = references.length >= 2
      ? [{ name: 'compare_vehicles', arguments: { productIds: references } }]
      : []
  } else if (wantsDetails && references.length === 1) {
    calls = [{ name: 'get_vehicle_details', arguments: { productId: references[0] } }]
  } else if (wantsCatalog || wantsDetails || wantsCompare) {
    calls = [{ name: 'search_catalog', arguments: { query: message, limit: 8 } }]
  }

  if (!wantsNavigation) return { calls }
  const entity = vehicles[0]
  if (entity) {
    return { calls, navigationIntent: { actionKey: 'VIEW_PRODUCT', entityId: entity.id, entityType: entity.productType } }
  }
  if (wantsCompare) return { calls, navigationIntent: { actionKey: 'OPEN_COMPARE' } }
  return { calls, navigationIntent: { actionKey: 'BROWSE_CATALOG', entityType: requestedCatalogEntityType(message) } }
}
