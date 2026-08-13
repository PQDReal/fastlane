export const SALES_AGENT_COMPARE_CRITERIA = [
  'battery_capacity_kwh',
  'top_speed_kmh',
  'range_km',
  'max_power_kw',
  'price',
  'availability',
] as const

export type SalesAgentCompareCriteria = (typeof SALES_AGENT_COMPARE_CRITERIA)[number]
