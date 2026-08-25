import type { KnownEntityRecord } from '../orchestrator/ledgers/known-entities'
import { salesAgentProductUrl } from './paths'

export type VerifiedMarkdownProduct = Pick<
  KnownEntityRecord,
  'kind' | 'name' | 'slug' | 'productType'
>

const VERIFIED_STATIC_ROUTES = new Set([
  '/',
  '/accessories',
  '/after-sales',
  '/bikes',
  '/cars',
  '/compare',
  '/cost-estimator',
  '/deposit',
  '/promotions',
  '/rescue',
  '/showrooms',
  '/support',
  '/test-drive',
])

const MARKDOWN_LINK_PATTERN = /(?<!!)\[([^\]\n]+)\]\(\s*(?:<([^>\n]+)>|([^\s)\n]+))(?:\s+["'][^\n)]*["'])?\s*\)/g

function normalizeLabel(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[*_`~]/g, '')
    .replace(/\bvinfast\b/gi, '')
    .replace(/[^a-z0-9]+/gi, ' ')
    .trim()
    .toLowerCase()
}

function verifiedStaticHref(href: string) {
  if (!href.startsWith('/') || href.startsWith('//')) return null
  try {
    const parsed = new URL(href, 'https://fastlane.invalid')
    if (parsed.origin !== 'https://fastlane.invalid') return null
    return VERIFIED_STATIC_ROUTES.has(parsed.pathname) ? href : null
  } catch {
    return null
  }
}

/**
 * Keeps only routes known by the application or materialized from a catalog
 * entity in this turn. Guessed product links are rewritten to the canonical
 * catalog URL when their label identifies a known entity, otherwise they are
 * reduced to plain text.
 */
export function sanitizeSalesAgentMarkdownLinks(markdown: string, knownProducts: VerifiedMarkdownProduct[]) {
  const canonicalProducts = knownProducts.flatMap((entity) => {
    if (entity.kind !== 'PRODUCT' || !entity.slug || !entity.productType) return []
    if (!['CAR', 'BIKE', 'ACCESSORY'].includes(entity.productType)) return []
    return [{
      label: normalizeLabel(entity.name),
      productType: entity.productType,
      href: salesAgentProductUrl(entity.productType as 'CAR' | 'BIKE' | 'ACCESSORY', entity.slug),
    }]
  }).sort((a, b) => b.label.length - a.label.length) // Match longer/more specific names first
  const canonicalHrefs = new Set(canonicalProducts.map((product) => product.href))

  return markdown.replace(MARKDOWN_LINK_PATTERN, (_match, rawLabel: string, angleHref?: string, plainHref?: string) => {
    const label = rawLabel.trim()
    const href = (angleHref || plainHref || '').trim()

    if (href.startsWith('#')) return `[${label}](${href})`
    if (canonicalHrefs.has(href)) return `[${label}](${href})`

    const normalizedLinkLabel = normalizeLabel(label)

    // 1. Try exact label match first
    const exactMatch = canonicalProducts.find((product) => product.label === normalizedLinkLabel)
    if (exactMatch) return `[${label}](${exactMatch.href})`

    // 2. If href is already a valid canonical product link (e.g. /accessories/... or /cars/...)
    if (canonicalHrefs.has(href)) return `[${label}](${href})`

    // 3. Substring match only with word boundary and matching product type if href has prefix
    const matchingProduct = canonicalProducts.find((product) => {
      if (product.label.length < 3) return false
      if (href.startsWith('/accessories') && product.productType !== 'ACCESSORY') return false
      if (href.startsWith('/cars') && product.productType !== 'CAR') return false
      if (href.startsWith('/bikes') && product.productType !== 'BIKE') return false
      const regex = new RegExp(`(^|\\s)${product.label.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}(\\s|$)`, 'i')
      return regex.test(normalizedLinkLabel)
    })
    if (matchingProduct) return `[${label}](${matchingProduct.href})`

    const staticHref = verifiedStaticHref(href)
    return staticHref ? `[${label}](${staticHref})` : label
  })
}
