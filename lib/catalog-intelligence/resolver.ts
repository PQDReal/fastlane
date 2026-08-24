import { parseCanonicalValue } from './measurement-parser'
import { SpecRegistry } from './registry'
import type { RawSpecObservation, SpecResolution } from './types'

function ambiguous(candidateKeys: string[]): SpecResolution {
  return { status: 'AMBIGUOUS', candidateKeys: [...new Set(candidateKeys)].sort() }
}

export function resolveRawSpec(raw: RawSpecObservation, registry: SpecRegistry): SpecResolution {
  const pathMatch = registry.match({
    productType: raw.productType,
    sourceSchema: raw.sourceSchema,
    matchKind: 'PATH',
    value: raw.sourcePath,
  })
  if (pathMatch.outcome === 'AMBIGUOUS') return ambiguous(pathMatch.definitions.map((item) => item.canonicalKey))

  const labelMatch = pathMatch.outcome === 'MATCH' ? null : registry.match({
    productType: raw.productType,
    sourceSchema: raw.sourceSchema,
    matchKind: 'LABEL',
    value: raw.rawKey,
  })
  if (labelMatch?.outcome === 'AMBIGUOUS') return ambiguous(labelMatch.definitions.map((item) => item.canonicalKey))

  const method = pathMatch.outcome === 'MATCH' ? 'PATH' : 'LABEL'
  const definition = pathMatch.outcome === 'MATCH'
    ? pathMatch.definition
    : labelMatch?.outcome === 'MATCH'
      ? labelMatch.definition
      : null
  if (!definition) return { status: 'UNKNOWN_SPEC' }

  // Exact registry matches define the semantic and therefore make a missing
  // display unit deterministic: a number under range_km is already kilometres.
  const parsed = parseCanonicalValue(raw.rawValue, definition, { allowImplicitCanonicalUnit: true })
  if (!parsed.ok) return { status: 'INVALID_VALUE', definition, reason: parsed.reason, method }
  return { status: 'RESOLVED', definition, value: parsed.value, confidence: method === 'PATH' ? 1 : 0.99, method }
}
