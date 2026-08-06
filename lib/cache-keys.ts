import { createHash } from 'node:crypto'

import { normalizeProductSearchText } from '@/lib/catalog/search'

export const PRODUCT_SEARCH_CACHE_PREFIX = 'fastlane:product-search:v2:'
export const CUSTOMER_CART_CACHE_PREFIX = 'fastlane:customer-cart:v1:'
export const DEPOSIT_DRAFT_CACHE_PREFIX = 'fastlane:deposit-draft:v1:'
export const MOTORBIKE_CATALOG_CACHE_KEY = 'fastlane:motorbike-catalog:v1'
export const MOTORBIKE_DETAIL_CACHE_PREFIX = 'fastlane:motorbike-detail:v1:'
export const ACCESSORY_CATALOG_SUMMARY_CACHE_KEY =
  'fastlane:accessory-catalog-summary:v1'
export const ACCESSORY_PRODUCT_CACHE_PREFIX = 'fastlane:accessory-product:v1:'
export const CAR_CATALOG_CACHE_PREFIX = 'fastlane:car-catalog:v1:'
export const CAR_DETAIL_CACHE_PREFIX = 'fastlane:car-detail:v1:'

export function normalizeSearchQuery(query: string | null | undefined) {
  return normalizeProductSearchText(query)
}

export function productSearchCacheKey(query: string | null | undefined) {
  const normalized = normalizeSearchQuery(query)
  const digest = createHash('sha256').update(normalized).digest('hex')
  return `${PRODUCT_SEARCH_CACHE_PREFIX}${digest}`
}

export function customerCartCacheKey(customerId: string) {
  return `${CUSTOMER_CART_CACHE_PREFIX}${customerId}`
}

export function depositDraftCacheKey(auth0Subject: string) {
  const ownerDigest = createHash('sha256').update(auth0Subject).digest('hex')
  return `${DEPOSIT_DRAFT_CACHE_PREFIX}${ownerDigest}`
}

export function accessoryProductCacheKey(slug: string) {
  return `${ACCESSORY_PRODUCT_CACHE_PREFIX}${slug.trim().toLocaleLowerCase('vi')}`
}

export function carCatalogCacheKey(page: number, pageSize: number) {
  return `${CAR_CATALOG_CACHE_PREFIX}${page}:${pageSize}`
}

export function carDetailCacheKey(slug: string) {
  return `${CAR_DETAIL_CACHE_PREFIX}${slug.trim().toLocaleLowerCase('vi')}`
}

export function motorbikeDetailCacheKey(slug: string) {
  return `${MOTORBIKE_DETAIL_CACHE_PREFIX}${slug.trim().toLocaleLowerCase('vi')}`
}
