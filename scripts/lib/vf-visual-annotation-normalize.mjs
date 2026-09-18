const VEHICLE_MODEL_PATTERN = /\b(VinFast\s+)?VF\s+(MPV\s+7|e34|3|5|6|7|8|9)\b/giu

function normalizedModel(value) {
  return String(value || '').toUpperCase().replace(/\s+/g, ' ').trim()
}

export function isCompatibleVehicleMention(mention, expectedModel) {
  const found = normalizedModel(mention).replace(/^VINFAST\s+/, '')
  const expected = normalizedModel(expectedModel).replace(/^VINFAST\s+/, '')
  return expected === found || expected.startsWith(`${found} -`)
}

export function normalizeAnnotationVehicleMentions(summary, expectedModels) {
  const models = [...new Set(expectedModels.map(String).filter(Boolean))]
  if (models.length !== 1) {
    return { changed: false, summary, reason: 'AMBIGUOUS_EXPECTED_MODELS', replacements: [] }
  }
  const expectedModel = models[0]
  const replacements = []
  const normalizedSummary = String(summary || '').replace(
    VEHICLE_MODEL_PATTERN,
    (full, vinFastPrefix) => {
      if (isCompatibleVehicleMention(full, expectedModel)) return full
      const replacement = `${vinFastPrefix || ''}${expectedModel}`
      replacements.push({ from: full, to: replacement })
      return replacement
    },
  )
  return {
    changed: normalizedSummary !== summary,
    summary: normalizedSummary,
    reason: replacements.length ? 'MODEL_MENTION_RECONCILED' : 'NO_CONFLICT',
    replacements,
  }
}
