export type SalesAgentBudgetProductType = 'CAR' | 'BIKE' | 'ACCESSORY'

type SalesAgentBudgetDefinition = {
  value: string
  label: string
  productType: SalesAgentBudgetProductType
  minPrice?: number
  maxPrice?: number
}

const BUDGET_DEFINITIONS: SalesAgentBudgetDefinition[] = [
  { value: 'under_700m', label: 'Dưới 700 triệu', productType: 'CAR', maxPrice: 700_000_000 },
  { value: '700m_900m', label: '700–900 triệu', productType: 'CAR', minPrice: 700_000_000, maxPrice: 900_000_000 },
  { value: '900m_1_2b', label: '900 triệu–1,2 tỷ', productType: 'CAR', minPrice: 900_000_000, maxPrice: 1_200_000_000 },
  { value: 'over_1_2b', label: 'Trên 1,2 tỷ', productType: 'CAR', minPrice: 1_200_000_000 },
  { value: 'under_20m', label: 'Dưới 20 triệu', productType: 'BIKE', maxPrice: 20_000_000 },
  { value: '20m_35m', label: '20–35 triệu', productType: 'BIKE', minPrice: 20_000_000, maxPrice: 35_000_000 },
  { value: '35m_50m', label: '35–50 triệu', productType: 'BIKE', minPrice: 35_000_000, maxPrice: 50_000_000 },
  { value: 'over_50m', label: 'Trên 50 triệu', productType: 'BIKE', minPrice: 50_000_000 },
  { value: 'under_1m', label: 'Dưới 1 triệu', productType: 'ACCESSORY', maxPrice: 1_000_000 },
  { value: '1m_5m', label: '1–5 triệu', productType: 'ACCESSORY', minPrice: 1_000_000, maxPrice: 5_000_000 },
  { value: '5m_20m', label: '5–20 triệu', productType: 'ACCESSORY', minPrice: 5_000_000, maxPrice: 20_000_000 },
  { value: 'over_20m', label: 'Trên 20 triệu', productType: 'ACCESSORY', minPrice: 20_000_000 },
]

export function salesAgentBudgetOptions(productType: SalesAgentBudgetProductType = 'CAR') {
  return BUDGET_DEFINITIONS
    .filter((definition) => definition.productType === productType)
    .map(({ value, label }) => ({ value, label }))
}

export function salesAgentBudgetConstraint(value: string) {
  const definition = BUDGET_DEFINITIONS.find((item) => item.value === value)
  if (!definition) return null
  return {
    productType: definition.productType,
    ...(definition.minPrice !== undefined ? { minPrice: definition.minPrice } : {}),
    ...(definition.maxPrice !== undefined ? { maxPrice: definition.maxPrice } : {}),
  }
}
