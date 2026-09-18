export const PROMOTION_PRODUCT_TYPES = ['CAR', 'BIKE', 'ACCESSORY'] as const

export type PromotionProductType = (typeof PROMOTION_PRODUCT_TYPES)[number]

export function promotionProductTypes(value: unknown): PromotionProductType[] {
  if (!Array.isArray(value)) return []
  return PROMOTION_PRODUCT_TYPES.filter((type) => value.includes(type))
}

export function productTypesFromLegacy(value: unknown): PromotionProductType[] {
  if (value === 'ALL') return [...PROMOTION_PRODUCT_TYPES]
  return PROMOTION_PRODUCT_TYPES.includes(value as PromotionProductType)
    ? [value as PromotionProductType]
    : [...PROMOTION_PRODUCT_TYPES]
}

export function legacyProductType(types: PromotionProductType[]) {
  return types.length === 1 ? types[0] : 'ALL'
}

export function sameProductTypes(
  left: PromotionProductType[],
  right: PromotionProductType[],
) {
  return PROMOTION_PRODUCT_TYPES.every(
    (type) => left.includes(type) === right.includes(type),
  )
}

export function productTypeLabel(type: PromotionProductType) {
  if (type === 'CAR') return 'Ô tô'
  if (type === 'BIKE') return 'Xe máy'
  return 'Phụ kiện'
}
