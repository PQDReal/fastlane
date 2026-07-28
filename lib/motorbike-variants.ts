export type MotorbikeVariantOption = {
  name: string
  price: number
}

export function extractVndAmounts(value: unknown): number[] {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return [value]
  }

  if (typeof value !== 'string') return []

  return [...value.matchAll(/\d{1,3}(?:\.\d{3})+/g)].map((match) =>
    Number(match[0].replace(/\./g, '')),
  )
}

export function buildMotorbikeVariantOptions(
  variants: unknown,
  productPrice: unknown,
): MotorbikeVariantOption[] {
  const names = Array.isArray(variants)
    ? variants.filter((item): item is string => typeof item === 'string')
    : []
  const productPrices = extractVndAmounts(productPrice)

  return names.map((name, index) => ({
    name,
    price:
      extractVndAmounts(name)[0] ??
      productPrices[index] ??
      productPrices[0] ??
      0,
  }))
}

export function getMotorbikeVariantPrice(
  options: unknown,
  selectedVariantName: string,
): number {
  if (!Array.isArray(options)) return 0

  const selected = options.find(
    (option): option is MotorbikeVariantOption =>
      typeof option === 'object' &&
      option !== null &&
      'name' in option &&
      option.name === selectedVariantName &&
      'price' in option &&
      typeof option.price === 'number',
  )

  return selected?.price ?? 0
}
