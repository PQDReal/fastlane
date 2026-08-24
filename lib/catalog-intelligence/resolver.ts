import { normalizeProductSearchText } from '../catalog/search'
import { parseCanonicalFacts } from './measurement-parser'
import { SpecRegistry } from './registry'
import type { RawSpecObservation, SpecResolution } from './types'

function ambiguous(candidateKeys: string[]): SpecResolution {
  return { status: 'AMBIGUOUS', candidateKeys: [...new Set(candidateKeys)].sort() }
}

export function resolveRawSpec(raw: RawSpecObservation, registry: SpecRegistry): SpecResolution {
  const normalizedKey = normalizeProductSearchText(raw.rawKey)
  if (normalizedKey === 'mau sac') {
    return {
      status: 'IGNORED',
      reasonCode: 'DUPLICATE_STRUCTURED_SOURCE',
      reason: 'Màu xe được quản lý bởi bảng biến thể/màu; không tạo technical fact trùng lặp từ chuỗi legacy.',
    }
  }
  if (normalizedKey === 'tien dat coc') {
    return {
      status: 'IGNORED',
      reasonCode: 'NON_TECHNICAL_COMMERCE',
      reason: 'Tiền đặt cọc là dữ liệu thương mại, không thuộc technical specification.',
    }
  }

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
  const matched = pathMatch.outcome === 'MATCH'
    ? pathMatch
    : labelMatch?.outcome === 'MATCH'
      ? labelMatch
      : null
  if (!matched) return { status: 'UNKNOWN_SPEC' }
  const definition = matched.definition

  if (typeof raw.rawValue === 'string' && normalizeProductSearchText(raw.rawValue) === 'tbd') {
    return {
      status: 'IGNORED',
      reasonCode: 'PENDING_OFFICIAL_VALUE',
      reason: 'Nguồn chính thức chưa công bố giá trị; placeholder TBD không được tạo thành fact.',
    }
  }

  const parsed = parseCanonicalFacts(raw.rawValue, definition, {
    implicitUnit: matched.alias.implicitUnit,
    qualifiers: matched.alias.qualifiers,
  })
  if (!parsed.ok) return { status: 'INVALID_VALUE', definition, reason: parsed.reason, method }
  return { status: 'RESOLVED', definition, value: parsed.facts[0].value, facts: parsed.facts, confidence: method === 'PATH' ? 1 : 0.99, method }
}
