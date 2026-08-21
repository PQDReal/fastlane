const NUMERIC_THRESHOLD = /\d{1,3}(?:[.\s]\d{3})+\s*(?:km|kil[oô]m[eé]t|kilomet(?:er)?s?|n[aăâ]m|years?|th[aá]ng|months?|ng[aà]y|days?|ph[uú]t|minutes?)\b|\d+(?:[.,]\d+)?\s*(?:km|kil[oô]m[eé]t|kilomet(?:er)?s?|n[aăâ]m|years?|th[aá]ng|months?|ng[aà]y|days?|ph[uú]t|minutes?)\b/giu

function whitespaceFlexiblePattern(value) {
  return String(value || '')
    .trim()
    .split(/\s+/u)
    .filter(Boolean)
    .map(part => part.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'))
    .join('\\s+')
}

function validBounds(text, bounds) {
  return Number.isInteger(bounds?.matchStart)
    && Number.isInteger(bounds?.matchEnd)
    && bounds.matchStart >= 0
    && bounds.matchEnd > bounds.matchStart
    && bounds.matchEnd <= text.length
}

/** Resolve the exact occurrence represented by a fact, not another equal value nearby. */
export function resolveMatchedValueBounds(text, rawValue, bounds = null) {
  const source = String(text || '')
  if (validBounds(source, bounds)) return { matchStart: bounds.matchStart, matchEnd: bounds.matchEnd }

  const pattern = whitespaceFlexiblePattern(rawValue)
  const matches = pattern ? [...source.matchAll(new RegExp(pattern, 'giu'))] : []
  if (!matches.length) return null

  const preferredIndex = Number.isInteger(bounds?.preferredIndex)
    ? bounds.preferredIndex
    : Math.min(240, Math.floor(source.length / 2))
  const match = matches.sort((left, right) => (
    Math.abs(left.index - preferredIndex) - Math.abs(right.index - preferredIndex)
  ))[0]
  return { matchStart: match.index, matchEnd: match.index + match[0].length }
}

/** Excludes headings, policies and usage markers that occur after the current fact. */
export function statementPrefixThroughValue(text, rawValue, bounds = null) {
  const source = String(text || '')
  const match = resolveMatchedValueBounds(source, rawValue, bounds)
  return match ? source.slice(0, match.matchEnd) : source
}

export function inferBatteryChemistry(statement, precedingText = '') {
  const scopes = [String(statement || ''), String(precedingText || '').slice(-600)]
  for (const scope of scopes) {
    if (/pin\s+khác\s*\(\s*không\s+phải\s+pin\s+LFP\s*\)|không\s+phải\s+pin\s+LFP/iu.test(scope)) {
      return 'non_lfp'
    }
    if (/pin\s+LFP/iu.test(scope)) return 'lfp'
  }
  return 'unspecified'
}

const POLICY_SECTION_MARKERS = [
  ['vehicle', /thời\s+hạn\s+bảo\s+hành\s+ô\s*tô|đối\s+với\s+xe.{0,120}điều\s+kiện\s+sử\s+dụng\s+tiêu\s+chuẩn\s*:/iu],
  ['battery', /pin\s+cao\s+áp(?:\s+pin\s+cao\s+áp)?.{0,180}?(?:mua\s+theo\s+xe\s+mới|sử\s+dụng\s+tiêu\s+chuẩn|dịch\s+vụ\s+thương\s+mại)\s*:|(?:^|\s)[•]?\s*pin\s*:/iu],
  ['battery_12v', /ắc\s*[-–—]?\s*quy(?:\s+12\s*v)?(?:\s*:|\s+(?=ô\s*tô))/iu],
  ['corrosion', /(?:gỉ|rỉ)\s+sét\s*(?::|điều\s+kiện)/iu],
  ['paint', /sơn\s+ngoại\s+thất\s*(?::|điều\s+kiện)/iu],
  ['suspension', /các\s+bộ\s+phận\s+treo\s*(?::|sử\s+dụng)/iu],
  ['tire', /lốp\s+xe\s*(?::|lốp\s+được)/iu],
  ['replacement_part', /bảo\s+hành\s+phụ\s+tùng(?:\s+thay\s+thế)?/iu],
  ['accessory', /bảo\s+hành\s+phụ\s+kiện/iu],
]

export function inferPolicySectionSubject(precedingText = '') {
  const text = String(precedingText || '')
  let selected = null
  let selectedIndex = -1
  for (const [subject, pattern] of POLICY_SECTION_MARKERS) {
    const globalPattern = new RegExp(pattern.source, 'giu')
    for (const match of text.matchAll(globalPattern)) {
      if (match.index >= selectedIndex) {
        selected = subject
        selectedIndex = match.index
      }
    }
  }
  return selected
}

function thresholdBounds(text) {
  return [...String(text || '').matchAll(NUMERIC_THRESHOLD)]
    .map(match => ({ start: match.index, end: match.index + match[0].length }))
}

const MODEL_SIGNAL = /\b(?:VF\s*(?:e34|EC\s*Van|MPV\s*7|[3-9])|Fadil|President|Lux\s+(?:A|SA)\s*2[.,]?0|(?:Minio|Nerio|Herio|Limo)\s+Green|L(?:ạc|ac)\s+H(?:ồng|ong)\s+900\s*LX)\b/iu

/**
 * Returns the table/list row prefix that owns the current threshold.
 *
 * A warranty row commonly has two thresholds joined by "hoặc". The second
 * threshold therefore shares the first threshold's model prefix. A threshold
 * following arbitrary model text starts a new row and must not inherit models
 * from the previous row.
 */
export function valueLocalRowPrefix(text, rawValue, bounds = null) {
  const source = String(text || '')
  const currentMatch = resolveMatchedValueBounds(source, rawValue, bounds)
  if (!currentMatch) return source

  const thresholds = thresholdBounds(source)
  const currentThresholdIndex = thresholds.findIndex(threshold => (
    threshold.start <= currentMatch.matchStart && threshold.end >= currentMatch.matchEnd
  ))
  if (currentThresholdIndex < 0) return source.slice(0, currentMatch.matchEnd)

  let rowStart = 0
  for (let index = currentThresholdIndex - 1; index >= 0; index -= 1) {
    const previous = thresholds[index]
    const next = thresholds[index + 1]
    if (MODEL_SIGNAL.test(source.slice(previous.end, next.start))) {
      rowStart = previous.end
      break
    }
  }

  const row = source
    .slice(rowStart, currentMatch.matchEnd)
    .replace(/^[\s|:;,\.\-–—)]+/u, '')
    .trim()
  const models = [...row.matchAll(new RegExp(MODEL_SIGNAL.source, 'giu'))]
  if (!models.length) return row

  let clusterStart = models.at(-1).index
  for (let index = models.length - 2; index >= 0; index -= 1) {
    const current = models[index]
    const next = models[index + 1]
    const gap = next.index - (current.index + current[0].length)
    if (gap > 96) break
    clusterStart = current.index
  }
  return row.slice(clusterStart).trim()
}
