import type { CatalogProduct } from './catalog/types'

export const ACCESSORY_CATEGORIES = [
  'Tất cả',
  'Phong cách sống',
  'Sạc ô tô điện',
  'Phụ kiện ô tô điện',
  'Phụ kiện ô tô xăng',
  'Phụ kiện xe máy điện',
] as const

export type AccessoryCategory = (typeof ACCESSORY_CATEGORIES)[number]

export type BikePriceBand =
  | 'all'
  | 'under-15'
  | '15-25'
  | '25-40'
  | 'over-40'

export function normalizeCatalogText(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export function matchesCatalogSearch(
  query: string,
  ...values: unknown[]
): boolean {
  const normalizedQuery = normalizeCatalogText(query)
  if (!normalizedQuery) return true

  const haystack = normalizeCatalogText(values.filter(Boolean).join(' '))
  return normalizedQuery
    .split(' ')
    .every((token) => haystack.includes(token))
}

export function matchesBikePriceBand(
  price: number,
  band: BikePriceBand,
): boolean {
  switch (band) {
    case 'under-15':
      return price < 15_000_000
    case '15-25':
      return price >= 15_000_000 && price < 25_000_000
    case '25-40':
      return price >= 25_000_000 && price < 40_000_000
    case 'over-40':
      return price >= 40_000_000
    default:
      return true
  }
}

export function classifyAccessory(
  product: CatalogProduct,
): Exclude<AccessoryCategory, 'Tất cả'> {
  const categoryMemberships = product.collectionMemberships.filter(
    ({ collection }) => collection.kind === 'CATEGORY',
  )
  const sourceCategory = (
    categoryMemberships.find(({ isPrimary }) => isPrimary)
    ?? categoryMemberships[0]
  )?.collection.name
  if (
    sourceCategory &&
    ACCESSORY_CATEGORIES.includes(
      sourceCategory as AccessoryCategory,
    ) &&
    sourceCategory !== 'Tất cả'
  ) {
    return sourceCategory as Exclude<AccessoryCategory, 'Tất cả'>
  }

  const text = normalizeCatalogText(product.name)

  if (
    /\b(sac|cap sac|bo sac|wallbox|charger|adapter)\b/.test(text)
  ) {
    return 'Sạc ô tô điện'
  }

  if (
    /\b(ao mua|mu bao hiem)\b/.test(
      text,
    )
  ) {
    return 'Phụ kiện xe máy điện'
  }

  if (
    /\b(ao|mu|that lung|khan lua|binh giu nhiet|coc giu nhiet|o gap|o golf|bao da|mo hinh)\b/.test(
      text,
    )
  ) {
    return 'Phong cách sống'
  }

  return 'Phụ kiện ô tô điện'
}

export function getAccessoryMinimumPrice(product: CatalogProduct): number {
  return (
    product.priceRange?.minimum ??
    product.displayedPrice ??
    Number.POSITIVE_INFINITY
  )
}

export function getAccessoryPopularity(product: CatalogProduct): number {
  return product.availableQuantity
}
