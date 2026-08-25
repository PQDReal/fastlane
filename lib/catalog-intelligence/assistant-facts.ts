import { getSupabaseAdmin } from '@/lib/supabase-admin'

export const CATALOG_FACT_READ_MODES = ['legacy', 'shadow', 'canonical'] as const

export type CatalogFactReadMode = typeof CATALOG_FACT_READ_MODES[number]

export type CanonicalAssistantFact = {
  productId: string
  canonicalKey: string
  displayValue: string
  numericValue: number | null
  canonicalUnit: string | null
  contextKey: string
}

export type CanonicalAssistantFactReadResult = {
  status: 'available' | 'unavailable'
  facts: CanonicalAssistantFact[]
  errorCode: string | null
}

type CanonicalFactRow = {
  product_id?: unknown
  display_value?: unknown
  numeric_value?: unknown
  canonical_unit?: unknown
  context_key?: unknown
  catalog_spec_definitions?: unknown
}

export type CanonicalAssistantFactRowFetcher = (
  productIds: readonly string[],
  canonicalKeys: readonly string[],
) => Promise<{ data: unknown; error: null | { code?: string } }>

function relationRecord(value: unknown): Record<string, unknown> | null {
  if (Array.isArray(value)) return relationRecord(value[0])
  return value && typeof value === 'object' ? value as Record<string, unknown> : null
}

function numericValue(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

export function mapCanonicalAssistantFactRows(value: unknown): CanonicalAssistantFact[] {
  if (!Array.isArray(value)) return []
  const facts: CanonicalAssistantFact[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    const row = item as CanonicalFactRow
    const definition = relationRecord(row.catalog_spec_definitions)
    const productId = typeof row.product_id === 'string' ? row.product_id : ''
    const canonicalKey = typeof definition?.canonical_key === 'string' ? definition.canonical_key : ''
    const displayValue = typeof row.display_value === 'string' ? row.display_value.trim() : ''
    if (!productId || !canonicalKey || !displayValue) continue
    facts.push({
      productId,
      canonicalKey,
      displayValue,
      numericValue: numericValue(row.numeric_value),
      canonicalUnit: typeof row.canonical_unit === 'string' && row.canonical_unit.trim()
        ? row.canonical_unit.trim()
        : null,
      contextKey: typeof row.context_key === 'string' && row.context_key.trim()
        ? row.context_key.trim()
        : 'default',
    })
  }
  return facts.sort((left, right) => (
    left.productId.localeCompare(right.productId)
    || left.canonicalKey.localeCompare(right.canonicalKey)
    || left.contextKey.localeCompare(right.contextKey)
  ))
}

async function fetchCanonicalAssistantFactRows(
  productIds: readonly string[],
  canonicalKeys: readonly string[],
) {
  return getSupabaseAdmin()
    .from('product_spec_facts')
    .select('product_id,display_value,numeric_value,canonical_unit,context_key,catalog_spec_definitions!inner(canonical_key,searchable)')
    .in('product_id', [...productIds])
    .is('product_variant_id', null)
    .in('catalog_spec_definitions.canonical_key', [...canonicalKeys])
    .eq('catalog_spec_definitions.searchable', true)
    .order('product_id', { ascending: true })
    .order('context_key', { ascending: true })
}

export function resolveCatalogFactReadMode(value = process.env.CATALOG_FACT_READ_MODE): CatalogFactReadMode {
  const normalized = value?.trim().toLowerCase()
  return (CATALOG_FACT_READ_MODES as readonly string[]).includes(normalized ?? '')
    ? normalized as CatalogFactReadMode
    : 'legacy'
}

export async function loadCanonicalAssistantFacts(
  productIds: readonly string[],
  canonicalKeys: readonly string[],
  fetchRows: CanonicalAssistantFactRowFetcher = fetchCanonicalAssistantFactRows,
): Promise<CanonicalAssistantFactReadResult> {
  const uniqueProductIds = [...new Set(productIds.filter(Boolean))].sort()
  const uniqueCanonicalKeys = [...new Set(canonicalKeys.filter(Boolean))].sort()
  if (uniqueProductIds.length === 0 || uniqueCanonicalKeys.length === 0) {
    return { status: 'available', facts: [], errorCode: null }
  }

  try {
    const { data, error } = await fetchRows(uniqueProductIds, uniqueCanonicalKeys)
    if (error) {
      return {
        status: 'unavailable',
        facts: [],
        errorCode: typeof error.code === 'string' && error.code ? error.code : 'CATALOG_FACT_QUERY_FAILED',
      }
    }
    return { status: 'available', facts: mapCanonicalAssistantFactRows(data), errorCode: null }
  } catch {
    return { status: 'unavailable', facts: [], errorCode: 'CATALOG_FACT_QUERY_EXCEPTION' }
  }
}
