import 'server-only'

import { normalizeProductSearchText } from '@/lib/catalog/search'
import { catalogCacheEngine, type CachedProduct } from '../cache/catalog-cache'
import { compareProductsRepository, type CompareProductsData } from './comparison'
import type { ToolResult } from '../contracts'

type ProductMatch = {
  product: CachedProduct
  start: number
  end: number
  aliasLength: number
}

function aliasesForProduct(product: CachedProduct) {
  const fullName = normalizeProductSearchText(product.name)
  const shortName = fullName.replace(/^vinfast\s+/, '')
  const slug = normalizeProductSearchText(product.slug)
  return [...new Set([fullName, shortName, slug].filter((alias) => alias.length >= 3))]
}

export function isComparisonRequest(text: string) {
  const normalized = ` ${normalizeProductSearchText(text)} `
  return text.trimStart().toLowerCase().startsWith('/compare')
    || normalized.includes(' so sanh ')
    || normalized.includes(' khac nhau ')
    || normalized.includes(' versus ')
    || normalized.includes(' vs ')
    || normalized.includes(' nen chon ')
}

/** Finds explicit catalog names in text, preferring the longest overlapping alias. */
export function matchComparisonProducts(text: string, products: CachedProduct[]): CachedProduct[] {
  const normalized = normalizeProductSearchText(text)
  const padded = ` ${normalized} `
  const matches: ProductMatch[] = []

  for (const product of products) {
    let best: ProductMatch | null = null
    for (const alias of aliasesForProduct(product)) {
      const index = padded.indexOf(` ${alias} `)
      if (index < 0) continue
      const candidate = {
        product,
        start: index,
        end: index + alias.length + 2,
        aliasLength: alias.length,
      }
      if (!best || candidate.aliasLength > best.aliasLength) best = candidate
    }
    if (best) matches.push(best)
  }

  const selected: ProductMatch[] = []
  for (const candidate of matches.sort((left, right) => right.aliasLength - left.aliasLength)) {
    const overlaps = selected.some((current) => (
      candidate.start < current.end && candidate.end > current.start
    ))
    if (!overlaps) selected.push(candidate)
  }

  return selected
    .sort((left, right) => left.start - right.start)
    .map((match) => match.product)
}

export type DeterministicComparison = {
  result: ToolResult<CompareProductsData>
  products: CachedProduct[]
}

export async function resolveDeterministicComparison(
  text: string,
  toolCallId: string,
): Promise<DeterministicComparison | null> {
  if (!isComparisonRequest(text)) return null

  const snapshot = await catalogCacheEngine.getSnapshotAsync()
  const products = matchComparisonProducts(
    text,
    snapshot.products.filter((product) => product.productType !== 'ACCESSORY'),
  )
  if (products.length < 2 || products.length > 3) return null

  return {
    products,
    result: await compareProductsRepository({
      productIds: products.map((product) => product.id),
    }, toolCallId),
  }
}
