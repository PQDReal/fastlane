import { CATALOG_SELECTION_POLICY_VERSION, type CanonicalSelection, type CanonicalValue, type CurrentCanonicalFact, type ResolvedSpecObservation, type SourceAuthority } from './types'

const AUTHORITY: Record<SourceAuthority, number> = {
  AUTO_EXTRACTED: 1,
  OFFICIAL_SECONDARY: 2,
  OFFICIAL_PRIMARY: 3,
  MANUAL_VERIFIED: 4,
}

function valueIdentity(value: CanonicalValue) {
  return JSON.stringify({
    valueType: value.valueType,
    numericValue: value.numericValue,
    textValue: value.textValue,
    booleanValue: value.booleanValue,
    durationSeconds: value.durationSeconds,
    canonicalUnit: value.canonicalUnit,
    comparisonOperator: value.comparisonOperator,
    numericUpperValue: value.numericUpperValue,
    numericTolerance: value.numericTolerance,
  })
}

function sameValue(left: CanonicalValue, right: CanonicalValue, tolerance = 0) {
  if (left.valueType !== right.valueType || left.canonicalUnit !== right.canonicalUnit) return false
  if (left.comparisonOperator !== right.comparisonOperator) return false
  if (left.numericValue !== null && right.numericValue !== null) {
    const samePrimary = Math.abs(left.numericValue - right.numericValue) <= tolerance
    const sameUpper = left.numericUpperValue === null && right.numericUpperValue === null
      || left.numericUpperValue !== null && right.numericUpperValue !== null
      && Math.abs(left.numericUpperValue - right.numericUpperValue) <= tolerance
    const sameTolerance = left.numericTolerance === null && right.numericTolerance === null
      || left.numericTolerance !== null && right.numericTolerance !== null
      && Math.abs(left.numericTolerance - right.numericTolerance) <= tolerance
    return samePrimary && sameUpper && sameTolerance
  }
  return valueIdentity(left) === valueIdentity(right)
}

function stableCandidateOrder(left: ResolvedSpecObservation, right: ResolvedSpecObservation) {
  const authority = AUTHORITY[right.sourceAuthority] - AUTHORITY[left.sourceAuthority]
  if (authority) return authority
  const observed = right.observedAt.localeCompare(left.observedAt)
  if (observed) return observed
  const snapshot = left.snapshotId.localeCompare(right.snapshotId)
  if (snapshot) return snapshot
  const path = left.sourcePath.localeCompare(right.sourcePath)
  return path || left.observationId.localeCompare(right.observationId)
}

function result(input: Omit<CanonicalSelection, 'policyVersion'>): CanonicalSelection {
  return { ...input, policyVersion: CATALOG_SELECTION_POLICY_VERSION }
}

export function selectCanonicalFact(
  current: CurrentCanonicalFact | null,
  inputCandidates: readonly ResolvedSpecObservation[],
): CanonicalSelection {
  const candidates = [...inputCandidates].sort(stableCandidateOrder)
  if (!candidates.length) return result({ action: 'NO_CANDIDATE', selected: null, reason: 'Không có observation hợp lệ.', conflictingObservationIds: [] })

  const definitionKey = candidates[0].definition.canonicalKey
  if (candidates.some((candidate) => candidate.definition.canonicalKey !== definitionKey)) {
    return result({ action: 'CONFLICT', selected: null, reason: 'Selector chỉ chấp nhận observations của cùng một canonical key.', conflictingObservationIds: candidates.map((item) => item.observationId).sort() })
  }
  const contextKey = candidates[0].contextKey
  if (candidates.some((candidate) => candidate.contextKey !== contextKey)) {
    return result({ action: 'CONFLICT', selected: null, reason: 'Selector chỉ chấp nhận observations của cùng một fact context.', conflictingObservationIds: candidates.map((item) => item.observationId).sort() })
  }
  if (current && current.contextKey !== contextKey) {
    return result({ action: 'CONFLICT', selected: null, reason: 'Canonical fact hiện tại và candidate có context khác nhau.', conflictingObservationIds: candidates.map((item) => item.observationId).sort() })
  }

  const tolerance = candidates[0].definition.changeTolerance ?? 0
  const differentFromCurrent = current
    ? candidates.filter((candidate) => !sameValue(candidate.value, current.value, tolerance))
    : []
  if (current?.verificationStatus === 'VERIFIED') {
    return differentFromCurrent.length
      ? result({ action: 'CONFLICT', selected: null, reason: 'Canonical fact đã VERIFIED nên observation khác giá trị không được overwrite.', conflictingObservationIds: differentFromCurrent.map((item) => item.observationId).sort() })
      : result({ action: 'KEEP', selected: candidates[0], reason: 'Observation xác nhận lại canonical fact VERIFIED.', conflictingObservationIds: [] })
  }

  const highestAuthority = AUTHORITY[candidates[0].sourceAuthority]
  const authoritative = candidates.filter((candidate) => AUTHORITY[candidate.sourceAuthority] === highestAuthority)
  const uniqueValues = new Map<string, ResolvedSpecObservation[]>()
  for (const candidate of authoritative) {
    const key = valueIdentity(candidate.value)
    uniqueValues.set(key, [...(uniqueValues.get(key) ?? []), candidate])
  }

  let selected = authoritative[0]
  if (uniqueValues.size > 1) {
    const aggregate = selected.definition.rankingAggregation
    const oneCompleteSnapshot = authoritative.every((candidate) =>
      candidate.snapshotCompleteness === 'FULL'
      && candidate.snapshotId === authoritative[0].snapshotId
      && candidate.sourceVariantKey !== null,
    )
    if (!aggregate || !oneCompleteSnapshot || authoritative.some((candidate) => candidate.value.numericValue === null)) {
      return result({ action: 'CONFLICT', selected: null, reason: 'Các observation cùng mức authority có giá trị khác nhau.', conflictingObservationIds: authoritative.map((item) => item.observationId).sort() })
    }
    selected = [...authoritative].sort((left, right) => {
      const a = left.value.numericValue!
      const b = right.value.numericValue!
      return aggregate === 'MAX' ? b - a || stableCandidateOrder(left, right) : a - b || stableCandidateOrder(left, right)
    })[0]
  }

  if (current && AUTHORITY[selected.sourceAuthority] < AUTHORITY[current.sourceAuthority]) {
    return sameValue(selected.value, current.value, tolerance)
      ? result({ action: 'KEEP', selected, reason: 'Nguồn authority thấp hơn xác nhận cùng giá trị.', conflictingObservationIds: [] })
      : result({ action: 'CONFLICT', selected: null, reason: 'Nguồn authority thấp hơn không được overwrite canonical fact.', conflictingObservationIds: [selected.observationId] })
  }
  if (current && selected.snapshotCompleteness !== 'FULL' && !sameValue(selected.value, current.value, tolerance)) {
    return result({ action: 'CONFLICT', selected: null, reason: 'Partial snapshot không được thay đổi canonical fact.', conflictingObservationIds: [selected.observationId] })
  }
  if (!current) return result({ action: 'CREATE', selected, reason: 'Tạo canonical fact từ observation hợp lệ có authority cao nhất.', conflictingObservationIds: [] })
  if (sameValue(selected.value, current.value, tolerance)) return result({ action: 'KEEP', selected, reason: 'Giá trị canonical không đổi; chỉ cập nhật last_seen.', conflictingObservationIds: [] })
  return result({ action: 'UPDATE', selected, reason: 'Observation mới hợp lệ và có authority đủ để cập nhật canonical fact.', conflictingObservationIds: [] })
}
