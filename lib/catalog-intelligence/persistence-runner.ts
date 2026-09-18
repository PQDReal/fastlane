import type { CatalogPersistencePayload } from './persistence'

export type CatalogPersistenceRpcResult = {
  status: 'applied' | 'already_applied'
  productId: string
  snapshotId: string
  observations: number
  candidates: number
  factsCreated: number
  factsUpdated: number
  factsKept: number
  conflicts: number
  events: number
}

export type CatalogPersistenceApplyReport = {
  mode: 'APPLY'
  plannedProducts: number
  processedProducts: number
  appliedSnapshots: number
  alreadyAppliedSnapshots: number
  skippedProducts: Array<{ productId: string; productName: string; warningCodes: string[] }>
  observations: number
  candidates: number
  factsCreated: number
  factsUpdated: number
  factsKept: number
  conflicts: number
  events: number
  writes: number
  results: CatalogPersistenceRpcResult[]
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function stringField(value: Record<string, unknown>, key: string) {
  const field = value[key]
  if (typeof field !== 'string' || !field.trim()) throw new Error(`Persistence RPC returned invalid ${key}.`)
  return field
}

function countField(value: Record<string, unknown>, key: string) {
  const field = value[key]
  if (typeof field !== 'number' || !Number.isInteger(field) || field < 0) {
    throw new Error(`Persistence RPC returned invalid ${key}.`)
  }
  return field
}

export function parseCatalogPersistenceRpcResult(value: unknown): CatalogPersistenceRpcResult {
  const result = record(value)
  if (!result || (result.status !== 'applied' && result.status !== 'already_applied')) {
    throw new Error('Persistence RPC returned an invalid status payload.')
  }
  return {
    status: result.status,
    productId: stringField(result, 'productId'),
    snapshotId: stringField(result, 'snapshotId'),
    observations: countField(result, 'observations'),
    candidates: countField(result, 'candidates'),
    factsCreated: countField(result, 'factsCreated'),
    factsUpdated: countField(result, 'factsUpdated'),
    factsKept: countField(result, 'factsKept'),
    conflicts: countField(result, 'conflicts'),
    events: countField(result, 'events'),
  }
}

export async function applyCatalogPersistencePayloads(
  payloads: readonly CatalogPersistencePayload[],
  persist: (payload: CatalogPersistencePayload) => Promise<CatalogPersistenceRpcResult>,
  onProgress?: (result: CatalogPersistenceRpcResult, payload: CatalogPersistencePayload) => void,
): Promise<CatalogPersistenceApplyReport> {
  const eligible = payloads
    .filter((payload) => payload.warningCodes.length === 0)
    .sort((left, right) => left.productId.localeCompare(right.productId))
  const skippedProducts = payloads
    .filter((payload) => payload.warningCodes.length > 0)
    .map((payload) => ({
      productId: payload.productId,
      productName: payload.productName,
      warningCodes: [...payload.warningCodes],
    }))
    .sort((left, right) => left.productId.localeCompare(right.productId))
  const results: CatalogPersistenceRpcResult[] = []

  for (const payload of eligible) {
    let result: CatalogPersistenceRpcResult
    try {
      result = await persist(payload)
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      throw new Error(`Persist catalog snapshot failed for ${payload.productName} (${payload.productId}): ${detail}`, { cause: error })
    }
    if (result.productId !== payload.productId) {
      throw new Error(`Persistence RPC returned product ${result.productId} for payload ${payload.productId}.`)
    }
    results.push(result)
    onProgress?.(result, payload)
  }

  const sum = (key: keyof Pick<CatalogPersistenceRpcResult,
    'observations' | 'candidates' | 'factsCreated' | 'factsUpdated' | 'factsKept' | 'conflicts' | 'events'>) => (
    results.reduce((total, result) => total + result[key], 0)
  )
  const observations = sum('observations')
  const candidates = sum('candidates')
  const factsCreated = sum('factsCreated')
  const factsUpdated = sum('factsUpdated')
  const factsKept = sum('factsKept')
  const events = sum('events')

  return {
    mode: 'APPLY',
    plannedProducts: payloads.length,
    processedProducts: results.length,
    appliedSnapshots: results.filter((result) => result.status === 'applied').length,
    alreadyAppliedSnapshots: results.filter((result) => result.status === 'already_applied').length,
    skippedProducts,
    observations,
    candidates,
    factsCreated,
    factsUpdated,
    factsKept,
    conflicts: sum('conflicts'),
    events,
    writes: observations + candidates + factsCreated + factsUpdated + factsKept + events,
    results,
  }
}
